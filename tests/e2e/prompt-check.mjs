// Manual prompt-quality check with the REAL model (run: npm run check:prompts).
// Scenario: a Dutch grammar lesson split over two page files, with the explanation of "inversie" running across
// the page break and all example sentences about physics. Expected: examples kept in the transcript, the
// continuation joined, topics and questions about grammar only (nothing about physics).
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { createHash } from 'node:crypto';

initAdmin({ projectId: 'demo-mstp', storageBucket: 'demo-mstp.appspot.com' });
const db = getFirestore();
const pages = [
  ['Hoofdstuk 4  Zinsbouw', '4.1 De persoonsvorm en de volgorde in de zin',
   'In een gewone mededelende zin staat de persoonsvorm altijd op de tweede plaats.',
   'Het onderwerp staat meestal op de eerste plaats. Dit noemen we de normale volgorde.',
   'Voorbeeld: De bal valt naar beneden door de zwaartekracht.',
   'Voorbeeld: Een magneet trekt ijzer aan.',
   'Begint de zin met iets anders dan het onderwerp, bijvoorbeeld een tijdsbepaling of',
   'een plaatsbepaling, dan verandert de volgorde. Het onderwerp komt dan'],
  ['direct na de persoonsvorm te staan. Dit heet inversie.',
   'Voorbeeld: Na tien seconden valt de bal op de grond.',
   'Voorbeeld: In een vacuum vallen alle voorwerpen even snel.',
   '4.2 Bijzinnen',
   'In een bijzin staan de werkwoorden achteraan. Een bijzin begint met een voegwoord zoals omdat of als.',
   'Voorbeeld: De auto versnelt omdat er een kracht op werkt.',
   'Opdracht: Onderstreep de persoonsvorm: "Licht beweegt sneller dan geluid."'],
];
const files = [];
for (const [i, lines] of pages.entries()) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const p = pdf.addPage([595, 842]);
  lines.forEach((t, j) => p.drawText(t, { x: 40, y: 780 - j * 22, size: 11, font }));
  files.push({ id: `p${i + 1}`, name: `pagina ${i + 1}.pdf`, data: Buffer.from(await pdf.save()) });
}
await db.doc('allowedUsers/admin@test.nl').set({ role: 'admin', name: 'A' });
await db.doc('testWeeks/tw1').set({ name: 'Toetsweek 1', order: 1 });
await db.doc('testWeeks/tw1/subjects/nederlands').set({ name: 'Nederlands', order: 1, activeQuestionCount: 0 });
for (const f of [...files].reverse()) {
  // Upload page 2 first: the pipeline must still read the pages in order.
  const path = `materials/tw1/nederlands/${f.id}-${f.name}`;
  await getStorage().bucket().file(path).save(f.data, { contentType: 'application/pdf' });
  await db.doc(`testWeeks/tw1/subjects/nederlands/materials/${f.id}`).set({
    fileName: f.name, storagePath: path, mimeType: 'application/pdf', size: f.data.length,
    sha256: createHash('sha256').update(f.data).digest('hex'), uploadedAt: Date.now(),
  });
}

const app = initializeApp({ apiKey: 'fake', projectId: 'demo-mstp' });
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: 'a', email: 'admin@test.nl', email_verified: true })));
await auth.currentUser.getIdToken(true);
const fns = getFunctions(app, 'europe-west1');
connectFunctionsEmulator(fns, '127.0.0.1', 5001);
const { data } = await httpsCallable(fns, 'startTestMaker', { timeout: 300_000 })({ weekId: 'tw1', subjectId: 'nederlands', questionsPerSubtopic: 4 });
let job;
do {
  await new Promise((r) => setTimeout(r, 3000));
  job = (await db.doc(`jobs/${data.jobId}`).get()).data();
} while (!['done', 'error'].includes(job.status));
console.log('\nJOB', job.status, job.error ?? '');
for (const f of files) {
  const a = JSON.parse((await getStorage().bucket().file(`artifacts/tw1/nederlands/${f.id}.json`).download())[0]);
  console.log(`\n=== TRANSCRIPT ${f.name}\n${process.env.RAW ? JSON.stringify(a.contentMarkdown) : a.contentMarkdown}\n--- keyTerms: ${a.keyTerms.map((k) => k.nl).join(', ')}`);
}
const s = (await db.doc('testWeeks/tw1/subjects/nederlands').get()).data();
console.log('\n=== TOPICS');
for (const t of s.topicTree) console.log(`- ${t.nameNl}: ${t.subtopics.map((x) => x.nameNl).join(' | ')}`);
console.log('\n=== QUESTIONS');
for (const d of (await db.collection('testWeeks/tw1/subjects/nederlands/questions').get()).docs)
  console.log(`[${d.data().difficulty}] ${d.data().questionNl}`);
process.exit(0);
