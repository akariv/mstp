import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import pLimit from 'p-limit';
import { FieldValue } from 'firebase-admin/firestore';
import {
  GeneratedQuestionsSchema,
  TopicTreeSchema,
  type Extraction,
  type JobDoc,
  type MaterialDoc,
  type QuestionAnswerDoc,
  type QuestionDoc,
  type SubjectDoc,
  type TestWeekDoc,
} from '@shared';
import { bucket, db, now, OPENAI_API_KEY, REGION, subjectRef } from '../common';
import { callStructured, text } from '../llm/client';
import { generateInstructions } from '../llm/prompts/generate';
import { topicTreeInstructions } from '../llm/prompts/topicTree';
import { failJob, jobLog, jobRef } from './job';
import { planMerge, type ExistingQuestion, type GeneratedForSubtopic } from './merge';
import type { GenerateTask } from './queue';

type Artifact = Extraction & { materialId: string; fileName: string };

export const tmGenerateQuestions = onTaskDispatched<GenerateTask>(
  {
    region: REGION,
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 1800,
    memory: '1GiB',
    retryConfig: { maxAttempts: 1 },
    rateLimits: { maxConcurrentDispatches: 2 },
  },
  async (req) => {
    const { jobId } = req.data;
    try {
      await run(jobId);
    } catch (err) {
      await failJob(jobId, err);
    }
  },
);

async function run(jobId: string) {
  const job = (await jobRef(jobId).get()).data() as JobDoc;
  if (!job || job.status === 'done') return;
  const { weekId, subjectId } = job;
  await jobLog(jobId, 'building topic tree', { status: 'generating' });

  const sRef = subjectRef(weekId, subjectId);
  const [subject, week, materialsSnap, questionsSnap] = await Promise.all([
    sRef.get().then((s) => s.data() as SubjectDoc),
    db.collection('testWeeks').doc(weekId).get().then((s) => s.data() as TestWeekDoc),
    sRef.collection('materials').get(),
    sRef.collection('questions').get(),
  ]);

  const materials = materialsSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as MaterialDoc) }))
    .filter((m) => m.extraction?.status === 'done' && m.extraction.artifactPath);
  if (materials.length === 0) throw new Error('No analysed materials available');

  const artifacts: Artifact[] = await Promise.all(
    materials.map(async (m) => JSON.parse((await bucket().file(m.extraction!.artifactPath!).download())[0].toString('utf8'))),
  );

  // --- 1. Topic tree (extends the existing tree; ids stay stable) ---
  const overview = artifacts
    .map((a) => `### ${a.fileName} — ${a.title}\nSUMMARY:\n${a.summary}\nOUTLINE:\n${a.outline.join('\n')}`)
    .join('\n\n');
  // In replace mode (allowDelete) the tree may be rebuilt from scratch.
  const keepTree = job.allowDelete ? undefined : subject.topicTree;
  const tree = await callStructured({
    name: 'topic_tree',
    schema: TopicTreeSchema,
    instructions: topicTreeInstructions({ subject: subject.name, week: week.name, existing: keepTree }),
    content: [
      text(`MATERIAL OVERVIEW:\n\n${overview}`),
      ...(keepTree?.length ? [text(`EXISTING TOPIC TREE (keep these ids):\n${JSON.stringify(keepTree)}`)] : []),
    ],
    effort: 'medium',
  });
  const topics = keepTree ? mergeTrees(keepTree, tree.topics) : tree.topics;
  await sRef.update({ topicTree: topics, summaryNl: tree.subjectSummaryNl, summaryEn: tree.subjectSummaryEn });

  const subtopics = topics.flatMap((t) => t.subtopics.map((s) => ({ topic: t, sub: s })));
  await jobLog(jobId, `topic tree: ${topics.length} topics, ${subtopics.length} subtopics`, {
    subtopicsTotal: subtopics.length,
  });

  // --- 2. Questions per subtopic ---
  const existing: (ExistingQuestion & { questionNl: string })[] = questionsSnap.docs.map((d) => {
    const q = d.data() as QuestionDoc;
    return { id: d.id, fingerprint: q.fingerprint, status: q.status, topicId: q.topicId, subtopicId: q.subtopicId, questionNl: q.questionNl };
  });

  // Stable prefix first so the provider's prompt cache is reused across subtopic calls.
  const materialText = artifacts.map((a) => `## FILE: ${a.fileName}\n\n${a.contentMarkdown}`).join('\n\n---\n\n');
  const limit = pLimit(4);
  const generated: GeneratedForSubtopic[] = await Promise.all(
    subtopics.map(({ topic, sub }) =>
      limit(async () => {
        const already = job.allowDelete
          ? []
          : existing.filter((q) => q.subtopicId === sub.id && q.topicId === topic.id).map((q) => `- ${q.questionNl}`);
        const res = await callStructured({
          name: 'questions',
          schema: GeneratedQuestionsSchema,
          instructions: generateInstructions(),
          content: [
            text(`SUBJECT: ${subject.name}\nTEST WEEK: ${week.name}\n\nSTUDY MATERIAL:\n\n${materialText}`),
            text(
              [
                `TOPIC: ${topic.nameNl}`,
                `SUBTOPIC: ${sub.nameNl}`,
                `SUBTOPIC GOAL: ${sub.descriptionNl}`,
                `COUNT: ${job.questionsPerSubtopic}`,
                `Write exactly COUNT new questions for this subtopic.`,
                already.length ? `EXISTING QUESTIONS (do not repeat):\n${already.join('\n')}` : '',
              ].join('\n'),
            ),
          ],
          effort: 'medium',
        });
        await jobRef(jobId).update({ subtopicsDone: FieldValue.increment(1), updatedAt: now() });
        return { topicId: topic.id, subtopicId: sub.id, questions: res.questions };
      }),
    ),
  );

  // --- 3. Merge ---
  const plan = planMerge(existing, generated, job.allowDelete);
  const materialIds = materials.map((m) => m.id);
  let batch = db.batch();
  let ops = 0;
  const flushIfFull = async () => {
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  };
  for (const q of plan.toAdd) {
    const ref = sRef.collection('questions').doc();
    const doc: QuestionDoc = {
      topicId: q.topicId,
      subtopicId: q.subtopicId,
      difficulty: q.difficulty,
      questionNl: q.questionNl,
      questionEn: q.questionEn,
      status: 'active',
      sourceMaterialIds: materialIds,
      fingerprint: q.fingerprint,
      createdByJob: jobId,
      createdAt: now(),
    };
    const answer: QuestionAnswerDoc = {
      detailedAnswerNl: q.detailedAnswerNl,
      detailedAnswerEn: q.detailedAnswerEn,
      keyPoints: q.keyPoints,
      rubric: q.rubric,
    };
    batch.set(ref, doc);
    batch.set(ref.collection('private').doc('answer'), answer);
    ops += 2;
    await flushIfFull();
  }
  for (const id of plan.toArchive) {
    batch.update(sRef.collection('questions').doc(id), { status: 'archived' });
    ops++;
    await flushIfFull();
  }
  for (const id of plan.toRestore) {
    batch.update(sRef.collection('questions').doc(id), { status: 'active' });
    ops++;
    await flushIfFull();
  }
  await batch.commit();

  const active = await sRef.collection('questions').where('status', '==', 'active').count().get();
  await sRef.update({ activeQuestionCount: active.data().count });
  await jobLog(
    jobId,
    `done: +${plan.toAdd.length} questions, ${plan.toArchive.length} archived, ${plan.duplicates} duplicates skipped`,
    {
      status: 'done',
      questionsAdded: plan.toAdd.length,
      questionsArchived: plan.toArchive.length,
      questionsDuplicate: plan.duplicates,
    },
  );
}

/** Never lose existing topics/subtopics (their ids are referenced by questions and progress). */
export function mergeTrees(old: SubjectDoc['topicTree'] & {}, next: SubjectDoc['topicTree'] & {}) {
  const result = next.map((t) => ({ ...t, subtopics: [...t.subtopics] }));
  for (const ot of old) {
    const nt = result.find((t) => t.id === ot.id);
    if (!nt) {
      result.push(ot);
      continue;
    }
    for (const os of ot.subtopics) if (!nt.subtopics.some((s) => s.id === os.id)) nt.subtopics.push(os);
  }
  return result;
}
