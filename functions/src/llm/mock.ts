import type { Part } from './client';

/** Deterministic fake LLM responses for local emulator runs and tests (LLM_MODE=mock). */
let counter = 0;

function allText(content: Part[]): string {
  return content.map((p) => (p.type === 'input_text' ? p.text : '')).join('\n');
}

export function mockResponse(name: string, content: Part[]): unknown {
  const t = allText(content);
  switch (name) {
    case 'extraction':
      return {
        title: 'Hoofdstuk (mock)',
        contentMarkdown: '# Fotosynthese\nPlanten maken glucose uit koolstofdioxide en water met behulp van licht.',
        summary: 'Planten maken met licht glucose uit CO2 en water (fotosynthese).',
        outline: ['Fotosynthese', '- Grondstoffen', '- Producten'],
        keyTerms: [{ nl: 'de fotosynthese', en: 'photosynthesis' }],
      };
    case 'topic_tree':
      return {
        subjectSummaryNl: 'Mock samenvatting van het vak.',
        subjectSummaryEn: 'Mock subject summary.',
        topics: [
          {
            id: 'fotosynthese',
            nameNl: 'Fotosynthese',
            nameEn: 'Photosynthesis',
            subtopics: [
              { id: 'grondstoffen', nameNl: 'Grondstoffen', nameEn: 'Raw materials', descriptionNl: 'CO2 en water' },
              { id: 'producten', nameNl: 'Producten', nameEn: 'Products', descriptionNl: 'Glucose en zuurstof' },
            ],
          },
        ],
      };
    case 'questions': {
      const sub = /SUBTOPIC: (.*)/.exec(t)?.[1] ?? 'onderwerp';
      const n = Number(/COUNT: (\d+)/.exec(t)?.[1] ?? 3);
      return {
        questions: Array.from({ length: n }, (_, i) => {
          const k = ++counter;
          return {
            questionNl: `Mockvraag ${k} over ${sub}: wat weet je hierover?`,
            questionEn: `Mock question ${k} about ${sub}: what do you know about it?`,
            difficulty: (i % 5) + 1,
            detailedAnswerNl: `Een goed antwoord over ${sub}.`,
            detailedAnswerEn: `A good answer about ${sub}.`,
            keyPoints: ['punt 1', 'punt 2'],
            rubric: 'Beide punten = 100, één punt = 50.',
          };
        }),
      };
    }
    case 'takeaways': {
      const sub = /SUBTOPIC: (.*)/.exec(t)?.[1] ?? 'onderwerp';
      return {
        sections: [
          {
            headingNl: 'Kernbegrippen',
            headingEn: 'Core concepts',
            sentences: [
              { nl: `${sub} is belangrijk (mock).`, en: `${sub} is important (mock).` },
              { nl: 'Planten maken glucose met licht.', en: 'Plants make glucose using light.' },
            ],
          },
        ],
        keyTerms: [{ nl: 'de fotosynthese', en: 'photosynthesis', explanationNl: 'glucose maken met licht', explanationEn: 'making glucose with light' }],
      };
    }
    case 'evaluation': {
      const answer = /<student_answer>([\s\S]*?)<\/student_answer>/.exec(t)?.[1]?.trim() ?? '';
      const isNl = /ANSWER LANGUAGE: nl/.test(t);
      const contentScore = Math.min(100, answer.length * 3);
      return {
        contentScore,
        languageScore: isNl ? 70 : null,
        feedbackNl: 'Goed geprobeerd! (mock)',
        feedbackEn: 'Nice try! (mock)',
        correctedAnswerNl: isNl ? answer : null,
        strengthsNl: ['Je noemt het onderwerp.'],
        strengthsEn: ['You mention the topic.'],
        improvementsNl: ['Leg meer uit.'],
        improvementsEn: ['Explain more.'],
        vocabulary: [
          { nl: 'de fotosynthese', en: 'photosynthesis', example: 'Fotosynthese gebeurt in het blad.' },
          { nl: 'de grondstof', en: 'raw material', example: 'Water is een grondstof.' },
        ],
      };
    }
    default:
      throw new Error(`No mock for ${name}`);
  }
}
