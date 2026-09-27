import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import type { Role } from '@shared';

if (getApps().length === 0) initializeApp();

// Cloud Tasks is not available in europe-west4 (where Firestore lives); europe-west1 is the closest region with it.
export const REGION = 'europe-west1';
export const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
export const bucket = () => getStorage().bucket();

export const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');

export function requireRole(req: CallableRequest<unknown>, ...roles: Role[]): { uid: string; email: string; role: Role } {
  const auth = req.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const role = auth.token.role as Role | undefined;
  if (!role || !roles.includes(role)) throw new HttpsError('permission-denied', 'Not allowed');
  return { uid: auth.uid, email: String(auth.token.email ?? ''), role };
}

export const subjectRef = (weekId: string, subjectId: string) =>
  db.collection('testWeeks').doc(weekId).collection('subjects').doc(subjectId);

export const now = () => Date.now();
