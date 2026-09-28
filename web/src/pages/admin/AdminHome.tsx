import { useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, deleteDoc, doc, getDoc, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import { slugify, type SubjectDoc, type TestWeekDoc } from '@shared';
import { db } from '../../lib/firebase';
import { useQuery, type WithId } from '../../lib/hooks';
import { Button, Card, Spinner } from '../../components/ui';

const input = 'rounded-lg border-2 border-rule bg-sheet px-3 py-2 focus:border-pen outline-none';

async function uniqueId(path: string[], name: string) {
  const base = slugify(name);
  let id = base;
  for (let i = 2; (await getDoc(doc(db, path.join('/'), id))).exists(); i++) id = `${base}-${i}`;
  return id;
}

export default function AdminHome() {
  const weeks = useQuery<TestWeekDoc>(query(collection(db, 'testWeeks'), orderBy('order')), []);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');

  const addWeek = async () => {
    if (!name.trim()) return;
    const id = await uniqueId(['testWeeks'], name);
    await setDoc(doc(db, 'testWeeks', id), {
      name: name.trim(),
      order: (weeks?.length ?? 0) + 1,
      ...(startDate ? { startDate } : {}),
    } satisfies TestWeekDoc);
    setName('');
    setStartDate('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">Beheer</h1>
        <div className="flex gap-2">
          <Link to="/beheer/leerlingen">
            <Button>Voortgang leerlingen</Button>
          </Link>
          <Link to="/beheer/gebruikers">
            <Button variant="secondary">Gebruikers</Button>
          </Link>
        </div>
      </div>

      <Card className="space-y-3">
        <h2 className="font-bold text-lg">Nieuwe toetsweek</h2>
        <div className="flex flex-wrap gap-2">
          <input className={`${input} flex-1 min-w-48`} placeholder="Toetsweek 1 (november)" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={input} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-label="Startdatum" />
          <Button onClick={addWeek} disabled={!name.trim()}>
            Toevoegen
          </Button>
        </div>
      </Card>

      {weeks === undefined ? <Spinner /> : weeks.map((w) => <WeekAdmin key={w.id} week={w} />)}
    </div>
  );
}

function WeekAdmin({ week }: { week: WithId<TestWeekDoc> }) {
  const subjects = useQuery<SubjectDoc>(query(collection(db, 'testWeeks', week.id, 'subjects'), orderBy('order')), [week.id]);
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');

  const addSubject = async () => {
    if (!name.trim()) return;
    const id = await uniqueId(['testWeeks', week.id, 'subjects'], name);
    await setDoc(doc(db, 'testWeeks', week.id, 'subjects', id), {
      name: name.trim(),
      nameEn: nameEn.trim() || undefined,
      order: (subjects?.length ?? 0) + 1,
      activeQuestionCount: 0,
    } as SubjectDoc);
    setName('');
    setNameEn('');
  };

  const rename = async () => {
    const n = prompt('Naam van de toetsweek', week.name);
    if (n?.trim()) await updateDoc(doc(db, 'testWeeks', week.id), { name: n.trim() });
  };

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="font-bold text-xl flex-1">{week.name}</h2>
        <span className="text-sm text-muted">{week.startDate}</span>
        <Button variant="ghost" onClick={rename}>
          Hernoem
        </Button>
        {subjects?.length === 0 && (
          <Button variant="danger" onClick={() => confirm(`Verwijder ${week.name}?`) && deleteDoc(doc(db, 'testWeeks', week.id))}>
            Verwijder
          </Button>
        )}
      </div>
      <ul className="divide-y divide-rule border border-rule rounded-xl">
        {(subjects ?? []).map((s) => (
          <li key={s.id}>
            <Link to={`/beheer/w/${week.id}/s/${s.id}`} className="flex justify-between px-4 py-2.5 hover:bg-pen-soft">
              <span className="font-bold">
                {s.name} {s.nameEn && <span className="text-muted font-normal">({s.nameEn})</span>}
              </span>
              <span className="text-sm text-muted">{s.activeQuestionCount ?? 0} vragen ›</span>
            </Link>
          </li>
        ))}
        {subjects?.length === 0 && <li className="px-4 py-2.5 text-muted">Nog geen vakken</li>}
      </ul>
      <div className="flex flex-wrap gap-2">
        <input className={`${input} flex-1 min-w-40`} placeholder="Vak, bijv. Biologie" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={`${input} flex-1 min-w-40`} placeholder="English name (optional)" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        <Button onClick={addSubject} disabled={!name.trim()}>
          Vak toevoegen
        </Button>
      </div>
    </Card>
  );
}
