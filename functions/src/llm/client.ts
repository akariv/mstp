import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { ResponseInputContent } from 'openai/resources/responses/responses';
import type { z } from 'zod';
import { logger } from 'firebase-functions';
import { OPENAI_API_KEY } from '../common';
import { mockResponse } from './mock';

export const MODEL = process.env.LLM_MODEL || 'gpt-6-sol';
export const isMock = () => process.env.LLM_MODE === 'mock';

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: OPENAI_API_KEY.value(), maxRetries: 3, timeout: 10 * 60_000 });
  return client;
}

export type Part = ResponseInputContent;

export interface StructuredCall<S extends z.ZodType> {
  name: string;
  schema: S;
  instructions: string;
  content: Part[];
  effort?: 'low' | 'medium' | 'high';
}

/** Calls the model with Structured Outputs and returns the parsed, schema-validated result. */
export async function callStructured<S extends z.ZodType>(call: StructuredCall<S>): Promise<z.infer<S>> {
  if (isMock()) return call.schema.parse(mockResponse(call.name, call.content));
  const started = Date.now();
  const res = await getClient().responses.parse({
    model: MODEL,
    reasoning: { effort: call.effort ?? 'medium' },
    instructions: call.instructions,
    input: [{ role: 'user', content: call.content }],
    text: { format: zodTextFormat(call.schema, call.name) },
  });
  logger.info('llm call', { name: call.name, ms: Date.now() - started, usage: res.usage });
  if (!res.output_parsed) throw new Error(`LLM returned no parsable output for ${call.name} (status ${res.status})`);
  return res.output_parsed as z.infer<S>;
}

export const text = (t: string): Part => ({ type: 'input_text', text: t });
