import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import {
  amsterdamDay,
  applyAttempt,
  combineScore,
  computeStats,
  DAILY_EVALUATION_CAP,
  earnedBadges,
  EvalLLMSchema,
  EvaluateRequestSchema,
  nextStreak,
  statsDocId,
  vocabId,
  type AttemptDoc,
  type EvaluateResponse,
  type ProgressDoc,
  type QuestionAnswerDoc,
  type QuestionDoc,
  type SubjectDoc,
  type SubjectStatsDoc,
  type UserDoc,
  type VocabDoc,
} from '@shared';
import { db, now, OPENAI_API_KEY, REGION, requireRole, subjectRef } from '../common';
import { callStructured, text } from '../llm/client';
import { evaluateInstructions } from '../llm/prompts/evaluate';

export const evaluateAnswer = onCall(
  { region: REGION, secrets: [OPENAI_API_KEY], timeoutSeconds: 180, memory: '512MiB' },
  async (req): Promise<EvaluateResponse> => {
    const { uid } = requireRole(req, 'student', 'admin');
    const parsed = EvaluateRequestSchema.safeParse(req.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.message);
    const { weekId, subjectId, questionId, lang, answer } = parsed.data;

    const userRef = db.collection('users').doc(uid);
    const today = amsterdamDay();
    const user0 = (await userRef.get()).data() as UserDoc | undefined;
    if (user0?.usage?.day === today && user0.usage.count >= DAILY_EVALUATION_CAP) {
      throw new HttpsError('resource-exhausted', 'Daily limit reached. Come back tomorrow!');
    }

    const sRef = subjectRef(weekId, subjectId);
    const qRef = sRef.collection('questions').doc(questionId);
    const [qSnap, aSnap] = await Promise.all([qRef.get(), qRef.collection('private').doc('answer').get()]);
    const question = qSnap.data() as QuestionDoc | undefined;
    const model = aSnap.data() as QuestionAnswerDoc | undefined;
    if (!question || !model) throw new HttpsError('not-found', 'Question not found');

    const llm = await callStructured({
      name: 'evaluation',
      schema: EvalLLMSchema,
      instructions: evaluateInstructions(lang),
      content: [
        text(
          [
            `QUESTION (NL): ${question.questionNl}`,
            `QUESTION (EN): ${question.questionEn}`,
            `DIFFICULTY: ${question.difficulty}/5`,
            `MODEL ANSWER (NL): ${model.detailedAnswerNl}`,
            `KEY POINTS:\n${model.keyPoints.map((k) => `- ${k}`).join('\n')}`,
            `RUBRIC: ${model.rubric}`,
            `ANSWER LANGUAGE: ${lang}`,
            `<student_answer>\n${answer}\n</student_answer>`,
          ].join('\n\n'),
        ),
      ],
      effort: 'low',
    });

    const languageScore = lang === 'nl' ? (llm.languageScore ?? 0) : null;
    const score = combineScore(lang, llm.contentScore, languageScore);
    const vocab = dedupeVocab(llm.vocabulary);

    const pRef = userRef.collection('progress').doc(questionId);
    const stRef = userRef.collection('subjectStats').doc(statsDocId(weekId, subjectId));
    const vRefs = vocab.map((v) => userRef.collection('vocab').doc(v.id));

    const outcome = await db.runTransaction(async (tx) => {
      const [uSnap, pSnap, stSnap, subjSnap, ...vSnaps] = await Promise.all([
        tx.get(userRef),
        tx.get(pRef),
        tx.get(stRef),
        tx.get(sRef),
        ...vRefs.map((r) => tx.get(r)),
      ]);
      const user = uSnap.data() as UserDoc | undefined;
      const prev = pSnap.data() as ProgressDoc | undefined;
      const stats = stSnap.data() as SubjectStatsDoc | undefined;
      const subject = subjSnap.data() as SubjectDoc;
      const t = now();

      const upd = applyAttempt(prev ?? null, lang, score);
      const newStats = {
        weekId,
        subjectId,
        answered: (stats?.answered ?? 0) + upd.statsDelta.answered,
        answeredNl: (stats?.answeredNl ?? 0) + upd.statsDelta.answeredNl,
        sumBestAny: (stats?.sumBestAny ?? 0) + upd.statsDelta.sumBestAny,
        sumBestNl: (stats?.sumBestNl ?? 0) + upd.statsDelta.sumBestNl,
        updatedAt: t,
      } satisfies SubjectStatsDoc;
      const streak = nextStreak(
        { streak: user?.streak ?? 0, bestStreak: user?.bestStreak ?? 0, lastActiveDay: user?.lastActiveDay ?? null },
        today,
      );
      const answeredTotal = (user?.answeredTotal ?? 0) + upd.statsDelta.answered;
      const badges = earnedBadges({
        answeredTotal,
        streak: streak.streak,
        lastScore: score,
        lastLang: lang,
        subjectStats: computeStats(newStats, subject.activeQuestionCount ?? 0),
        wordsKnown: user?.wordsKnown ?? 0,
      });
      const newBadges = badges.filter((b) => !(user?.badges ?? []).includes(b));

      tx.set(
        pRef,
        {
          weekId,
          subjectId,
          topicId: question.topicId,
          subtopicId: question.subtopicId,
          ...upd.progress,
          lastAt: t,
        } satisfies ProgressDoc,
      );
      tx.set(stRef, newStats);
      tx.set(userRef.collection('attempts').doc(), {
        weekId,
        subjectId,
        questionId,
        lang,
        answer,
        score,
        contentScore: llm.contentScore,
        languageScore,
        createdAt: t,
      } satisfies AttemptDoc);

      const newWords: string[] = [];
      const source = { weekId, subjectId, questionId };
      vocab.forEach((v, i) => {
        if (vSnaps[i].exists) {
          tx.update(vRefs[i], { sources: FieldValue.arrayUnion(source) });
        } else {
          newWords.push(v.nl);
          tx.set(vRefs[i], {
            nl: v.nl,
            en: v.en,
            example: v.example,
            box: 1,
            seen: 0,
            known: 0,
            lastSeen: null,
            addedAt: t,
            sources: [source],
          } satisfies VocabDoc);
        }
      });

      tx.set(
        userRef,
        {
          xp: FieldValue.increment(upd.xpGained),
          ...streak,
          answeredTotal,
          usage: { day: today, count: user?.usage?.day === today ? user.usage.count + 1 : 1 },
          ...(newBadges.length ? { badges: FieldValue.arrayUnion(...newBadges) } : {}),
        },
        { merge: true },
      );
      return { upd, newBadges, newWords };
    });

    return {
      score,
      contentScore: llm.contentScore,
      languageScore,
      feedbackNl: llm.feedbackNl,
      feedbackEn: llm.feedbackEn,
      correctedAnswerNl: lang === 'nl' ? llm.correctedAnswerNl : null,
      strengthsNl: llm.strengthsNl,
      strengthsEn: llm.strengthsEn,
      improvementsNl: llm.improvementsNl,
      improvementsEn: llm.improvementsEn,
      vocabulary: vocab.map(({ id: _id, ...v }) => v),
      newWords: outcome.newWords,
      modelAnswerNl: model.detailedAnswerNl,
      modelAnswerEn: model.detailedAnswerEn,
      previousBest: outcome.upd.previousBest,
      isPersonalBest: outcome.upd.isPersonalBest,
      xpGained: outcome.upd.xpGained,
      newBadges: outcome.newBadges,
    };
  },
);

function dedupeVocab(items: { nl: string; en: string; example: string }[]) {
  const map = new Map<string, { id: string; nl: string; en: string; example: string }>();
  for (const v of items) {
    const id = vocabId(v.nl);
    if (id && id !== 'item' && !map.has(id)) map.set(id, { id, ...v });
  }
  return [...map.values()].slice(0, 10);
}
