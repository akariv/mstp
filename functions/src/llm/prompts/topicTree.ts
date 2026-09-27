import type { Topic } from '@shared';

export const TOPICS_PROMPT_VERSION = 'topics-v1';

export const topicTreeInstructions = (ctx: { subject: string; week: string; existing: Topic[] | undefined }) => `
You are an experienced Dutch secondary-school teacher. Organise ALL test material for the subject "${ctx.subject}"
(test week "${ctx.week}") into a topic tree used to group practice questions.

Rules:
- Cover the entire material: every chapter, paragraph and learning goal must belong to exactly one subtopic.
- Use roughly 2-8 topics, each with 2-6 subtopics. Subtopics should be concrete enough to practise in one session.
- Names in Dutch (nameNl) and English (nameEn). ids: short, stable, kebab-case, unique within the tree.
- descriptionNl: 1-2 sentences on what the student must know or be able to do.
- subjectSummaryNl / subjectSummaryEn: short overview (3-5 sentences) of what this test is about.
${
  ctx.existing?.length
    ? `- An existing topic tree is given. KEEP every existing topic and subtopic with the SAME id (you may improve
  names/descriptions slightly). Only ADD new topics/subtopics for material that is not yet covered.`
    : ''
}
`.trim();
