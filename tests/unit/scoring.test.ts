import { describe, expect, it } from 'vitest';
import {
  applyAttempt,
  combineScore,
  computeStats,
  earnedBadges,
  levelFromXp,
  nextBox,
  nextStreak,
  pickCard,
  sumStats,
  vocabId,
  questionFingerprint,
} from '@shared';

describe('combineScore', () => {
  it('uses content only for English answers', () => {
    expect(combineScore('en', 80, null)).toBe(80);
    expect(combineScore('en', 80, 10)).toBe(80);
  });
  it('lets language quality scale up to 30% of the content score for Dutch answers', () => {
    expect(combineScore('nl', 100, 100)).toBe(100);
    expect(combineScore('nl', 100, 50)).toBe(85);
    expect(combineScore('nl', 50, 0)).toBe(35);
    expect(combineScore('nl', 0, 100)).toBe(0);
  });
});

describe('applyAttempt', () => {
  it('first attempt counts as answered and gives improvement + bonus XP', () => {
    const u = applyAttempt(null, 'en', 60);
    expect(u.progress).toEqual({ bestEn: 60, bestNl: null, attempts: 1 });
    expect(u.isPersonalBest).toBe(true);
    expect(u.previousBest).toBeNull();
    expect(u.xpGained).toBe(65);
    expect(u.statsDelta).toEqual({ answered: 1, answeredNl: 0, sumBestAny: 60, sumBestNl: 0 });
  });

  it('a worse retry keeps the best score and gives no XP', () => {
    const u = applyAttempt({ bestEn: 70, bestNl: null, attempts: 1 }, 'en', 50);
    expect(u.progress.bestEn).toBe(70);
    expect(u.progress.attempts).toBe(2);
    expect(u.isPersonalBest).toBe(false);
    expect(u.xpGained).toBe(0);
    expect(u.statsDelta).toEqual({ answered: 0, answeredNl: 0, sumBestAny: 0, sumBestNl: 0 });
  });

  it('tracks Dutch and English best scores separately', () => {
    const u = applyAttempt({ bestEn: 90, bestNl: null, attempts: 1 }, 'nl', 60);
    expect(u.progress).toEqual({ bestEn: 90, bestNl: 60, attempts: 2 });
    expect(u.previousBest).toBeNull();
    // max(any) stays 90 -> no change in total; Dutch sum grows by 60
    expect(u.statsDelta).toEqual({ answered: 0, answeredNl: 1, sumBestAny: 0, sumBestNl: 60 });
    // Dutch improvements get a 50% bonus
    expect(u.xpGained).toBe(60 + 5 + 30);
  });

  it('improving a Dutch score raises both sums when it becomes the best overall', () => {
    const u = applyAttempt({ bestEn: 50, bestNl: 40, attempts: 2 }, 'nl', 80);
    expect(u.statsDelta).toEqual({ answered: 0, answeredNl: 0, sumBestAny: 30, sumBestNl: 40 });
  });
});

describe('computeStats', () => {
  it('computes completion, total score and Dutch score over answered questions', () => {
    const s = computeStats({ answered: 4, answeredNl: 2, sumBestAny: 320, sumBestNl: 140 }, 10);
    expect(s).toMatchObject({ completion: 40, totalScore: 80, dutchScore: 35, answered: 4, total: 10 });
  });
  it('handles no data', () => {
    expect(computeStats(undefined, 0)).toMatchObject({ completion: 0, totalScore: null, dutchScore: null });
  });
  it('sums across subjects weighted by answered count', () => {
    const a = computeStats({ answered: 1, answeredNl: 1, sumBestAny: 100, sumBestNl: 100 }, 2);
    const b = computeStats({ answered: 3, answeredNl: 0, sumBestAny: 180, sumBestNl: 0 }, 8);
    expect(sumStats([a, b])).toMatchObject({ total: 10, answered: 4, completion: 40, totalScore: 70, dutchScore: 25 });
  });
});

describe('streak', () => {
  it('continues on consecutive days and resets after a gap', () => {
    const d1 = nextStreak({ streak: 0, bestStreak: 0, lastActiveDay: null }, '2026-10-01');
    expect(d1.streak).toBe(1);
    const same = nextStreak(d1, '2026-10-01');
    expect(same.streak).toBe(1);
    const d2 = nextStreak(d1, '2026-10-02');
    expect(d2.streak).toBe(2);
    const gap = nextStreak(d2, '2026-10-05');
    expect(gap).toEqual({ streak: 1, bestStreak: 2, lastActiveDay: '2026-10-05' });
  });
});

describe('levels', () => {
  it('starts at level 1 and grows', () => {
    expect(levelFromXp(0)).toEqual({ level: 1, into: 0, needed: 100 });
    expect(levelFromXp(100)).toEqual({ level: 2, into: 0, needed: 150 });
    expect(levelFromXp(260).level).toBe(3);
  });
});

describe('badges', () => {
  it('awards based on context', () => {
    const b = earnedBadges({
      answeredTotal: 10,
      streak: 3,
      lastScore: 100,
      lastLang: 'nl',
      subjectStats: computeStats({ answered: 10, answeredNl: 10, sumBestAny: 900, sumBestNl: 850 }, 10),
      wordsKnown: 0,
    });
    expect(b).toEqual(expect.arrayContaining(['first-answer', 'answered-10', 'streak-3', 'dutch-80', 'subject-complete', 'perfect-score']));
    expect(b).not.toContain('answered-50');
  });
});

describe('flashcards', () => {
  it('moves up one box when known and back to 1 when not', () => {
    expect(nextBox(1, true)).toBe(2);
    expect(nextBox(5, true)).toBe(5);
    expect(nextBox(4, false)).toBe(1);
  });
  it('prefers low boxes and avoids repeating the last card', () => {
    const cards = [
      { id: 'a', box: 1 },
      { id: 'b', box: 5 },
    ];
    expect(pickCard(cards, 'a')?.id).toBe('b');
    const counts = { a: 0, b: 0 };
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 1000; i++) counts[pickCard(cards, undefined, rand)!.id as 'a' | 'b']++;
    expect(counts.a).toBeGreaterThan(counts.b * 5);
  });
});

describe('ids', () => {
  it('normalises vocab ids without article', () => {
    expect(vocabId('de Fotosynthese')).toBe('fotosynthese');
    expect(vocabId('het blad')).toBe(vocabId('blad'));
  });
  it('fingerprints ignore case, punctuation and accents', () => {
    expect(questionFingerprint('Wat is fotosynthese?')).toBe(questionFingerprint('wat  is FOTOSYNTHESE'));
    expect(questionFingerprint('café')).toBe(questionFingerprint('cafe'));
  });
});
