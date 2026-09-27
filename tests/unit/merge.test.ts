import { describe, expect, it } from 'vitest';
import { questionFingerprint, type GeneratedQuestion } from '@shared';
import { planMerge, type ExistingQuestion } from '../../functions/src/testmaker/merge';

const gq = (questionNl: string): GeneratedQuestion => ({
  questionNl,
  questionEn: questionNl,
  difficulty: 2,
  detailedAnswerNl: 'a',
  detailedAnswerEn: 'a',
  keyPoints: [],
  rubric: '',
});
const ex = (id: string, q: string, status: 'active' | 'archived' = 'active'): ExistingQuestion => ({
  id,
  fingerprint: questionFingerprint(q),
  status,
  topicId: 't',
  subtopicId: 's',
});

describe('planMerge', () => {
  const existing = [ex('1', 'Wat is fotosynthese?'), ex('2', 'Noem twee grondstoffen.'), ex('3', 'Oude vraag', 'archived')];

  it('adds only new questions and never archives by default', () => {
    const plan = planMerge(existing, [{ topicId: 't', subtopicId: 's', questions: [gq('wat is fotosynthese'), gq('Nieuwe vraag?'), gq('Nieuwe vraag')] }], false);
    expect(plan.toAdd.map((q) => q.questionNl)).toEqual(['Nieuwe vraag?']);
    expect(plan.duplicates).toBe(2);
    expect(plan.toArchive).toEqual([]);
    expect(plan.toRestore).toEqual([]);
  });

  it('does not restore archived questions by default (keeps admin decisions)', () => {
    const plan = planMerge(existing, [{ topicId: 't', subtopicId: 's', questions: [gq('Oude vraag')] }], false);
    expect(plan.toAdd).toEqual([]);
    expect(plan.toRestore).toEqual([]);
  });

  it('replace mode archives questions that were not regenerated and keeps identical ones', () => {
    const plan = planMerge(existing, [{ topicId: 't', subtopicId: 's', questions: [gq('Wat is fotosynthese?'), gq('Oude vraag'), gq('Nieuw')] }], true);
    expect(plan.toArchive).toEqual(['2']);
    expect(plan.toRestore).toEqual(['3']);
    expect(plan.toAdd.map((q) => q.questionNl)).toEqual(['Nieuw']);
  });

  it('assigns topic/subtopic from the generation group', () => {
    const plan = planMerge([], [{ topicId: 'x', subtopicId: 'y', questions: [gq('Q')] }], false);
    expect(plan.toAdd[0]).toMatchObject({ topicId: 'x', subtopicId: 'y', fingerprint: questionFingerprint('Q') });
  });
});
