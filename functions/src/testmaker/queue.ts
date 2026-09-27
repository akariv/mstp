import { getFunctions } from 'firebase-admin/functions';
import { REGION } from '../common';

export interface ExtractTask {
  jobId: string;
  weekId: string;
  subjectId: string;
  materialId: string;
}
export interface GenerateTask {
  jobId: string;
}

const queue = (name: string) => getFunctions().taskQueue(`locations/${REGION}/functions/${name}`);

export const enqueueExtract = (t: ExtractTask) => queue('tmExtractMaterial').enqueue(t, { dispatchDeadlineSeconds: 1800 });
export const enqueueGenerate = (t: GenerateTask) =>
  queue('tmGenerateQuestions').enqueue(t, { dispatchDeadlineSeconds: 1800, id: `gen-${t.jobId}` });
