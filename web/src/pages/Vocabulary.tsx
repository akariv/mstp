import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { collection, deleteDoc, doc, orderBy, query } from 'firebase/firestore';
import type { VocabDoc } from '@shared';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { useQuery } from '../lib/hooks';
import { Button, Card, Spinner } from '../components/ui';

export default function Vocabulary() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const words = useQuery<VocabDoc>(
    user ? query(collection(db, 'users', user.uid, 'vocab'), orderBy('addedAt', 'desc')) : null,
    [user?.uid],
  );

  if (words === undefined) return <Spinner />;
  const s = search.trim().toLowerCase();
  const shown = s ? words.filter((w) => w.nl.toLowerCase().includes(s) || w.en.toLowerCase().includes(s)) : words;
  const known = words.filter((w) => w.box >= 3).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">{t('vocab.title')}</h1>
          <p className="text-muted">
            {t('vocab.count', { count: words.length })} · <span className="hl">{known}</span> {t('vocab.known')}
          </p>
        </div>
        {words.length > 0 && (
          <Link to="/kaartjes">
            <Button>{t('vocab.practice')}</Button>
          </Link>
        )}
      </div>

      {words.length === 0 ? (
        <Card className="text-muted">{t('vocab.empty')}</Card>
      ) : (
        <>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('vocab.search')}
            className="w-full rounded-xl border-2 border-rule bg-sheet px-4 py-2.5 focus:border-pen outline-none"
          />
          <ul className="divide-y divide-rule bg-sheet rounded-2xl border border-rule">
            {shown.map((w) => (
              <li key={w.id} className="px-4 py-3 flex gap-3 items-start">
                <div className="flex-1 min-w-0">
                  <p>
                    <span className="font-bold text-lg" lang="nl">
                      {w.nl}
                    </span>{' '}
                    <span className="text-ink-soft" lang="en">
                      — {w.en}
                    </span>
                  </p>
                  {w.example && (
                    <p className="text-sm text-muted italic" lang="nl">
                      {w.example}
                    </p>
                  )}
                </div>
                <span className="shrink-0 flex gap-0.5 pt-2" aria-label={`box ${w.box}/5`}>
                  {[1, 2, 3, 4, 5].map((b) => (
                    <span key={b} className={`size-2 rounded-full ${b <= w.box ? 'bg-pen' : 'bg-rule'}`} />
                  ))}
                </span>
                <button
                  onClick={() => user && deleteDoc(doc(db, 'users', user.uid, 'vocab', w.id))}
                  className="shrink-0 text-muted hover:text-bad px-1"
                  aria-label={`${t('vocab.remove')} ${w.nl}`}
                  title={t('vocab.remove')}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
