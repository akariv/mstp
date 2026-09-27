import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { StartTestMakerSchema, type JobDoc, type MaterialDoc, type SubjectDoc } from '@shared';
import { db, now, REGION, requireRole, subjectRef } from '../common';
import { MODEL } from '../llm/client';
import { EXTRACT_PROMPT_VERSION } from '../llm/prompts/extract';
import { enqueueExtract, enqueueGenerate } from './queue';

const STALE_JOB_MS = 45 * 60_000;

export function needsExtraction(m: MaterialDoc, force: boolean): boolean {
  if (force) return true;
  const e = m.extraction;
  return !(
    e?.status === 'done' &&
    e.sha256 === m.sha256 &&
    e.model === MODEL &&
    e.promptVersion === EXTRACT_PROMPT_VERSION
  );
}

export const startTestMaker = onCall({ region: REGION }, async (req) => {
  const { uid } = requireRole(req, 'admin');
  const parsed = StartTestMakerSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.message);
  const { weekId, subjectId, forceReanalyze, allowDeleteQuestions, questionsPerSubtopic } = parsed.data;

  const sRef = subjectRef(weekId, subjectId);
  const subject = (await sRef.get()).data() as SubjectDoc | undefined;
  if (!subject) throw new HttpsError('not-found', 'Subject not found');

  if (subject.lastJobId) {
    const last = (await db.collection('jobs').doc(subject.lastJobId).get()).data() as JobDoc | undefined;
    if (last && !['done', 'error'].includes(last.status) && now() - last.updatedAt < STALE_JOB_MS) {
      throw new HttpsError('failed-precondition', 'A job for this subject is already running');
    }
  }

  const materials = await sRef.collection('materials').get();
  if (materials.empty) throw new HttpsError('failed-precondition', 'Upload materials first');
  const toExtract = materials.docs.filter((d) => needsExtraction(d.data() as MaterialDoc, forceReanalyze));

  const jobRef = db.collection('jobs').doc();
  const job: JobDoc = {
    weekId,
    subjectId,
    force: forceReanalyze,
    allowDelete: allowDeleteQuestions,
    questionsPerSubtopic,
    status: toExtract.length ? 'extracting' : 'generating',
    pending: toExtract.length,
    materialsTotal: materials.size,
    materialsSkipped: materials.size - toExtract.length,
    materialsExtracted: 0,
    materialsFailed: 0,
    questionsAdded: 0,
    questionsArchived: 0,
    questionsDuplicate: 0,
    subtopicsDone: 0,
    subtopicsTotal: 0,
    createdBy: uid,
    createdAt: now(),
    updatedAt: now(),
    log: [
      `${new Date().toISOString().slice(11, 19)} started: ${toExtract.length} to analyse, ${
        materials.size - toExtract.length
      } cached`,
    ],
  };
  await jobRef.set(job);
  await sRef.update({ lastJobId: jobRef.id });

  const batch = db.batch();
  for (const d of toExtract) batch.update(d.ref, { 'extraction.status': 'pending' });
  await batch.commit();

  if (toExtract.length === 0) await enqueueGenerate({ jobId: jobRef.id });
  else await Promise.all(toExtract.map((d) => enqueueExtract({ jobId: jobRef.id, weekId, subjectId, materialId: d.id })));

  return { jobId: jobRef.id };
});
