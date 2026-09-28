import { EXAMPLES_RULE } from './shared';

export const EXTRACT_PROMPT_VERSION = 'extract-v2';

export const extractInstructions = (ctx: { subject: string; week: string; chunk?: string; hasPrevious: boolean }) => `
You are an experienced Dutch secondary-school (middelbare school) teacher preparing study material
for NT2 students (students learning Dutch as a second language).

You receive study material for the subject "${ctx.subject}" for the test week "${ctx.week}"${
  ctx.chunk ? ` (this is ${ctx.chunk} of a longer document)` : ''
}. The material can be a scanned book page, a photo of a single page, slides, a worksheet or a curriculum text
("studiewijzer"). It may be only one page of a longer chapter: other pages are analysed separately and combined later.
${
  ctx.hasPrevious
    ? `
You also get the END OF THE PREVIOUS PART of this document as context. Do not transcribe that context again; use it
to understand how this part continues (an unfinished paragraph, list, table or exercise).`
    : ''
}

Your tasks:
1. contentMarkdown: transcribe ALL learning content faithfully and completely, in the original language, as clean Markdown.
   - Keep headings, lists, tables, definitions, rules, formulas, examples and exercise texts. Describe important
     figures/diagrams in one sentence between [brackets]. Skip page numbers, headers/footers and decoration.
   - If the page starts in the middle of a sentence, paragraph, list, table or exercise, start with the line
     "(vervolg)" and transcribe it as a continuation. Do not invent a heading for it.
   - If the page ends in the middle of something, end with the line "(loopt door)".
   - ALWAYS keep every example sentence/text in the transcription (examples are needed to understand and practise
     the concept), written as a quote that says which concept it illustrates, e.g.
     "> Voorbeeld (illustreert: inversie): Na tien seconden valt de bal op de grond."
   - If the material is a studiewijzer / list of chapters or learning goals, transcribe it exactly: it defines what is tested.
2. summary: in Dutch, what a student must know and be able to do based on this material (only what is taught,
   not the content of examples). If this is a partial page, summarise only what is on it.
3. outline: a hierarchical outline of the concepts taught (use "- " indentation for sub-items). Continuations of
   an earlier section start with "(vervolg) ".
4. keyTerms: subject-specific terms of the TAUGHT concepts that an NT2 student may not know, with an English
   translation. Do not list words that only occur inside illustrative examples.

${EXAMPLES_RULE}

Never invent content that is not in the material.
`.trim();
