import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { logger } from 'firebase-functions';
import { ExtractionSchema, type Extraction, type MaterialDoc, type SubjectDoc, type TestWeekDoc } from '@shared';
import { bucket, db, now, OPENAI_API_KEY, REGION, subjectRef } from '../common';
import { callStructured, MODEL, text } from '../llm/client';
import { EXTRACT_PROMPT_VERSION, extractInstructions } from '../llm/prompts/extract';
import { finishMaterial, jobLog } from './job';
import { materialToChunks } from './parts';
import { tailContext } from './order';
import type { ExtractTask } from './queue';

export const artifactPath = (weekId: string, subjectId: string, materialId: string) =>
  `artifacts/${weekId}/${subjectId}/${materialId}.json`;

export const tmExtractMaterial = onTaskDispatched<ExtractTask>(
  {
    region: REGION,
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 1800,
    memory: '2GiB',
    retryConfig: { maxAttempts: 2, minBackoffSeconds: 30 },
    rateLimits: { maxConcurrentDispatches: 4 },
  },
  async (req) => {
    const { jobId, weekId, subjectId, materialId } = req.data;
    const sRef = subjectRef(weekId, subjectId);
    const mRef = sRef.collection('materials').doc(materialId);
    const material = (await mRef.get()).data() as MaterialDoc | undefined;
    if (!material) {
      await jobLog(jobId, `material ${materialId} no longer exists`);
      return finishMaterial(jobId, materialId, 'failed');
    }

    try {
      await mRef.update({ 'extraction.status': 'running' });
      await jobLog(jobId, `analysing ${material.fileName}`);
      const [subject, week] = await Promise.all([
        sRef.get().then((s) => s.data() as SubjectDoc),
        db.collection('testWeeks').doc(weekId).get().then((s) => s.data() as TestWeekDoc),
      ]);

      const [buf] = await bucket().file(material.storagePath).download();
      const chunks = await materialToChunks(buf, material.mimeType, material.fileName);
      const results: Extraction[] = [];
      // Parts of one document are read in order; each part sees the end of the previous one so sections that
      // cross a part boundary are continued instead of restarted.
      for (const chunk of chunks) {
        const previous = results.at(-1);
        results.push(
          await callStructured({
            name: 'extraction',
            schema: ExtractionSchema,
            instructions: extractInstructions({
              subject: subject.name,
              week: week.name,
              chunk: chunk.label,
              hasPrevious: !!previous,
            }),
            content: [
              ...(previous ? [text(`END OF THE PREVIOUS PART (context only):\n\n${tailContext(previous.contentMarkdown)}`)] : []),
              ...chunk.parts,
              text(`File name: ${material.fileName}`),
            ],
            effort: 'medium',
          }),
        );
      }
      const extraction = combine(results);
      const path = artifactPath(weekId, subjectId, materialId);
      await bucket()
        .file(path)
        .save(JSON.stringify({ materialId, fileName: material.fileName, ...extraction }), {
          contentType: 'application/json',
        });
      await mRef.update({
        extraction: {
          status: 'done',
          artifactPath: path,
          sha256: material.sha256,
          model: MODEL,
          promptVersion: EXTRACT_PROMPT_VERSION,
          title: extraction.title,
          at: now(),
        },
      });
      await jobLog(jobId, `done ${material.fileName} (${chunks.length} part${chunks.length > 1 ? 's' : ''})`);
      await finishMaterial(jobId, materialId, 'extracted');
    } catch (err) {
      logger.error('extraction failed', err);
      const msg = err instanceof Error ? err.message : String(err);
      await mRef.update({ 'extraction.status': 'error', 'extraction.error': msg });
      await jobLog(jobId, `FAILED ${material.fileName}: ${msg}`);
      await finishMaterial(jobId, materialId, 'failed');
    }
  },
);

function combine(parts: Extraction[]): Extraction {
  if (parts.length === 1) return parts[0];
  return {
    title: parts[0].title,
    contentMarkdown: parts.map((p) => p.contentMarkdown).join('\n\n'),
    summary: parts.map((p) => p.summary).join('\n\n'),
    outline: parts.flatMap((p) => p.outline),
    keyTerms: [...new Map(parts.flatMap((p) => p.keyTerms).map((t) => [t.nl.toLowerCase(), t])).values()],
  };
}
