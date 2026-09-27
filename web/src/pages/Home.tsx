import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { collection, orderBy, query } from 'firebase/firestore';
import { computeStats, statsDocId, type SubjectDoc, type SubjectStatsDoc, type TestWeekDoc } from '@shared';
import { useAuth } from '../lib/auth';
import { db } from '../lib/firebase';
import { useQuery, type WithId } from '../lib/hooks';
import { Badges, Card, LevelBar, Ring, ScoreText, Spinner, wordBadges } from '../components/ui';

export default function Home() {
  const { t } = useTranslation();
  const { profile, user } = useAuth();
  const weeks = useQuery<TestWeekDoc>(query(collection(db, 'testWeeks'), orderBy('order')), []);
  const stats = useQuery<SubjectStatsDoc>(user ? collection(db, 'users', user.uid, 'subjectStats') : null, [user?.uid]);
  const statsById = new Map((stats ?? []).map((s) => [s.id, s]));

  const firstName = (profile?.name || user?.displayName || '').split(' ')[0];
  const streak = profile?.streak ?? 0;
  const badges = [...(profile?.badges ?? []), ...wordBadges(profile?.wordsKnown ?? 0)];

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-[1fr_auto] items-end">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold">{t('home.hello', { name: firstName })}</h1>
          <p className="mt-2 text-ink-soft flex items-center gap-2">
            <span className={streak > 0 ? 'text-2xl' : 'text-2xl grayscale opacity-50'} aria-hidden>
              🔥
            </span>
            {streak > 0 ? <span className="hl font-bold">{t('home.streak', { count: streak })}</span> : t('home.noStreak')}
          </p>
        </div>
        <div className="sm:w-72">
          <LevelBar xp={profile?.xp ?? 0} />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-3">{t('home.weeks')}</h2>
        {weeks === undefined ? (
          <Spinner />
        ) : weeks.length === 0 ? (
          <Card className="text-muted">{t('home.noWeeks')}</Card>
        ) : (
          <div className="space-y-6">
            {weeks.map((w) => (
              <WeekBlock key={w.id} week={w} statsById={statsById} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl font-bold mb-3">{t('home.badges')}</h2>
        {badges.length === 0 && <p className="text-muted mb-3">{t('home.noBadges')}</p>}
        <Badges earned={badges} />
      </section>
    </div>
  );
}

function WeekBlock({ week, statsById }: { week: WithId<TestWeekDoc>; statsById: Map<string, SubjectStatsDoc> }) {
  const { t, i18n } = useTranslation();
  const subjects = useQuery<SubjectDoc>(query(collection(db, 'testWeeks', week.id, 'subjects'), orderBy('order')), [week.id]);
  return (
    <div>
      <div className="flex items-baseline gap-3 mb-2">
        <h3 className="text-lg font-bold">{week.name}</h3>
        {week.startDate && <span className="text-sm text-muted">{formatDate(week.startDate, i18n.language)}</span>}
      </div>
      {subjects === undefined ? (
        <Spinner />
      ) : subjects.length === 0 ? (
        <p className="text-muted">{t('home.noSubjects')}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {subjects.map((s) => {
            const st = computeStats(statsById.get(statsDocId(week.id, s.id)), s.activeQuestionCount ?? 0);
            return (
              <li key={s.id}>
                <Link
                  to={`/w/${week.id}/s/${s.id}`}
                  className="flex items-center gap-4 bg-sheet border border-rule rounded-2xl p-4 hover:border-pen transition-colors"
                >
                  <Ring value={st.completion} label={t('stats.completion')} />
                  <div className="min-w-0 flex-1">
                    <p className="font-display font-bold text-lg leading-tight truncate">
                      {i18n.language === 'en' && s.nameEn ? s.nameEn : s.name}
                    </p>
                    <p className="text-sm text-muted">{t('stats.questions', { answered: st.answered, total: st.total })}</p>
                    <div className="mt-1.5 flex gap-4 text-sm">
                      <span>
                        {t('stats.total')} <ScoreText score={st.totalScore} />
                      </span>
                      <span>
                        🇳🇱 <ScoreText score={st.dutchScore} />
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function formatDate(d: string, lang: string) {
  try {
    return new Date(d).toLocaleDateString(lang === 'en' ? 'en-GB' : 'nl-NL', { day: 'numeric', month: 'long' });
  } catch {
    return d;
  }
}
