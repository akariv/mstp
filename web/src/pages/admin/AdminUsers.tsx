import { useState } from 'react';
import { collection } from 'firebase/firestore';
import type { AllowedUserDoc, Role } from '@shared';
import { api, db } from '../../lib/firebase';
import { useQuery } from '../../lib/hooks';
import { BackLink, Button, Card, Spinner } from '../../components/ui';

const input = 'rounded-lg border-2 border-rule bg-sheet px-3 py-2 focus:border-pen outline-none';

export default function AdminUsers() {
  const users = useQuery<AllowedUserDoc>(collection(db, 'allowedUsers'), []);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('student');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: string, r: Role | null, n = '') => {
    setBusy(true);
    setError(null);
    try {
      await api.upsertAllowedUser({ email: e, role: r, name: n });
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <BackLink to="/beheer">Beheer</BackLink>
      <h1 className="text-3xl font-extrabold">Gebruikers</h1>
      <p className="text-muted max-w-prose">
        Alleen deze Google-accounts kunnen inloggen. Wijzigingen gelden direct; een verwijderde gebruiker wordt binnen een uur uitgelogd.
      </p>
      <Card className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <input className={`${input} flex-1 min-w-56`} type="email" placeholder="naam@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className={`${input} flex-1 min-w-40`} placeholder="Naam" value={name} onChange={(e) => setName(e.target.value)} />
          <select className={input} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="student">Leerling</option>
            <option value="admin">Beheerder</option>
          </select>
          <Button
            disabled={busy || !email.includes('@')}
            onClick={async () => {
              if (await save(email.trim(), role, name.trim())) {
                setEmail('');
                setName('');
              }
            }}
          >
            Toevoegen
          </Button>
        </div>
        {error && <p className="text-bad font-bold">{error}</p>}
      </Card>
      {users === undefined ? (
        <Spinner />
      ) : (
        <ul className="divide-y divide-rule bg-sheet border border-rule rounded-2xl">
          {users.map((u) => (
            <li key={u.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-bold truncate">{u.name || u.id}</p>
                <p className="text-sm text-muted truncate">{u.id}</p>
              </div>
              <select className={input} value={u.role} disabled={busy} onChange={(e) => save(u.id, e.target.value as Role, u.name)}>
                <option value="student">Leerling</option>
                <option value="admin">Beheerder</option>
              </select>
              <Button variant="danger" disabled={busy} onClick={() => confirm(`Toegang intrekken voor ${u.id}?`) && save(u.id, null)}>
                Intrekken
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
