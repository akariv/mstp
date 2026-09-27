import { beforeUserCreated, beforeUserSignedIn, HttpsError } from 'firebase-functions/v2/identity';
import type { AuthBlockingEvent } from 'firebase-functions/v2/identity';
import type { AllowedUserDoc, UserDoc } from '@shared';
import { db, REGION } from '../common';

async function lookup(event: AuthBlockingEvent): Promise<AllowedUserDoc> {
  const email = event.data?.email?.toLowerCase();
  if (!email || !event.data?.emailVerified) throw new HttpsError('permission-denied', 'A verified Google account is required');
  const allowed = (await db.collection('allowedUsers').doc(email).get()).data() as AllowedUserDoc | undefined;
  if (!allowed) throw new HttpsError('permission-denied', `NOT_ALLOWED:${email}`);
  return allowed;
}

export const beforecreated = beforeUserCreated({ region: REGION }, async (event) => {
  const allowed = await lookup(event);
  return { customClaims: { role: allowed.role } };
});

export const beforesignedin = beforeUserSignedIn({ region: REGION }, async (event) => {
  const allowed = await lookup(event);
  const uid = event.data!.uid;
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    const doc: UserDoc = {
      email: event.data!.email!.toLowerCase(),
      name: allowed.name || event.data!.displayName || '',
      photoURL: event.data!.photoURL ?? undefined,
      uiLang: 'nl',
      xp: 0,
      streak: 0,
      bestStreak: 0,
      lastActiveDay: null,
      usage: { day: '', count: 0 },
      badges: [],
      answeredTotal: 0,
      wordsKnown: 0,
    };
    await ref.set(doc);
  }
  return { customClaims: { role: allowed.role } };
});
