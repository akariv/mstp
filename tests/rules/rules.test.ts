import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { ref, uploadString, getBytes } from 'firebase/storage';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-mstp',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  });
});
afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'testWeeks/w1'), { name: 'W1', order: 1 });
    await setDoc(doc(db, 'testWeeks/w1/subjects/bio'), { name: 'Bio', order: 1, activeQuestionCount: 1 });
    await setDoc(doc(db, 'testWeeks/w1/subjects/bio/questions/q1'), { questionNl: 'Q', status: 'active' });
    await setDoc(doc(db, 'testWeeks/w1/subjects/bio/questions/q2'), { questionNl: 'Old', status: 'archived' });
    await setDoc(doc(db, 'testWeeks/w1/subjects/bio/questions/q1/private/answer'), { detailedAnswerNl: 'A' });
    await setDoc(doc(db, 'users/alice'), { uiLang: 'nl', wordsKnown: 0, xp: 10 });
    await setDoc(doc(db, 'users/alice/progress/q1'), { bestNl: 50 });
    await setDoc(doc(db, 'users/alice/vocab/blad'), { nl: 'het blad', en: 'leaf', box: 1, seen: 0, known: 0 });
    await setDoc(doc(db, 'users/bob'), { uiLang: 'nl', wordsKnown: 0, xp: 0 });
    await setDoc(doc(db, 'allowedUsers/alice@x.nl'), { role: 'student' });
  });
});

const student = () => env.authenticatedContext('alice', { role: 'student', email: 'alice@x.nl' }).firestore();
const admin = () => env.authenticatedContext('admin1', { role: 'admin' }).firestore();
const stranger = () => env.authenticatedContext('eve', { email: 'eve@x.nl' }).firestore();

describe('firestore rules', () => {
  it('students can read content but not model answers', async () => {
    const db = student();
    await assertSucceeds(getDoc(doc(db, 'testWeeks/w1/subjects/bio')));
    await assertSucceeds(getDocs(query(collection(db, 'testWeeks/w1/subjects/bio/questions'), where('status', '==', 'active'))));
    await assertFails(getDoc(doc(db, 'testWeeks/w1/subjects/bio/questions/q2')));
    await assertFails(getDoc(doc(db, 'testWeeks/w1/subjects/bio/questions/q1/private/answer')));
    await assertFails(setDoc(doc(db, 'testWeeks/w1'), { name: 'hack', order: 1 }));
  });

  it('users without an allowed role see nothing', async () => {
    const db = stranger();
    await assertFails(getDoc(doc(db, 'testWeeks/w1')));
    await assertFails(getDoc(doc(db, 'users/eve')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'testWeeks/w1')));
  });

  it('students only access their own data', async () => {
    const db = student();
    await assertSucceeds(getDoc(doc(db, 'users/alice/progress/q1')));
    await assertFails(getDoc(doc(db, 'users/bob')));
    await assertFails(setDoc(doc(db, 'users/alice/progress/q1'), { bestNl: 100 }));
    await assertFails(getDoc(doc(db, 'allowedUsers/alice@x.nl')));
  });

  it('students can change only safe profile fields', async () => {
    const db = student();
    await assertSucceeds(updateDoc(doc(db, 'users/alice'), { uiLang: 'en' }));
    await assertSucceeds(updateDoc(doc(db, 'users/alice'), { wordsKnown: 3 }));
    await assertFails(updateDoc(doc(db, 'users/alice'), { xp: 99999 }));
  });

  it('students can update flashcard boxes but not word content', async () => {
    const db = student();
    await assertSucceeds(updateDoc(doc(db, 'users/alice/vocab/blad'), { box: 2, seen: 1, known: 1, lastSeen: 1 }));
    await assertFails(updateDoc(doc(db, 'users/alice/vocab/blad'), { box: 9 }));
    await assertFails(updateDoc(doc(db, 'users/alice/vocab/blad'), { en: 'hacked' }));
    await assertFails(setDoc(doc(db, 'users/alice/vocab/new'), { nl: 'x', box: 1 }));
  });

  it('admins manage content and read answers, but allowlist goes through the function', async () => {
    const db = admin();
    await assertSucceeds(setDoc(doc(db, 'testWeeks/w2'), { name: 'W2', order: 2 }));
    await assertSucceeds(getDoc(doc(db, 'testWeeks/w1/subjects/bio/questions/q1/private/answer')));
    await assertSucceeds(getDoc(doc(db, 'testWeeks/w1/subjects/bio/questions/q2')));
    await assertSucceeds(getDoc(doc(db, 'allowedUsers/alice@x.nl')));
    await assertFails(setDoc(doc(db, 'allowedUsers/x@x.nl'), { role: 'admin' }));
  });
});

describe('storage rules', () => {
  it('only admins can upload and read materials', async () => {
    const s = env.authenticatedContext('alice', { role: 'student' }).storage();
    await assertFails(uploadString(ref(s, 'materials/w1/bio/a.txt'), 'x'));
    const a = env.authenticatedContext('admin1', { role: 'admin' }).storage();
    await assertSucceeds(uploadString(ref(a, 'materials/w1/bio/a.txt'), 'x'));
    await assertSucceeds(getBytes(ref(a, 'materials/w1/bio/a.txt')));
    await assertFails(getBytes(ref(s, 'materials/w1/bio/a.txt')));
    await assertFails(uploadString(ref(a, 'artifacts/w1/bio/a.json'), '{}'));
  });
});
