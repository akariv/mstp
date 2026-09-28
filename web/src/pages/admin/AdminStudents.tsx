import { Link } from 'react-router-dom';
import { collection } from 'firebase/firestore';
import { levelFromXp, type AllowedUserDoc, type UserDoc } from '@shared';
import { db } from '../../lib/firebase';
import { useQuery } from '../../lib/hooks';
import { BackLink, Card, Spinner } from '../../components/ui';

export function timeAgo(ms: number | undefined | null): string {
  if (!ms) return 'nog nooit';
  const min = Math.round((Date.now() - ms) / 60_000);
  if (min < 1) return 'zojuist';
  if (min < 60) return `${min} min geleden`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} uur geleden`;
  const d = Math.round(h / 24);
  if (d === 1) return 'gisteren';
  if (d < 14) return `${d} dagen geleden`;
  return new Date(ms).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

/** Older profiles only have lastActiveDay; treat it as noon that day. */
export function lastActive(u: UserDoc): number | null {
  if (u.lastActiveAt) return u.lastActiveAt;
  return u.lastActiveDay ? Date.parse(`${u.lastActiveDay}T12:00:00`) : null;
}

export default function AdminStudents() {
  const users = useQuery<UserDoc>(collection(db, 'users'), []);
  const allowed = useQuery<AllowedUserDoc>(collection(db, 'allowedUsers'), []);
  if (!users || !allowed) return <Spinner />;

  const roleByEmail = new Map(allowed.map((a) => [a.id, a.role]));
  const rows = [...users].sort((a, b) => (lastActive(b) ?? 0) - (lastActive(a) ?? 0));
  const neverSignedIn = allowed.filter((a) => a.role === 'student' && !users.some((u) => u.email === a.id));

  return (
    <div className="space-y-5">
      <BackLink to="/beheer">Beheer</BackLink>
      <h1 className="text-3xl font-extrabold">Leerlingen</h1>
      <ul className="space-y-2">
        {rows.map((u) => {
          const role = roleByEmail.get(u.email);
          const active = lastActive(u);
          const today = active && Date.now() - active < 24 * 3600_000;
          return (
            <li key={u.id}>
              <Link to={`/beheer/leerlingen/${u.id}`} className="block bg-sheet border border-rule rounded-2xl px-4 py-3 hover:border-pen">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-bold text-lg">{u.name || u.email}</span>
                  {role !== 'student' && <span className="text-xs text-muted">{role === 'admin' ? 'beheerder' : 'geen toegang meer'}</span>}
                  <span className="ml-auto text-sm">
                    <span className={today ? 'hl font-bold' : 'text-muted'}>{timeAgo(active)}</span>
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 text-sm text-ink-soft">
                  <span>Level {levelFromXp(u.xp ?? 0).level}</span>
                  <span>
                    {u.answeredTotal ?? 0} {u.answeredTotal === 1 ? 'vraag' : 'vragen'} gemaakt
                  </span>
                  <span>🔥 {u.streak ?? 0} (record {u.bestStreak ?? 0})</span>
                  <span>{u.wordsKnown ?? 0} woorden gekend</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      {neverSignedIn.length > 0 && (
        <Card>
          <h2 className="font-bold">Nog nooit ingelogd</h2>
          <p className="text-sm text-muted">{neverSignedIn.map((a) => a.name || a.id).join(', ')}</p>
        </Card>
      )}
    </div>
  );
}
