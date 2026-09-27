import type { Lang } from './schemas';
import type { ProgressDoc, SubjectStatsDoc, UserDoc } from './types';
import { dayDiff } from './ids';

/**
 * Dutch answers: language quality scales the content score, so up to 30% of the points depend on good Dutch,
 * but well-written Dutch that doesn't answer the question still scores 0.
 */
export const NL_LANGUAGE_WEIGHT = 0.3;

export const DAILY_EVALUATION_CAP = 150;

export function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function combineScore(lang: Lang, contentScore: number, languageScore: number | null): number {
  if (lang === 'en' || languageScore == null) return clampScore(contentScore);
  return clampScore(contentScore * (1 - NL_LANGUAGE_WEIGHT + (NL_LANGUAGE_WEIGHT * languageScore) / 100));
}

export function bestAny(p: Pick<ProgressDoc, 'bestEn' | 'bestNl'> | null | undefined): number | null {
  if (!p) return null;
  if (p.bestEn == null && p.bestNl == null) return null;
  return Math.max(p.bestEn ?? 0, p.bestNl ?? 0);
}

export interface ProgressUpdate {
  progress: Pick<ProgressDoc, 'bestEn' | 'bestNl' | 'attempts'>;
  previousBest: number | null; // previous best in this language
  isPersonalBest: boolean;
  xpGained: number;
  statsDelta: Pick<SubjectStatsDoc, 'answered' | 'answeredNl' | 'sumBestAny' | 'sumBestNl'>;
}

/**
 * Apply a new score to a question's progress.
 * XP rewards improvement (so retrying pays off but can't be farmed) plus a small bonus for answering in Dutch.
 */
export function applyAttempt(
  prev: Pick<ProgressDoc, 'bestEn' | 'bestNl' | 'attempts'> | null,
  lang: Lang,
  score: number,
): ProgressUpdate {
  const bestEn = prev?.bestEn ?? null;
  const bestNl = prev?.bestNl ?? null;
  const previousBest = lang === 'en' ? bestEn : bestNl;
  const isPersonalBest = previousBest == null || score > previousBest;

  const next = {
    bestEn: lang === 'en' && isPersonalBest ? score : bestEn,
    bestNl: lang === 'nl' && isPersonalBest ? score : bestNl,
    attempts: (prev?.attempts ?? 0) + 1,
  };

  const improvement = isPersonalBest ? score - (previousBest ?? 0) : 0;
  const firstTimeBonus = previousBest == null ? 5 : 0;
  const dutchBonus = lang === 'nl' && isPersonalBest ? Math.round(improvement * 0.5) : 0;
  const xpGained = improvement + firstTimeBonus + dutchBonus;

  const wasAnswered = bestEn != null || bestNl != null;
  const oldAny = bestAny({ bestEn, bestNl }) ?? 0;
  const newAny = bestAny(next) ?? 0;

  return {
    progress: next,
    previousBest,
    isPersonalBest,
    xpGained,
    statsDelta: {
      answered: wasAnswered ? 0 : 1,
      answeredNl: bestNl == null && next.bestNl != null ? 1 : 0,
      sumBestAny: newAny - oldAny,
      sumBestNl: (next.bestNl ?? 0) - (bestNl ?? 0),
    },
  };
}

export interface Stats {
  total: number;
  answered: number;
  completion: number; // 0..100
  totalScore: number | null; // avg over answered questions of max(bestEn, bestNl)
  dutchScore: number | null; // avg over answered questions of bestNl (0 when not answered in Dutch)
  answeredNl: number;
}

export function computeStats(
  s: Pick<SubjectStatsDoc, 'answered' | 'answeredNl' | 'sumBestAny' | 'sumBestNl'> | null | undefined,
  totalQuestions: number,
): Stats {
  const answered = s?.answered ?? 0;
  return {
    total: totalQuestions,
    answered,
    answeredNl: s?.answeredNl ?? 0,
    completion: totalQuestions > 0 ? Math.min(100, Math.round((100 * answered) / totalQuestions)) : 0,
    totalScore: answered > 0 ? Math.round(s!.sumBestAny / answered) : null,
    dutchScore: answered > 0 ? Math.round((s!.sumBestNl) / answered) : null,
  };
}

export function sumStats(list: Stats[]): Stats {
  const total = list.reduce((a, s) => a + s.total, 0);
  const answered = list.reduce((a, s) => a + s.answered, 0);
  const answeredNl = list.reduce((a, s) => a + s.answeredNl, 0);
  const sumAny = list.reduce((a, s) => a + (s.totalScore ?? 0) * s.answered, 0);
  const sumNl = list.reduce((a, s) => a + (s.dutchScore ?? 0) * s.answered, 0);
  return {
    total,
    answered,
    answeredNl,
    completion: total > 0 ? Math.min(100, Math.round((100 * answered) / total)) : 0,
    totalScore: answered > 0 ? Math.round(sumAny / answered) : null,
    dutchScore: answered > 0 ? Math.round(sumNl / answered) : null,
  };
}

// ---------- Levels ----------

/** XP needed to go from level n to n+1 grows gently. */
export function xpForLevel(level: number): number {
  return 100 + (level - 1) * 50;
}

export function levelFromXp(xp: number): { level: number; into: number; needed: number } {
  let level = 1;
  let rest = xp;
  while (rest >= xpForLevel(level)) {
    rest -= xpForLevel(level);
    level++;
  }
  return { level, into: rest, needed: xpForLevel(level) };
}

// ---------- Streak ----------

export function nextStreak(
  user: Pick<UserDoc, 'streak' | 'bestStreak' | 'lastActiveDay'>,
  today: string,
): Pick<UserDoc, 'streak' | 'bestStreak' | 'lastActiveDay'> {
  let streak = user.streak ?? 0;
  if (!user.lastActiveDay) streak = 1;
  else {
    const diff = dayDiff(user.lastActiveDay, today);
    if (diff === 0) streak = Math.max(streak, 1);
    else if (diff === 1) streak = streak + 1;
    else streak = 1;
  }
  return { streak, bestStreak: Math.max(user.bestStreak ?? 0, streak), lastActiveDay: today };
}

// ---------- Badges ----------

export const BADGES = [
  'first-answer',
  'answered-10',
  'answered-50',
  'answered-100',
  'streak-3',
  'streak-7',
  'dutch-80',
  'subject-complete',
  'perfect-score',
  'words-25',
  'words-100',
] as const;
export type BadgeId = (typeof BADGES)[number];

export interface BadgeContext {
  answeredTotal: number;
  streak: number;
  lastScore: number;
  lastLang: Lang;
  subjectStats: Stats;
  wordsKnown: number;
}

export function earnedBadges(ctx: BadgeContext): BadgeId[] {
  const out: BadgeId[] = [];
  if (ctx.answeredTotal >= 1) out.push('first-answer');
  if (ctx.answeredTotal >= 10) out.push('answered-10');
  if (ctx.answeredTotal >= 50) out.push('answered-50');
  if (ctx.answeredTotal >= 100) out.push('answered-100');
  if (ctx.streak >= 3) out.push('streak-3');
  if (ctx.streak >= 7) out.push('streak-7');
  if (ctx.subjectStats.answered >= 10 && (ctx.subjectStats.dutchScore ?? 0) >= 80) out.push('dutch-80');
  if (ctx.subjectStats.total > 0 && ctx.subjectStats.completion >= 100) out.push('subject-complete');
  if (ctx.lastScore >= 100) out.push('perfect-score');
  if (ctx.wordsKnown >= 25) out.push('words-25');
  if (ctx.wordsKnown >= 100) out.push('words-100');
  return out;
}

// ---------- Flashcards (Leitner) ----------

export const MAX_BOX = 5;

export function nextBox(box: number, knew: boolean): number {
  return knew ? Math.min(MAX_BOX, box + 1) : 1;
}

/** Weighted random pick: lower boxes are much more likely. Avoids repeating `avoidId` when possible. */
export function pickCard<T extends { id: string; box: number }>(
  cards: T[],
  avoidId?: string,
  rand: () => number = Math.random,
): T | null {
  const pool = cards.length > 1 ? cards.filter((c) => c.id !== avoidId) : cards;
  if (pool.length === 0) return null;
  const weights = pool.map((c) => 2 ** (MAX_BOX - Math.min(MAX_BOX, Math.max(1, c.box))));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r < 0) return pool[i];
  }
  return pool[pool.length - 1];
}
