// End-to-end test against the Firebase emulators (Auth, Firestore, Storage, Functions, Tasks).
// Run with: npm run test:e2e              (mock LLM, used in CI)
//           npm run test:e2e:real         (real OpenAI model, needs functions/.secret.local)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as adminDb } from 'firebase-admin/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, getFirestore, setDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { connectStorageEmulator, getStorage, ref, uploadBytes } from 'firebase/storage';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { createHash } from 'node:crypto';

const PROJECT = 'demo-mstp';
const BUCKET = `${PROJECT}.appspot.com`;
const REGION = 'europe-west1';
const JOB_TIMEOUT_MS = Number(process.env.E2E_JOB_TIMEOUT_MS ?? 15 * 60_000);

initAdmin({ projectId: PROJECT });
const adb = adminDb();

let n = 0;
async function client(email) {
  const app = initializeApp({ apiKey: 'fake', projectId: PROJECT, storageBucket: BUCKET, authDomain: 'localhost' }, `c${n++}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const storage = getStorage(app);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  const fns = getFunctions(app, REGION);
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  // The Auth emulator accepts an unsigned JSON "id token" for IdP sign-in.
  const cred = GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true }));
  const { user } = await signInWithCredential(auth, cred);
  const token = await user.getIdTokenResult(true);
  return { app, db, storage, user, role: token.claims.role, call: (name, data) => httpsCallable(fns, name, { timeout: 300_000 })(data) };
}

async function makePdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const lines = [
    'Hoofdstuk 3 Planten - 3.1 Fotosynthese',
    'Planten maken zelf voedsel. Dit heet fotosynthese.',
    'Voor fotosynthese zijn koolstofdioxide (CO2), water en licht nodig.',
    'In de bladgroenkorrels wordt met lichtenergie glucose gemaakt. Daarbij ontstaat zuurstof.',
    'Koolstofdioxide komt het blad binnen via de huidmondjes aan de onderkant van het blad.',
    'Water wordt door de wortels opgenomen en via de houtvaten in de nerven naar het blad vervoerd.',
    '3.4 Verbranding: bij verbranding (dissimilatie) wordt glucose met zuurstof afgebroken.',
    'Daarbij komt energie vrij en ontstaan koolstofdioxide en water. Verbranding gebeurt dag en nacht.',
  ];
  const page = pdf.addPage([595, 842]);
  lines.forEach((t, i) => page.drawText(t, { x: 40, y: 780 - i * 22, size: 11, font }));
  return Buffer.from(await pdf.save());
}

async function waitForJob(jobId) {
  const started = Date.now();
  for (;;) {
    const job = (await adb.doc(`jobs/${jobId}`).get()).data();
    if (job?.status === 'done' || job?.status === 'error') return job;
    if (Date.now() - started > JOB_TIMEOUT_MS) throw new Error(`job ${jobId} timed out: ${JSON.stringify(job)}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

const step = (s) => console.log(`\n▶ ${s}`);

// ---------------------------------------------------------------------------------------------------------------
step('allowlist');
await adb.doc('allowedUsers/admin@test.nl').set({ role: 'admin', name: 'Admin' });
await adb.doc('allowedUsers/kid@test.nl').set({ role: 'student', name: 'Kid' });

const admin = await client('admin@test.nl');
assert.equal(admin.role, 'admin');
const kid = await client('kid@test.nl');
assert.equal(kid.role, 'student');
assert.ok((await adb.doc(`users/${kid.user.uid}`).get()).exists, 'user doc created on sign-in');
await assert.rejects(client('stranger@test.nl'), /NOT_ALLOWED|BLOCKING|permission/i, 'stranger must be blocked');
console.log('  ✓ allowlisted users get roles, strangers are blocked');

step('admin sets up week, subject and materials');
await setDoc(doc(admin.db, 'testWeeks/tw1'), { name: 'Toetsweek 1', order: 1 });
await setDoc(doc(admin.db, 'testWeeks/tw1/subjects/biologie'), { name: 'Biologie', nameEn: 'Biology', order: 1, activeQuestionCount: 0 });
const files = [
  { id: 'm1', name: 'hoofdstuk3.pdf', type: 'application/pdf', data: await makePdf() },
  { id: 'm2', name: 'studiewijzer.txt', type: 'text/plain', data: readFileSync('tests/fixtures/studiewijzer-biologie.txt') },
];
for (const f of files) {
  const path = `materials/tw1/biologie/${f.id}-${f.name}`;
  await uploadBytes(ref(admin.storage, path), f.data, { contentType: f.type });
  await setDoc(doc(admin.db, `testWeeks/tw1/subjects/biologie/materials/${f.id}`), {
    fileName: f.name,
    storagePath: path,
    mimeType: f.type,
    size: f.data.length,
    sha256: createHash('sha256').update(f.data).digest('hex'),
    uploadedAt: Date.now(),
  });
}
await assert.rejects(kid.call('startTestMaker', { weekId: 'tw1', subjectId: 'biologie' }), /permission|not allowed/i);
console.log('  ✓ materials uploaded; students cannot run the test maker');

step('test maker: first run');
const { data: r1 } = await admin.call('startTestMaker', { weekId: 'tw1', subjectId: 'biologie', questionsPerSubtopic: 3 });
const job1 = await waitForJob(r1.jobId);
console.log('  ' + job1.log.join('\n  '));
assert.equal(job1.status, 'done', job1.error);
assert.equal(job1.materialsExtracted, 2);
assert.ok(job1.questionsAdded > 0);
const subj = (await adb.doc('testWeeks/tw1/subjects/biologie').get()).data();
assert.ok(subj.topicTree.length > 0, 'topic tree');
assert.equal(subj.activeQuestionCount, job1.questionsAdded);
const qs = await adb.collection('testWeeks/tw1/subjects/biologie/questions').get();
const q0 = qs.docs[0];
assert.ok((await q0.ref.collection('private').doc('answer').get()).data().detailedAnswerNl, 'model answer stored privately');
for (const d of qs.docs) {
  const q = d.data();
  assert.ok(q.difficulty >= 1 && q.difficulty <= 5 && q.questionNl && q.questionEn && q.topicId && q.subtopicId);
}
console.log(`  ✓ ${qs.size} questions over ${subj.topicTree.length} topics`);

step('test maker: second run reuses analysis and keeps questions');
const { data: r2 } = await admin.call('startTestMaker', { weekId: 'tw1', subjectId: 'biologie', questionsPerSubtopic: 2 });
const job2 = await waitForJob(r2.jobId);
assert.equal(job2.status, 'done', job2.error);
assert.equal(job2.materialsSkipped, 2, 'no re-analysis without force');
assert.equal(job2.questionsArchived, 0, 'nothing archived by default');
const qs2 = await adb.collection('testWeeks/tw1/subjects/biologie/questions').where('status', '==', 'active').get();
assert.ok(qs2.size >= qs.size, 'existing questions kept');
console.log(`  ✓ cached analysis reused, +${job2.questionsAdded} new questions (${job2.questionsDuplicate} duplicates skipped)`);

step('student practises');
await assert.rejects(getDoc(doc(kid.db, `testWeeks/tw1/subjects/biologie/questions/${q0.id}/private/answer`)));
const visible = await getDocs(query(collection(kid.db, 'testWeeks/tw1/subjects/biologie/questions'), where('status', '==', 'active')));
assert.ok(visible.size > 0);
const qid = q0.id;
const ask = (lang, answer) => kid.call('evaluateAnswer', { weekId: 'tw1', subjectId: 'biologie', questionId: qid, lang, answer });

const en = (await ask('en', 'Plants use light, carbon dioxide and water to make glucose and oxygen in the chloroplasts.')).data;
console.log(`  EN score ${en.score}: ${en.feedbackEn}`);
assert.ok(en.score >= 0 && en.score <= 100);
assert.equal(en.languageScore, null);
assert.ok(en.feedbackNl && en.feedbackEn && en.modelAnswerNl);
assert.ok(en.vocabulary.length > 0, 'vocabulary returned');

const nl = (await ask('nl', 'De plant maakt glucose met licht, water en koolstofdioxide. Er komt zuurstof vrij.')).data;
console.log(`  NL score ${nl.score} (content ${nl.contentScore}, taal ${nl.languageScore}): ${nl.feedbackNl}`);
assert.ok(nl.languageScore != null, 'Dutch answers get a language score');

const prog = (await adb.doc(`users/${kid.user.uid}/progress/${qid}`).get()).data();
assert.equal(prog.attempts, 2);
assert.equal(prog.bestEn, en.score);
assert.equal(prog.bestNl, nl.score);
const stats = (await adb.doc(`users/${kid.user.uid}/subjectStats/tw1__biologie`).get()).data();
assert.equal(stats.answered, 1);
assert.equal(stats.answeredNl, 1);
assert.equal(stats.sumBestAny, Math.max(en.score, nl.score));
const user = (await adb.doc(`users/${kid.user.uid}`).get()).data();
assert.equal(user.xp, en.xpGained + nl.xpGained);
assert.equal(user.streak, 1);
assert.ok(user.badges.includes('first-answer'));
const vocab = await adb.collection(`users/${kid.user.uid}/vocab`).get();
assert.ok(vocab.size > 0);
console.log(`  ✓ progress, stats, XP (${user.xp}), streak, badges and ${vocab.size} vocab words saved`);

await Promise.all([admin, kid].map((c) => deleteApp(c.app)));
console.log('\n✅ e2e passed');
process.exit(0);
