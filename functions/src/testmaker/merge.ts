import { questionFingerprint, type GeneratedQuestion } from '@shared';

export interface ExistingQuestion {
  id: string;
  fingerprint: string;
  status: 'active' | 'archived';
  topicId: string;
  subtopicId: string;
}

export interface GeneratedForSubtopic {
  topicId: string;
  subtopicId: string;
  questions: GeneratedQuestion[];
}

export interface MergePlan {
  toAdd: (GeneratedQuestion & { topicId: string; subtopicId: string; fingerprint: string })[];
  toArchive: string[];
  toRestore: string[];
  duplicates: number;
}

/**
 * Decide which generated questions to add and which existing ones to archive.
 * - Default (allowDelete=false): only add questions whose fingerprint is new. Nothing is archived.
 * - allowDelete=true ("replace" mode): the generated set becomes the new question bank. Existing questions that were
 *   re-generated identically are kept (and restored if archived) so student progress stays attached; all other
 *   active questions are archived (never hard-deleted).
 */
export function planMerge(existing: ExistingQuestion[], generated: GeneratedForSubtopic[], allowDelete: boolean): MergePlan {
  const byFp = new Map(existing.map((q) => [q.fingerprint, q]));
  const seen = new Set<string>();
  const keptIds = new Set<string>();
  const plan: MergePlan = { toAdd: [], toArchive: [], toRestore: [], duplicates: 0 };

  for (const g of generated) {
    for (const q of g.questions) {
      const fingerprint = questionFingerprint(q.questionNl);
      if (seen.has(fingerprint)) {
        plan.duplicates++;
        continue;
      }
      seen.add(fingerprint);
      const match = byFp.get(fingerprint);
      if (match) {
        plan.duplicates++;
        keptIds.add(match.id);
        if (allowDelete && match.status === 'archived') plan.toRestore.push(match.id);
        continue;
      }
      plan.toAdd.push({ ...q, topicId: g.topicId, subtopicId: g.subtopicId, fingerprint });
    }
  }

  if (allowDelete) {
    for (const q of existing) if (q.status === 'active' && !keptIds.has(q.id)) plan.toArchive.push(q.id);
  }
  return plan;
}
