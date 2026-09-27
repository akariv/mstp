import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { collection, getDocs, query, where } from 'firebase/firestore';
import confetti from 'canvas-confetti';
import { FunctionsError } from 'firebase/functions';
import { bestAny, type EvaluateResponse, type Lang, type ProgressDoc, type QuestionDoc } from '@shared';
import { api, db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { shuffle, type WithId } from '../lib/hooks';
import { BackLink, Button, Card, ScoreText, Spinner } from '../components/ui';

const SESSION_SIZE = 10;

export default function Practice() {
  const { weekId = '', subjectId = '' } = useParams();
  const [params] = useSearchParams();
  const { t } = useTranslation();
  const { user } = useAuth();

  const [queue, setQueue] = useState<WithId<QuestionDoc>[] | null>(null);
  const [progress, setProgress] = useState<Map<string, ProgressDoc>>(new Map());
  const [index, setIndex] = useState(0);
  const [xpTotal, setXpTotal] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);

  // Build the session once: unanswered first, then lowest scores.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [qSnap, pSnap] = await Promise.all([
        getDocs(query(collection(db, 'testWeeks', weekId, 'subjects', subjectId, 'questions'), where('status', '==', 'active'))),
        getDocs(
          query(collection(db, 'users', user.uid, 'progress'), where('weekId', '==', weekId), where('subjectId', '==', subjectId)),
        ),
      ]);
      const prog = new Map(pSnap.docs.map((d) => [d.id, d.data() as ProgressDoc]));
      let qs = qSnap.docs.map((d) => ({ id: d.id, ...(d.data() as QuestionDoc) }));
      const only = params.get('q');
      const topic = params.get('topic');
      const sub = params.get('sub');
      const d = Number(params.get('d')) || null;
      if (only) qs = qs.filter((q) => q.id === only);
      if (topic) qs = qs.filter((q) => q.topicId === topic);
      if (sub) qs = qs.filter((q) => q.subtopicId === sub);
      if (d) qs = qs.filter((q) => q.difficulty === d);

      let ordered: typeof qs;
      if (params.get('mode') === 'improve') {
        ordered = qs
          .filter((q) => bestAny(prog.get(q.id)) != null)
          .sort((a, b) => bestAny(prog.get(a.id))! - bestAny(prog.get(b.id))!);
      } else {
        const fresh = shuffle(qs.filter((q) => bestAny(prog.get(q.id)) == null)).sort((a, b) => a.difficulty - b.difficulty);
        const done = qs
          .filter((q) => bestAny(prog.get(q.id)) != null)
          .sort((a, b) => bestAny(prog.get(a.id))! - bestAny(prog.get(b.id))!);
        ordered = [...fresh, ...done];
      }
      setProgress(prog);
      setQueue(ordered.slice(0, SESSION_SIZE));
    })().catch((e) => {
      console.error(e);
      setQueue([]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, weekId, subjectId, params.toString()]);

  const backTo = `/w/${weekId}/s/${subjectId}`;
  if (queue === null) return <Spinner />;
  if (queue.length === 0)
    return (
      <div className="space-y-4">
        <BackLink to={backTo}>{t('practice.back')}</BackLink>
        <Card className="text-muted">{t('practice.empty')}</Card>
      </div>
    );

  if (index >= queue.length)
    return (
      <div className="space-y-5 text-center pt-10">
        <p className="text-6xl" aria-hidden>
          🎉
        </p>
        <h1 className="text-4xl font-extrabold">
          <span className="hl hl-sweep">{t('practice.doneTitle')}</span>
        </h1>
        <p className="text-lg text-ink-soft">{t('practice.doneBody', { count: answeredCount, xp: xpTotal })}</p>
        <div className="flex gap-3 justify-center">
          <Link to={backTo}>
            <Button variant="secondary">{t('practice.back')}</Button>
          </Link>
          <Button
            onClick={() => {
              setIndex(0);
              setQueue(shuffle(queue));
            }}
          >
            {t('practice.retry')}
          </Button>
        </div>
      </div>
    );

  const q = queue[index];
  return (
    <QuestionView
      key={q.id + index}
      weekId={weekId}
      subjectId={subjectId}
      q={q}
      n={index + 1}
      total={queue.length}
      progress={progress.get(q.id)}
      backTo={backTo}
      onEvaluated={(r, lang) => {
        setXpTotal((x) => x + r.xpGained);
        setAnsweredCount((c) => c + 1);
        setProgress((m) => {
          const prev = m.get(q.id);
          const next = new Map(m);
          next.set(q.id, {
            ...(prev ?? ({} as ProgressDoc)),
            bestEn: lang === 'en' ? Math.max(prev?.bestEn ?? 0, r.score) : (prev?.bestEn ?? null),
            bestNl: lang === 'nl' ? Math.max(prev?.bestNl ?? 0, r.score) : (prev?.bestNl ?? null),
          });
          return next;
        });
      }}
      onNext={() => setIndex((i) => i + 1)}
    />
  );
}

function QuestionView(props: {
  weekId: string;
  subjectId: string;
  q: WithId<QuestionDoc>;
  n: number;
  total: number;
  progress?: ProgressDoc;
  backTo: string;
  onEvaluated: (r: EvaluateResponse, lang: Lang) => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const { q } = props;
  const [showEn, setShowEn] = useState(false);
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('answerLang') as Lang) || 'nl');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EvaluateResponse | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const chooseLang = (l: Lang) => {
    setLang(l);
    try {
      localStorage.setItem('answerLang', l);
    } catch {
      /* ignore */
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.evaluateAnswer({
        weekId: props.weekId,
        subjectId: props.subjectId,
        questionId: q.id,
        lang,
        answer,
      });
      setResult(data);
      props.onEvaluated(data, lang);
      if ((data.isPersonalBest && data.previousBest != null) || data.score >= 90 || data.newBadges.length) {
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
          confetti({ particleCount: 90, spread: 70, origin: { y: 0.7 }, colors: ['#ffe34d', '#ff9ccb', '#8ef0bf', '#1d3f8f'] });
      }
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (e) {
      setError(e instanceof FunctionsError && e.code === 'functions/resource-exhausted' ? t('practice.limit') : t('practice.error'));
    } finally {
      setBusy(false);
    }
  };

  const retry = () => {
    setResult(null);
    setAnswer('');
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <BackLink to={props.backTo}>{t('practice.back')}</BackLink>
        <span className="text-sm text-muted tabular-nums">{t('practice.question', { n: props.n, total: props.total })}</span>
      </div>
      <div className="h-1.5 rounded-full bg-rule overflow-hidden" aria-hidden>
        <div className="h-full bg-pen" style={{ width: `${(100 * (props.n - 1)) / props.total}%` }} />
      </div>

      <section className="ruled rounded-2xl border border-rule px-5 pt-3 pb-5">
        <div className="flex justify-between text-sm text-muted">
          <span aria-label={t('practice.difficulty', { d: q.difficulty })}>{'●'.repeat(q.difficulty) + '○'.repeat(5 - q.difficulty)}</span>
          {props.progress && (
            <span>
              {t('practice.yourBest', { nl: props.progress.bestNl ?? '–', en: props.progress.bestEn ?? '–' })}
            </span>
          )}
        </div>
        <h1 className="mt-1 text-xl sm:text-2xl font-bold font-sans leading-[1.75rem] sm:leading-[1.75rem]" lang="nl">
          {q.questionNl}
        </h1>
        {showEn && (
          <p className="mt-2 text-pen italic" lang="en">
            {q.questionEn}
          </p>
        )}
        <button onClick={() => setShowEn((s) => !s)} className="mt-3 text-sm font-bold text-pen underline underline-offset-4">
          {showEn ? t('practice.hideEnglish') : t('practice.showEnglish')}
        </button>
      </section>

      {!result && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted">{t('practice.answerIn')}</span>
            <div className="inline-flex rounded-xl border-2 border-pen p-0.5" role="radiogroup">
              {(['nl', 'en'] as Lang[]).map((l) => (
                <button
                  key={l}
                  role="radio"
                  aria-checked={lang === l}
                  onClick={() => chooseLang(l)}
                  className={`px-4 py-1.5 rounded-lg font-bold text-sm ${lang === l ? 'bg-pen text-sheet' : 'text-pen'}`}
                >
                  {l === 'nl' ? '🇳🇱 ' : '🇬🇧 '}
                  {t(`practice.${l}`)}
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={5}
            lang={lang}
            spellCheck={false}
            placeholder={lang === 'nl' ? t('practice.placeholderNl') : t('practice.placeholderEn')}
            className="w-full rounded-2xl border-2 border-rule bg-sheet p-4 text-lg focus:border-pen outline-none resize-y"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && answer.trim()) submit();
            }}
          />
          {error && (
            <p role="alert" className="text-bad font-bold">
              {error}
            </p>
          )}
          <Button className="w-full sm:w-auto text-lg py-3 px-8" onClick={submit} disabled={busy || !answer.trim()}>
            {busy ? t('practice.checking') : t('practice.check')}
          </Button>
        </section>
      )}

      {result && (
        <div ref={resultRef} className="scroll-mt-20">
          <Result r={result} lang={lang} answer={answer} />
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={retry}>
              {t('practice.retry')}
            </Button>
            <Button onClick={props.onNext}>{props.n < props.total ? t('practice.next') : t('practice.finish')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Result({ r, lang, answer }: { r: EvaluateResponse; lang: Lang; answer: string }) {
  const { t, i18n } = useTranslation();
  const [fbLang, setFbLang] = useState<Lang>(i18n.language === 'en' ? 'en' : 'nl');
  const fb = useMemo(
    () =>
      fbLang === 'nl'
        ? { text: r.feedbackNl, good: r.strengthsNl, better: r.improvementsNl, model: r.modelAnswerNl }
        : { text: r.feedbackEn, good: r.strengthsEn, better: r.improvementsEn, model: r.modelAnswerEn },
    [fbLang, r],
  );
  const scoreCls = r.score >= 80 ? 'hl-green' : r.score >= 55 ? 'hl' : 'hl-pink';

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div>
          <p className="text-sm text-muted">{t('result.score')}</p>
          <p className="text-6xl font-display font-extrabold tabular-nums leading-none mt-1">
            <span className={`${scoreCls} hl-sweep`}>{r.score}</span>
          </p>
        </div>
        <div className="text-sm space-y-1">
          <p>
            {t('result.content')}: <ScoreText score={r.contentScore} />
          </p>
          {r.languageScore != null && (
            <p>
              {t('result.language')}: <ScoreText score={r.languageScore} />
            </p>
          )}
        </div>
        <div className="ml-auto text-right">
          {r.isPersonalBest && r.previousBest != null && <p className="font-bold text-good">{t('result.personalBest')}</p>}
          {r.previousBest != null && <p className="text-sm text-muted">{t('result.previous', { score: r.previousBest })}</p>}
          {r.xpGained > 0 && <p className="font-display font-bold text-pen text-lg">{t('result.xp', { xp: r.xpGained })}</p>}
        </div>
        {r.newBadges.map((b) => (
          <p key={b} className="w-full font-bold">
            🏅 {t('result.badge', { name: t(`badges.${b}`) })}
          </p>
        ))}
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{t('result.feedback')}</h2>
          <button onClick={() => setFbLang(fbLang === 'nl' ? 'en' : 'nl')} className="text-sm font-bold text-pen underline underline-offset-4">
            {fbLang === 'nl' ? t('result.showIn') : t('result.showInNl')}
          </button>
        </div>
        <p className="text-lg leading-relaxed" lang={fbLang}>
          {fb.text}
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {fb.good.length > 0 && (
            <div>
              <p className="font-bold text-good">✓ {t('result.good')}</p>
              <ul className="list-disc pl-5 text-ink-soft">
                {fb.good.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {fb.better.length > 0 && (
            <div>
              <p className="font-bold text-bad">↑ {t('result.better')}</p>
              <ul className="list-disc pl-5 text-ink-soft">
                {fb.better.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Card>

      {lang === 'nl' && r.correctedAnswerNl && r.correctedAnswerNl.trim() !== answer.trim() && (
        <Card>
          <h2 className="text-lg font-bold mb-2">{t('result.corrected')}</h2>
          <p className="ruled rounded-xl px-3 text-lg" lang="nl">
            {r.correctedAnswerNl}
          </p>
        </Card>
      )}

      <details className="bg-sheet rounded-2xl border border-rule p-4">
        <summary className="font-bold cursor-pointer">{t('result.modelAnswer')}</summary>
        <p className="mt-3 whitespace-pre-line leading-relaxed" lang={fbLang}>
          {fb.model}
        </p>
      </details>

      {r.vocabulary.length > 0 && (
        <Card>
          <h2 className="text-lg font-bold mb-2">{r.newWords.length ? t('result.newWords') : t('result.words')}</h2>
          <ul className="flex flex-wrap gap-2">
            {r.vocabulary.map((v) => (
              <li key={v.nl} className="rounded-xl border border-rule px-3 py-1.5">
                <span className={r.newWords.includes(v.nl) ? 'hl font-bold' : 'font-bold'} lang="nl">
                  {v.nl}
                </span>{' '}
                <span className="text-muted" lang="en">
                  {v.en}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
