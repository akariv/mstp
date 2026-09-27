import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { deleteObject, ref as storageRef, uploadBytesResumable } from 'firebase/storage';
import { questionFingerprint, type JobDoc, type MaterialDoc, type QuestionAnswerDoc, type QuestionDoc, type SubjectDoc, type TestWeekDoc } from '@shared';
import { api, db, storage } from '../../lib/firebase';
import { useDoc, useQuery, type WithId } from '../../lib/hooks';
import { BackLink, Button, Card, Spinner } from '../../components/ui';

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.heic,.txt,.md,.docx,.csv,.html';

async function sha256(file: File): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function AdminSubject() {
  const { weekId = '', subjectId = '' } = useParams();
  const sPath = ['testWeeks', weekId, 'subjects', subjectId] as const;
  const week = useDoc<TestWeekDoc>(doc(db, 'testWeeks', weekId), [weekId]);
  const subject = useDoc<SubjectDoc>(doc(db, ...sPath), [weekId, subjectId]);
  const materials = useQuery<MaterialDoc>(query(collection(db, ...sPath, 'materials'), orderBy('uploadedAt')), [weekId, subjectId]);

  if (subject === undefined || week === undefined) return <Spinner />;
  if (!subject || !week) return <p>Niet gevonden</p>;

  return (
    <div className="space-y-6">
      <BackLink to="/beheer">Beheer</BackLink>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <p className="text-muted">{week.name}</p>
          <h1 className="text-3xl font-extrabold">{subject.name}</h1>
        </div>
        <Button
          variant="ghost"
          onClick={async () => {
            const n = prompt('Naam (NL)', subject.name);
            if (!n?.trim()) return;
            const e = prompt('Name (EN)', subject.nameEn ?? '');
            await updateDoc(doc(db, ...sPath), { name: n.trim(), nameEn: e?.trim() || null });
          }}
        >
          Hernoem
        </Button>
      </div>

      <Materials weekId={weekId} subjectId={subjectId} materials={materials} />
      <TestMaker weekId={weekId} subjectId={subjectId} hasMaterials={(materials?.length ?? 0) > 0} />
      <Questions weekId={weekId} subjectId={subjectId} subject={subject} />
    </div>
  );
}

function Materials({ weekId, subjectId, materials }: { weekId: string; subjectId: string; materials?: WithId<MaterialDoc>[] }) {
  const [uploads, setUploads] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const col = collection(db, 'testWeeks', weekId, 'subjects', subjectId, 'materials');

  const upload = async (files: FileList | null) => {
    if (!files) return;
    setMsg(null);
    for (const file of Array.from(files)) {
      const hash = await sha256(file);
      if (materials?.some((m) => m.sha256 === hash)) {
        setMsg(`"${file.name}" is al geüpload (zelfde inhoud) en is overgeslagen.`);
        continue;
      }
      const id = doc(col).id;
      const path = `materials/${weekId}/${subjectId}/${id}-${file.name.replace(/[^\w.\-]+/g, '_')}`;
      const task = uploadBytesResumable(storageRef(storage, path), file, { contentType: file.type || undefined });
      await new Promise<void>((resolve, reject) =>
        task.on(
          'state_changed',
          (s) => setUploads((u) => ({ ...u, [file.name]: Math.round((100 * s.bytesTransferred) / s.totalBytes) })),
          reject,
          () => resolve(),
        ),
      );
      await setDoc(doc(col, id), {
        fileName: file.name,
        storagePath: path,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        sha256: hash,
        uploadedAt: Date.now(),
      } satisfies MaterialDoc);
      setUploads(({ [file.name]: _, ...rest }) => rest);
    }
  };

  const remove = async (m: WithId<MaterialDoc>) => {
    if (!confirm(`Verwijder ${m.fileName}? Bestaande vragen blijven bewaard.`)) return;
    await deleteObject(storageRef(storage, m.storagePath)).catch(() => {});
    await deleteDoc(doc(col, m.id));
  };

  const statusLabel: Record<string, string> = {
    pending: 'in de wachtrij',
    running: 'wordt geanalyseerd…',
    done: 'geanalyseerd',
    error: 'fout',
  };

  return (
    <Card className="space-y-3">
      <h2 className="font-bold text-xl">Lesstof</h2>
      <p className="text-sm text-muted">PDF (ook gescand), foto's, Word, tekst. Bestanden die al geanalyseerd zijn worden niet opnieuw geanalyseerd.</p>
      <label
        className="block border-2 border-dashed border-rule rounded-xl p-6 text-center cursor-pointer hover:border-pen"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          upload(e.dataTransfer.files);
        }}
      >
        <input type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => upload(e.target.files)} />
        <span className="font-bold text-pen">Kies bestanden</span> of sleep ze hierheen
      </label>
      {Object.entries(uploads).map(([name, pct]) => (
        <p key={name} className="text-sm">
          {name}: {pct}%
        </p>
      ))}
      {msg && <p className="text-sm text-bad">{msg}</p>}
      <ul className="divide-y divide-rule">
        {(materials ?? []).map((m) => (
          <li key={m.id} className="py-2 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-bold truncate">{m.fileName}</p>
              <p className="text-sm text-muted">
                {m.size < 1024 * 1024 ? `${Math.ceil(m.size / 1024)} KB` : `${(m.size / 1024 / 1024).toFixed(1)} MB`} · {m.extraction ? statusLabel[m.extraction.status] : 'nog niet geanalyseerd'}
                {m.extraction?.title ? ` · ${m.extraction.title}` : ''}
                {m.extraction?.error ? ` · ${m.extraction.error}` : ''}
              </p>
            </div>
            <Button variant="ghost" onClick={() => remove(m)} aria-label={`Verwijder ${m.fileName}`}>
              ×
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TestMaker({ weekId, subjectId, hasMaterials }: { weekId: string; subjectId: string; hasMaterials: boolean }) {
  const [force, setForce] = useState(false);
  const [allowDelete, setAllowDelete] = useState(false);
  const [perSub, setPerSub] = useState(6);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const jobs = useQuery<JobDoc>(
    query(collection(db, 'jobs'), where('weekId', '==', weekId), where('subjectId', '==', subjectId), orderBy('createdAt', 'desc'), limit(3)),
    [weekId, subjectId],
  );

  const run = async () => {
    if (allowDelete && !confirm('Vervang-modus: bestaande vragen die niet opnieuw gemaakt worden, worden gearchiveerd. Doorgaan?')) return;
    setBusy(true);
    setError(null);
    try {
      await api.startTestMaker({ weekId, subjectId, forceReanalyze: force, allowDeleteQuestions: allowDelete, questionsPerSubtopic: perSub });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const running = jobs?.some((j) => !['done', 'error'].includes(j.status));

  return (
    <Card className="space-y-4">
      <h2 className="font-bold text-xl">Toetsmaker</h2>
      <p className="text-sm text-muted max-w-prose">
        Analyseert de lesstof, maakt een overzicht van onderwerpen en genereert oefenvragen met modelantwoorden. Standaard worden alleen nieuwe vragen
        toegevoegd.
      </p>
      <div className="grid gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
          Alle bestanden opnieuw analyseren (ook als ze al geanalyseerd zijn)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={allowDelete} onChange={(e) => setAllowDelete(e.target.checked)} />
          <span>
            Vervang-modus: <span className="text-bad">oude vragen archiveren</span> en een nieuwe set maken
          </span>
        </label>
        <label className="flex items-center gap-2">
          Vragen per subonderwerp
          <input
            type="number"
            min={2}
            max={20}
            value={perSub}
            onChange={(e) => setPerSub(Number(e.target.value))}
            className="w-20 rounded-lg border-2 border-rule bg-sheet px-2 py-1"
          />
        </label>
      </div>
      <Button onClick={run} disabled={busy || running || !hasMaterials}>
        {running ? 'Bezig…' : 'Genereer vragen'}
      </Button>
      {error && <p className="text-bad font-bold">{error}</p>}
      {(jobs ?? []).map((j) => (
        <details key={j.id} open={!['done', 'error'].includes(j.status)} className="border border-rule rounded-xl p-3">
          <summary className="cursor-pointer">
            <span className="font-bold">{new Date(j.createdAt).toLocaleString('nl-NL')}</span> —{' '}
            <span className={j.status === 'error' ? 'text-bad font-bold' : j.status === 'done' ? 'text-good font-bold' : 'hl'}>{j.status}</span>
            {j.status === 'extracting' && ` (${j.materialsTotal - j.materialsSkipped - j.pending}/${j.materialsTotal - j.materialsSkipped} bestanden)`}
            {j.status === 'generating' && j.subtopicsTotal > 0 && ` (${j.subtopicsDone}/${j.subtopicsTotal} subonderwerpen)`}
            {j.status === 'done' && ` +${j.questionsAdded} vragen, ${j.questionsArchived} gearchiveerd`}
          </summary>
          <pre className="mt-2 text-xs whitespace-pre-wrap text-ink-soft max-h-60 overflow-auto">{j.log.join('\n')}</pre>
        </details>
      ))}
    </Card>
  );
}

function Questions({ weekId, subjectId, subject }: { weekId: string; subjectId: string; subject: SubjectDoc }) {
  const [showArchived, setShowArchived] = useState(false);
  const questions = useQuery<QuestionDoc>(
    query(collection(db, 'testWeeks', weekId, 'subjects', subjectId, 'questions'), orderBy('createdAt')),
    [weekId, subjectId],
  );
  if (!questions) return <Spinner />;
  const shown = questions.filter((q) => showArchived || q.status === 'active');
  const archived = questions.length - questions.filter((q) => q.status === 'active').length;

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-bold text-xl flex-1">Vragen ({questions.length - archived})</h2>
        {archived > 0 && (
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Toon gearchiveerd ({archived})
          </label>
        )}
      </div>
      {(subject.topicTree ?? []).map((topic) => (
        <div key={topic.id}>
          <h3 className="font-bold text-lg">{topic.nameNl}</h3>
          {topic.subtopics.map((sub) => {
            const qs = shown.filter((q) => q.topicId === topic.id && q.subtopicId === sub.id);
            return (
              <div key={sub.id} className="ml-2 mt-2">
                <p className="font-bold text-ink-soft">
                  {sub.nameNl} <span className="text-muted font-normal">({qs.length})</span>
                </p>
                <p className="text-sm text-muted">{sub.descriptionNl}</p>
                <ul className="mt-1 space-y-1">
                  {qs.map((q) => (
                    <QuestionRow key={q.id} weekId={weekId} subjectId={subjectId} q={q} />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ))}
    </Card>
  );
}

function QuestionRow({ weekId, subjectId, q }: { weekId: string; subjectId: string; q: WithId<QuestionDoc> }) {
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState<QuestionAnswerDoc | null>(null);
  const [edit, setEdit] = useState<{ questionNl: string; questionEn: string; difficulty: number; detailedAnswerNl: string; detailedAnswerEn: string } | null>(null);
  const qRef = doc(db, 'testWeeks', weekId, 'subjects', subjectId, 'questions', q.id);
  const aRef = doc(qRef, 'private', 'answer');

  const toggle = async () => {
    if (!open && !answer) setAnswer(((await getDoc(aRef)).data() as QuestionAnswerDoc) ?? null);
    setOpen(!open);
  };

  const save = async () => {
    if (!edit) return;
    await updateDoc(qRef, {
      questionNl: edit.questionNl,
      questionEn: edit.questionEn,
      difficulty: edit.difficulty,
      fingerprint: questionFingerprint(edit.questionNl),
    });
    await updateDoc(aRef, { detailedAnswerNl: edit.detailedAnswerNl, detailedAnswerEn: edit.detailedAnswerEn });
    setAnswer((a) => (a ? { ...a, detailedAnswerNl: edit.detailedAnswerNl, detailedAnswerEn: edit.detailedAnswerEn } : a));
    setEdit(null);
  };

  const area = 'w-full rounded-lg border-2 border-rule bg-sheet p-2 text-sm';
  return (
    <li className={`border border-rule rounded-lg ${q.status === 'archived' ? 'opacity-50' : ''}`}>
      <button onClick={toggle} className="w-full text-left px-3 py-2 flex gap-3">
        <span className="text-xs text-muted pt-1 shrink-0">{'●'.repeat(q.difficulty)}</span>
        <span className="flex-1">{q.questionNl}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 text-sm">
          {edit ? (
            <>
              <textarea className={area} value={edit.questionNl} onChange={(e) => setEdit({ ...edit, questionNl: e.target.value })} />
              <textarea className={area} value={edit.questionEn} onChange={(e) => setEdit({ ...edit, questionEn: e.target.value })} />
              <label className="flex gap-2 items-center">
                Niveau
                <input type="number" min={1} max={5} value={edit.difficulty} onChange={(e) => setEdit({ ...edit, difficulty: Number(e.target.value) })} className="w-16 rounded border-2 border-rule px-1" />
              </label>
              <textarea className={area} rows={4} value={edit.detailedAnswerNl} onChange={(e) => setEdit({ ...edit, detailedAnswerNl: e.target.value })} />
              <textarea className={area} rows={4} value={edit.detailedAnswerEn} onChange={(e) => setEdit({ ...edit, detailedAnswerEn: e.target.value })} />
              <div className="flex gap-2">
                <Button onClick={save}>Opslaan</Button>
                <Button variant="ghost" onClick={() => setEdit(null)}>
                  Annuleren
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-pen italic">{q.questionEn}</p>
              {answer && (
                <>
                  <p className="whitespace-pre-line">
                    <b>Antwoord:</b> {answer.detailedAnswerNl}
                  </p>
                  <ul className="list-disc pl-5 text-ink-soft">
                    {answer.keyPoints.map((k, i) => (
                      <li key={i}>{k}</li>
                    ))}
                  </ul>
                  <p className="text-muted">
                    <b>Beoordeling:</b> {answer.rubric}
                  </p>
                </>
              )}
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() =>
                    setEdit({
                      questionNl: q.questionNl,
                      questionEn: q.questionEn,
                      difficulty: q.difficulty,
                      detailedAnswerNl: answer?.detailedAnswerNl ?? '',
                      detailedAnswerEn: answer?.detailedAnswerEn ?? '',
                    })
                  }
                >
                  Bewerk
                </Button>
                <Button
                  variant={q.status === 'active' ? 'danger' : 'secondary'}
                  onClick={async () => {
                    const archiving = q.status === 'active';
                    await updateDoc(qRef, { status: archiving ? 'archived' : 'active' });
                    await updateDoc(doc(db, 'testWeeks', weekId, 'subjects', subjectId), { activeQuestionCount: increment(archiving ? -1 : 1) });
                  }}
                >
                  {q.status === 'active' ? 'Archiveer' : 'Herstel'}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}
