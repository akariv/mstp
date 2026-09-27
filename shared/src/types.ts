import type { Lang, Role, TopicTree } from './schemas';

export type Millis = number;

export interface AllowedUserDoc {
  role: Role;
  name: string;
}

export interface UserDoc {
  email: string;
  name: string;
  photoURL?: string;
  uiLang: Lang;
  xp: number;
  streak: number;
  bestStreak: number;
  lastActiveDay: string | null; // YYYY-MM-DD (Europe/Amsterdam)
  usage: { day: string; count: number };
  badges: string[];
  answeredTotal: number;
  wordsKnown: number;
}

export interface TestWeekDoc {
  name: string;
  order: number;
  startDate?: string;
  endDate?: string;
}

export interface SubjectDoc {
  name: string;
  nameEn?: string;
  order: number;
  summaryNl?: string;
  summaryEn?: string;
  topicTree?: TopicTree['topics'];
  activeQuestionCount: number;
  lastJobId?: string;
}

export type ExtractionStatus = 'pending' | 'running' | 'done' | 'error';

export interface MaterialDoc {
  fileName: string;
  storagePath: string;
  mimeType: string;
  size: number;
  sha256: string;
  uploadedAt: Millis;
  extraction?: {
    status: ExtractionStatus;
    artifactPath?: string;
    sha256?: string;
    model?: string;
    promptVersion?: string;
    title?: string;
    at?: Millis;
    error?: string;
  };
}

export type QuestionStatus = 'active' | 'archived';

export interface QuestionDoc {
  topicId: string;
  subtopicId: string;
  difficulty: number;
  questionNl: string;
  questionEn: string;
  status: QuestionStatus;
  sourceMaterialIds: string[];
  fingerprint: string;
  createdByJob: string;
  createdAt: Millis;
}

export interface QuestionAnswerDoc {
  detailedAnswerNl: string;
  detailedAnswerEn: string;
  keyPoints: string[];
  rubric: string;
}

export type JobStatus = 'queued' | 'extracting' | 'generating' | 'done' | 'error';

export interface JobDoc {
  weekId: string;
  subjectId: string;
  force: boolean;
  allowDelete: boolean;
  questionsPerSubtopic: number;
  status: JobStatus;
  pending: number;
  materialsTotal: number;
  materialsSkipped: number;
  materialsExtracted: number;
  materialsFailed: number;
  questionsAdded: number;
  questionsArchived: number;
  questionsDuplicate: number;
  subtopicsDone: number;
  subtopicsTotal: number;
  createdBy: string;
  createdAt: Millis;
  updatedAt: Millis;
  error?: string;
  log: string[];
}

export interface ProgressDoc {
  weekId: string;
  subjectId: string;
  topicId: string;
  subtopicId: string;
  bestEn: number | null;
  bestNl: number | null;
  attempts: number;
  lastAt: Millis;
}

export interface AttemptDoc {
  weekId: string;
  subjectId: string;
  questionId: string;
  lang: Lang;
  answer: string;
  score: number;
  contentScore: number;
  languageScore: number | null;
  createdAt: Millis;
}

export interface VocabDoc {
  nl: string;
  en: string;
  example: string;
  box: number; // Leitner box 1..5
  seen: number;
  known: number;
  lastSeen: Millis | null;
  addedAt: Millis;
  sources: { weekId: string; subjectId: string; questionId: string }[];
}

export interface SubjectStatsDoc {
  weekId: string;
  subjectId: string;
  answered: number;
  answeredNl: number;
  sumBestAny: number;
  sumBestNl: number;
  updatedAt: Millis;
}
