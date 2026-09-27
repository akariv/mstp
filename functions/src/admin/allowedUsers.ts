import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { UpsertAllowedUserSchema } from '@shared';
import { db, REGION, requireRole } from '../common';

/** Add, update or remove (role=null) an allowed user and sync their auth claims immediately. */
export const adminUpsertAllowedUser = onCall({ region: REGION }, async (req) => {
  const me = requireRole(req, 'admin');
  const parsed = UpsertAllowedUserSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.message);
  const { email, role, name } = parsed.data;
  if (email === me.email && role !== 'admin') throw new HttpsError('failed-precondition', 'You cannot demote yourself');

  const ref = db.collection('allowedUsers').doc(email);
  if (role) await ref.set({ role, name });
  else await ref.delete();

  const auth = getAuth();
  const user = await auth.getUserByEmail(email).catch(() => null);
  if (user) {
    await auth.setCustomUserClaims(user.uid, role ? { role } : {});
    if (!role) await auth.revokeRefreshTokens(user.uid);
  }
  return { ok: true };
});
