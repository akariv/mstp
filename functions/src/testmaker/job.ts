import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import type { JobDoc } from '@shared';
import { db, now } from '../common';
import { enqueueGenerate } from './queue';

export const jobRef = (jobId: string) => db.collection('jobs').doc(jobId);

export async function jobLog(jobId: string, msg: string, extra: Partial<JobDoc> = {}) {
  logger.info(`[job ${jobId}] ${msg}`);
  await jobRef(jobId).update({
    ...extra,
    log: FieldValue.arrayUnion(`${new Date().toISOString().slice(11, 19)} ${msg}`),
    updatedAt: now(),
  });
}

/** Marks one material as finished (idempotent) and starts generation once all extractions are done. */
export async function finishMaterial(jobId: string, materialId: string, outcome: 'extracted' | 'failed') {
  const startGeneration = await db.runTransaction(async (tx) => {
    const snap = await tx.get(jobRef(jobId));
    const job = snap.data() as (JobDoc & { finishedMaterials?: string[] }) | undefined;
    if (!job) return false;
    if (job.finishedMaterials?.includes(materialId)) return false;
    const pending = Math.max(0, job.pending - 1);
    tx.update(snap.ref, {
      pending,
      finishedMaterials: FieldValue.arrayUnion(materialId),
      [outcome === 'extracted' ? 'materialsExtracted' : 'materialsFailed']: FieldValue.increment(1),
      ...(pending === 0 ? { status: 'generating' } : {}),
      updatedAt: now(),
    });
    return pending === 0;
  });
  if (startGeneration) await enqueueGenerate({ jobId });
}

export async function failJob(jobId: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  logger.error(`[job ${jobId}] failed`, err);
  await jobRef(jobId).update({
    status: 'error',
    error: msg,
    log: FieldValue.arrayUnion(`ERROR ${msg}`),
    updatedAt: now(),
  });
}
