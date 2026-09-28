import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import {
  computeStats,
  levelFromXp,
  type AttemptDoc,
  type ProgressDoc,
  type SubjectDoc,
  type SubjectStatsDoc,
  type UserDoc,
} from '@shared';
import { db } from '../../lib/firebase';
import { useDoc, useQuery, type WithId } from '../../lib/hooks';
import { BackLink, Badges, Bar, Card, Ring, ScoreText, Spinner, wordBadges } from '../../components/ui';
import { lastActive, timeAgo } from './AdminStudents';

type SubjectRow = WithId<SubjectDoc> & { weekId: string };

export default function AdminStudent() {
  const { uid = '' } = useParams();
  const user = useDoc<UserDoc>(doc(db, 'users', uid), [uid]);
  const stats = useQuery<SubjectStatsDoc>(collection(db, 'users', uid, 'subjectStats'), [uid]);
  const progress = useQuery<ProgressDoc>(collection(db, 'users', uid, 'progress'), [uid]);
  const attempts = useQuery<AttemptDoc>(query(collection(db, 'users', uid, 'attempts'), orderBy('createdAt', 'desc'), limit(40)), [uid]);
  const subjects = useAllSubjects();

  if (user === undefined || !stats || !progress || !attempts || !subjects) return <Spinner />;
  if (!user) return <p>Niet gevonden</p>;

  const statsById = new Map(stats.map((s) => [s.id, s]));
  const { level } = levelFromXp(user.xp ?? 0);
  const week7 = attempts.filter((a) => Date.now() - a.createdAt < 7 * 24 * 3600_000).length;

  return (
    <div className="space-y-6">
      <BackLink to="/beheer/leerlingen">Leerlingen</BackLink>
      <div>
        <h1 className="text-3xl font-extrabold">{user.name || user.email}</h1>
        <p className="text-muted">
          {user.email} · laatst actief {timeAgo(lastActive(user))}
        </p>
      </div>

      <Card className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
        <Stat label="Level" value={level} sub={`${user.xp ?? 0} XP`} />
        <Stat label="Vragen gemaakt" value={user.answeredTotal ?? 0} sub={`${week7}${attempts.length >= 40 ? '+' : ''} pogingen deze week`} />
        <Stat label="Reeks" value={`🔥 ${user.streak ?? 0}`} sub={`record ${user.bestStreak ?? 0}`} />
        <Stat label="Woorden gekend" value={user.wordsKnown ?? 0} />
      </Card>

      <section>
        <h2 className="text-xl font-bold mb-3">Per vak</h2>
        <div className="space-y-3">
          {stats.length === 0 && <p className="text-muted">Nog geen vragen gemaakt.</p>}
          {stats.map((st) => {
            const subject = subjects.find((s) => s.weekId === st.weekId && s.id === st.subjectId);
            return (
              <SubjectProgress
                key={st.id}
                name={subject?.name ?? st.subjectId}
                subject={subject}
                stats={statsById.get(st.id)}
                progress={progress.filter((p) => p.weekId === st.weekId && p.subjectId === st.subjectId)}
              />
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-3">Recente antwoorden</h2>
        {attempts.length === 0 ? <p className="text-muted">Nog geen antwoorden.</p> : <AttemptList attempts={attempts} subjects={subjects} />}
      </section>

      <section>
        <h2 className="text-xl font-bold mb-3">Badges</h2>
        <Badges earned={[...(user.badges ?? []), ...wordBadges(user.wordsKnown ?? 0)]} />
      </section>
    </div>
  );
}

/** All subjects of all test weeks, with their week id (subject ids repeat across weeks). */
function useAllSubjects(): SubjectRow[] | undefined {
  const [rows, setRows] = useState<SubjectRow[]>();
  useEffect(() => {
    (async () => {
      const weeks = await getDocs(collection(db, 'testWeeks'));
      const lists = await Promise.all(
        weeks.docs.map(async (w) =>
          (await getDocs(collection(db, 'testWeeks', w.id, 'subjects'))).docs.map((d) => ({
            id: d.id,
            weekId: w.id,
            ...(d.data() as SubjectDoc),
          })),
        ),
      );
      setRows(lists.flat());
    })().catch(() => setRows([]));
  }, []);
  return rows;
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div>
      <p className="text-3xl font-display font-extrabold">{value}</p>
      <p className="text-sm">{label}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

function SubjectProgress({
  name,
  subject,
  stats,
  progress,
}: {
  name: string;
  subject?: SubjectRow;
  stats?: SubjectStatsDoc;
  progress: WithId<ProgressDoc>[];
}) {
  const st = computeStats(stats, subject?.activeQuestionCount ?? 0);
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-4">
        <Ring value={st.completion} />
        <div className="flex-1">
          <p className="font-bold text-lg">{name}</p>
          <p className="text-sm text-muted">
            {st.answered} van {st.total} vragen · {st.answeredNl} in het Nederlands
          </p>
          <p className="text-sm">
            Score <ScoreText score={st.totalScore} /> · 🇳🇱 <ScoreText score={st.dutchScore} />
          </p>
        </div>
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-bold text-pen">Per onderwerp</summary>
        <ul className="mt-2 space-y-2">
          {(subject?.topicTree ?? []).flatMap((topic) =>
            topic.subtopics.map((sub) => {
              const ps = progress.filter((p) => p.topicId === topic.id && p.subtopicId === sub.id);
              if (ps.length === 0) return null;
              const best = ps.map((p) => Math.max(p.bestEn ?? 0, p.bestNl ?? 0));
              const avg = Math.round(best.reduce((a, b) => a + b, 0) / best.length);
              const nl = ps.filter((p) => p.bestNl != null);
              const avgNl = nl.length ? Math.round(nl.reduce((a, p) => a + (p.bestNl ?? 0), 0) / nl.length) : null;
              return (
                <li key={`${topic.id}/${sub.id}`} className="text-sm">
                  <div className="flex justify-between gap-3">
                    <span>
                      <span className="text-muted">{topic.nameNl} ›</span> {sub.nameNl}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {ps.length} gemaakt · <ScoreText score={avg} /> · 🇳🇱 <ScoreText score={avgNl} />
                    </span>
                  </div>
                  <div className="mt-1">
                    <Bar value={avg} />
                  </div>
                </li>
              );
            }),
          )}
        </ul>
      </details>
    </Card>
  );
}

function AttemptList({ attempts, subjects }: { attempts: WithId<AttemptDoc>[]; subjects: SubjectRow[] }) {
  // Older attempts don't store the question text; look those up once.
  const [texts, setTexts] = useState<Record<string, string>>({});
  useEffect(() => {
    const missing = [...new Set(attempts.filter((a) => !a.questionNl).map((a) => `${a.weekId}/${a.subjectId}/${a.questionId}`))];
    missing.forEach((key) => {
      const [w, s, q] = key.split('/');
      getDoc(doc(db, 'testWeeks', w, 'subjects', s, 'questions', q))
        .then((d) => setTexts((t) => ({ ...t, [q]: (d.data()?.questionNl as string) ?? '(vraag verwijderd)' })))
        .catch(() => {});
    });
  }, [attempts]);

  return (
    <ul className="divide-y divide-rule bg-sheet border border-rule rounded-2xl">
      {attempts.map((a) => (
        <li key={a.id} className="px-4 py-3">
          <details>
            <summary className="cursor-pointer list-none">
              <div className="flex items-center gap-3 text-sm text-muted">
                <span>{new Date(a.createdAt).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span>{subjects.find((s) => s.weekId === a.weekId && s.id === a.subjectId)?.name ?? a.subjectId}</span>
                <span aria-hidden>{a.lang === 'nl' ? '🇳🇱' : '🇬🇧'}</span>
                <span className="ml-auto">
                <ScoreText score={a.score} />
              </span>
              </div>
              <p className="mt-1">{a.questionNl ?? texts[a.questionId] ?? '…'}</p>
            </summary>
            <div className="mt-2 space-y-2 text-sm">
              <p className="ruled rounded-lg px-3 whitespace-pre-line" lang={a.lang}>
                {a.answer}
              </p>
              <p className="text-muted">
                Inhoud {a.contentScore}
                {a.languageScore != null && ` · Taal ${a.languageScore}`}
              </p>
              {a.feedbackNl && <p className="text-ink-soft">{a.feedbackNl}</p>}
              {a.correctedAnswerNl && (
                <p>
                  <b>Verbeterd:</b> {a.correctedAnswerNl}
                </p>
              )}
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
