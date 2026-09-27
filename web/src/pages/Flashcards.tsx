import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, doc, getDocs, updateDoc } from 'firebase/firestore';
import { nextBox, pickCard, type VocabDoc } from '@shared';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import type { WithId } from '../lib/hooks';
import { Button, Card, Spinner } from '../components/ui';

type Side = 'nl' | 'en';

export default function Flashcards() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [cards, setCards] = useState<WithId<VocabDoc>[] | null>(null);
  const [current, setCurrent] = useState<WithId<VocabDoc> | null>(null);
  const [side, setSide] = useState<Side>('nl');
  const [flipped, setFlipped] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    getDocs(collection(db, 'users', user.uid, 'vocab')).then((s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...(d.data() as VocabDoc) }));
      setCards(list);
      draw(list);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const draw = (list: WithId<VocabDoc>[], avoid?: string) => {
    setCurrent(pickCard(list, avoid));
    setSide(Math.random() < 0.5 ? 'nl' : 'en');
    setFlipped(false);
  };

  const answer = (knew: boolean) => {
    if (!user || !current || !cards) return;
    const box = nextBox(current.box, knew);
    const updated = { ...current, box, seen: current.seen + 1, known: current.known + (knew ? 1 : 0), lastSeen: Date.now() };
    const list = cards.map((c) => (c.id === current.id ? updated : c));
    setCards(list);
    setCount((c) => c + 1);
    updateDoc(doc(db, 'users', user.uid, 'vocab', current.id), {
      box: updated.box,
      seen: updated.seen,
      known: updated.known,
      lastSeen: updated.lastSeen,
    }).catch(console.error);
    updateDoc(doc(db, 'users', user.uid), { wordsKnown: list.filter((c) => c.box >= 3).length }).catch(console.error);
    draw(list, current.id);
  };

  if (cards === null) return <Spinner />;
  if (cards.length === 0 || !current)
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-extrabold">{t('cards.title')}</h1>
        <Card className="text-muted">{t('cards.empty')}</Card>
      </div>
    );

  const front = side === 'nl' ? current.nl : current.en;
  const back = side === 'nl' ? current.en : current.nl;

  return (
    <div className="space-y-5 max-w-lg mx-auto">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-extrabold">{t('cards.title')}</h1>
        <span className="text-sm text-muted">{t('cards.session', { count })}</span>
      </div>

      <button
        onClick={() => setFlipped(true)}
        className="ruled w-full min-h-72 rounded-3xl border-2 border-rule px-6 py-8 text-center grid content-center gap-4 shadow-[0_18px_40px_-26px_rgba(20,33,61,.4)] cursor-pointer"
        aria-live="polite"
      >
        <span className="text-sm text-muted">{side === 'nl' ? t('cards.nlSide') : t('cards.enSide')}</span>
        <span className="text-4xl font-display font-extrabold break-words" lang={side}>
          {front}
        </span>
        {flipped ? (
          <>
            <span className="text-2xl font-bold" lang={side === 'nl' ? 'en' : 'nl'}>
              <span key={current.id + count} className="hl hl-sweep">
                {back}
              </span>
            </span>
            {current.example && (
              <span className="text-muted italic text-base" lang="nl">
                {current.example}
              </span>
            )}
          </>
        ) : (
          <span className="text-pen font-bold">{t('cards.tap')}</span>
        )}
      </button>

      <div className={`grid grid-cols-2 gap-3 transition-opacity ${flipped ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <Button variant="secondary" className="py-3.5 text-lg" onClick={() => answer(false)} tabIndex={flipped ? 0 : -1}>
          {t('cards.notYet')}
        </Button>
        <Button className="py-3.5 text-lg" onClick={() => answer(true)} tabIndex={flipped ? 0 : -1}>
          {t('cards.knew')}
        </Button>
      </div>

      <div className="flex justify-center gap-1" aria-label={`box ${current.box}/5`}>
        {[1, 2, 3, 4, 5].map((b) => (
          <span key={b} className={`size-2.5 rounded-full ${b <= current.box ? 'bg-pen' : 'bg-rule'}`} />
        ))}
      </div>
    </div>
  );
}
