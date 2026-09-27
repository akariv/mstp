import { z } from 'zod';

export const LangSchema = z.enum(['nl', 'en']);
export type Lang = z.infer<typeof LangSchema>;

export const RoleSchema = z.enum(['student', 'admin']);
export type Role = z.infer<typeof RoleSchema>;

// ---------- LLM output schemas (Structured Outputs: every field required, optional => nullable) ----------

export const ExtractionSchema = z.object({
  title: z.string().describe('Short title of this material, in Dutch'),
  contentMarkdown: z
    .string()
    .describe('Faithful, complete transcription of the learning content as Markdown, in the original language'),
  summary: z.string().describe('Concise summary of what a student must know from this material, in Dutch'),
  outline: z.array(z.string()).describe('Hierarchical outline of the topics covered, one line per item'),
  keyTerms: z
    .array(z.object({ nl: z.string(), en: z.string() }))
    .describe('Important subject-specific terms with English translation'),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

export const SubtopicSchema = z.object({
  id: z.string().describe('Stable kebab-case id'),
  nameNl: z.string(),
  nameEn: z.string(),
  descriptionNl: z.string().describe('What the student must know or be able to do for this subtopic'),
});
export const TopicSchema = z.object({
  id: z.string().describe('Stable kebab-case id'),
  nameNl: z.string(),
  nameEn: z.string(),
  subtopics: z.array(SubtopicSchema),
});
export const TopicTreeSchema = z.object({
  subjectSummaryNl: z.string(),
  subjectSummaryEn: z.string(),
  topics: z.array(TopicSchema),
});
export type Subtopic = z.infer<typeof SubtopicSchema>;
export type Topic = z.infer<typeof TopicSchema>;
export type TopicTree = z.infer<typeof TopicTreeSchema>;

export const GeneratedQuestionSchema = z.object({
  questionNl: z.string(),
  questionEn: z.string(),
  difficulty: z.number().int().min(1).max(5),
  detailedAnswerNl: z.string(),
  detailedAnswerEn: z.string(),
  keyPoints: z.array(z.string()).describe('The points a complete answer must contain (in Dutch)'),
  rubric: z.string().describe('How to grade: what earns full, partial and no credit'),
});
export const GeneratedQuestionsSchema = z.object({ questions: z.array(GeneratedQuestionSchema) });
export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>;

export const VocabItemSchema = z.object({
  nl: z.string().describe('Dutch word in dictionary form (lemma), with article for nouns, e.g. "de fotosynthese"'),
  en: z.string().describe('English meaning'),
  example: z.string().describe('Short Dutch example sentence using the word'),
});
export type VocabItem = z.infer<typeof VocabItemSchema>;

export const EvalLLMSchema = z.object({
  contentScore: z.number().int().min(0).max(100).describe('Correctness and completeness of the content'),
  languageScore: z
    .number()
    .int()
    .min(0)
    .max(100)
    .nullable()
    .describe('Dutch grammar, spelling and wording. null when the answer is in English'),
  feedbackNl: z.string(),
  feedbackEn: z.string(),
  correctedAnswerNl: z
    .string()
    .nullable()
    .describe('The student answer rewritten in correct Dutch, keeping their content. null for English answers'),
  strengthsNl: z.array(z.string()),
  strengthsEn: z.array(z.string()),
  improvementsNl: z.array(z.string()),
  improvementsEn: z.array(z.string()),
  vocabulary: z.array(VocabItemSchema).describe('Hard Dutch words needed to answer this question well'),
});
export type EvalLLM = z.infer<typeof EvalLLMSchema>;

// ---------- Callable payloads ----------

export const EvaluateRequestSchema = z.object({
  weekId: z.string().min(1),
  subjectId: z.string().min(1),
  questionId: z.string().min(1),
  lang: LangSchema,
  answer: z.string().trim().min(1).max(4000),
});
export type EvaluateRequest = z.infer<typeof EvaluateRequestSchema>;

export interface EvaluateResponse {
  score: number;
  contentScore: number;
  languageScore: number | null;
  feedbackNl: string;
  feedbackEn: string;
  correctedAnswerNl: string | null;
  strengthsNl: string[];
  strengthsEn: string[];
  improvementsNl: string[];
  improvementsEn: string[];
  vocabulary: VocabItem[];
  newWords: string[];
  modelAnswerNl: string;
  modelAnswerEn: string;
  previousBest: number | null;
  isPersonalBest: boolean;
  xpGained: number;
  newBadges: string[];
}

export const StartTestMakerSchema = z.object({
  weekId: z.string().min(1),
  subjectId: z.string().min(1),
  forceReanalyze: z.boolean().default(false),
  allowDeleteQuestions: z.boolean().default(false),
  questionsPerSubtopic: z.number().int().min(2).max(20).default(6),
});
export type StartTestMakerRequest = z.input<typeof StartTestMakerSchema>;

export const UpsertAllowedUserSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  role: RoleSchema.nullable(), // null = remove
  name: z.string().default(''),
});
export type UpsertAllowedUserRequest = z.input<typeof UpsertAllowedUserSchema>;
