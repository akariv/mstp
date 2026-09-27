import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { collection, doc, query, where } from 'firebase/firestore';
import {
  bestAny,
  computeStats,
  statsDocId,
  type ProgressDoc,
  type QuestionDoc,
  type SubjectDoc,
  type SubjectStatsDoc,
} from '@shared';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { useDoc, useQuery } from '../lib/hooks';
import { BackLink, Bar, Button, Card, Ring, ScoreText, Spinner } from '../components/ui';

export default function Subject() {
  const { weekId = '', subjectId = '' } = useParams();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const en = i18n.language === 'en';

  const subject = useDoc<SubjectDoc>(doc(db, 'testWeeks', weekId, 'subjects', subjectId), [weekId, subjectId]);
  const questions = useQuery<QuestionDoc>(
    query(collection(db, 'testWeeks', weekId, 'subjects', subjectId, 'questions'), where('status', '==', 'active')),
    [weekId, subjectId],
  );
  const progress = useQuery<ProgressDoc>(
    user
      ? query(
          collection(db, 'users', user.uid, 'progress'),
          where('weekId', '==', weekId),
          where('subjectId', '==', subjectId),
        )
      : null,
    [user?.uid, weekId, subjectId],
  );
  const stats = useDoc<SubjectStatsDoc>(user ? doc(db, 'users', user.uid, 'subjectStats', statsDocId(weekId, subjectId)) : null, [
    user?.uid,
    weekId,
    subjectId,
  ]);

  const progById = useMemo(() => new Map((progress ?? []).map((p) => [p.id, p])), [progress]);

  if (subject === undefined || questions === undefined) return <Spinner />;
  if (subject === null) return <p>Not found</p>;

  const st = computeStats(stats, subject.activeQuestionCount ?? questions.length);
  const qs = questions.filter((q) => difficulty == null || q.difficulty === difficulty);
  const practiceUrl = (params: Record<string, string>) => {
    const p = new URLSearchParams(params);
    if (difficulty) p.set('d', String(difficulty));
    return `/w/${weekId}/s/${subjectId}/oefenen?${p}`;
  };

  const improve = questions
    .map((q) => ({ q, best: bestAny(progById.get(q.id)) }))
    .filter((x) => x.best != null && x.best < 100)
    .sort((a, b) => a.best! - b.best!)
    .slice(0, 8);

  return (
    <div className="space-y-7">
      <div>
        <BackLink to="/">{t('common.back')}</BackLink>
        <h1 className="text-3xl sm:text-4xl font-extrabold">{en && subject.nameEn ? subject.nameEn : subject.name}</h1>
      </div>

      <Card className="grid grid-cols-3 gap-2 text-center">
        <div className="grid justify-items-center gap-1">
          <Ring value={st.completion} size={72} />
          <span className="text-sm text-muted">{t('stats.completion')}</span>
        </div>
        <div className="grid justify-items-center content-start gap-1">
          <span className="text-4xl h-[72px] grid place-items-center">
            <ScoreText score={st.totalScore} />
          </span>
          <span className="text-sm text-muted">{t('stats.total')}</span>
        </div>
        <div className="grid justify-items-center content-start gap-1">
          <span className="text-4xl h-[72px] grid place-items-center">
            <ScoreText score={st.dutchScore} />
          </span>
          <span className="text-sm text-muted">{t('stats.dutch')}</span>
        </div>
      </Card>

      {(subject.summaryNl || subject.summaryEn) && (
        <details className="group">
          <summary className="cursor-pointer font-bold text-pen">{t('subject.summary')}</summary>
          <p className="mt-2 text-ink-soft max-w-prose">{en ? subject.summaryEn : subject.summaryNl}</p>
        </details>
      )}

      {questions.length === 0 ? (
        <Card className="text-muted">{t('subject.noQuestions')}</Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('subject.difficulty')}>
            <span className="text-sm text-muted mr-1">{t('subject.difficulty')}</span>
            {[null, 1, 2, 3, 4, 5].map((d) => (
              <button
                key={d ?? 'all'}
                onClick={() => setDifficulty(d)}
                aria-pressed={difficulty === d}
                className={`px-3 py-1 rounded-full text-sm font-bold border ${
                  difficulty === d ? 'bg-pen text-sheet border-pen' : 'border-rule text-ink-soft hover:border-pen'
                }`}
              >
                {d == null ? t('subject.anyDifficulty') : '●'.repeat(d)}
              </button>
            ))}
          </div>

          <Button className="w-full sm:w-auto text-lg py-3" onClick={() => navigate(practiceUrl({}))} disabled={qs.length === 0}>
            {t('subject.practiceAll')}
          </Button>

          <section>
            <h2 className="text-xl font-bold mb-3">{t('subject.topics')}</h2>
            <div className="space-y-4">
              {(subject.topicTree ?? []).map((topic) => {
                const topicQs = qs.filter((q) => q.topicId === topic.id);
                if (topicQs.length === 0) return null;
                return (
                  <Card key={topic.id} flush className="overflow-hidden">
                    <Link
                      to={practiceUrl({ topic: topic.id })}
                      className="flex items-center justify-between gap-3 px-4 py-3 border-b border-rule hover:bg-pen-soft"
                    >
                      <h3 className="font-bold text-lg">{en ? topic.nameEn : topic.nameNl}</h3>
                      <span className="text-pen font-bold text-sm shrink-0">{t('subject.start')} ›</span>
                    </Link>
                    <ul>
                      {topic.subtopics.map((sub) => {
                        const subQs = topicQs.filter((q) => q.subtopicId === sub.id);
                        if (subQs.length === 0) return null;
                        const answered = subQs.map((q) => bestAny(progById.get(q.id))).filter((b): b is number => b != null);
                        const mastery = subQs.length ? answered.reduce((a, b) => a + b, 0) / subQs.length : 0;
                        return (
                          <li key={sub.id} className="border-b border-rule last:border-0">
                            <Link to={practiceUrl({ topic: topic.id, sub: sub.id })} className="block px-4 py-3 hover:bg-pen-soft">
                              <div className="flex justify-between gap-3">
                                <span>{en ? sub.nameEn : sub.nameNl}</span>
                                <span className="text-sm text-muted tabular-nums shrink-0">
                                  {answered.length}/{subQs.length}
                                </span>
                              </div>
                              <div className="mt-2">
                                <Bar value={mastery} />
                              </div>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                );
              })}
            </div>
          </section>

          {improve.length > 0 && (
            <section>
              <h2 className="text-xl font-bold">{t('subject.improve')}</h2>
              <p className="text-muted text-sm mb-3">{t('subject.improveHint')}</p>
              <ul className="space-y-2">
                {improve.map(({ q, best }) => (
                  <li key={q.id}>
                    <Link
                      to={practiceUrl({ q: q.id })}
                      className="flex items-center gap-3 bg-sheet border border-rule rounded-xl px-4 py-3 hover:border-pen"
                    >
                      <ScoreText score={best} className="text-lg w-10 text-center" />
                      <span className="line-clamp-2 flex-1">{q.questionNl}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Button variant="secondary" className="mt-3" onClick={() => navigate(practiceUrl({ mode: 'improve' }))}>
                {t('subject.improve')}
              </Button>
            </section>
          )}
        </>
      )}
    </div>
  );
}
