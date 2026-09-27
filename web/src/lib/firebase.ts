import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import type {
  EvaluateRequest,
  EvaluateResponse,
  StartTestMakerRequest,
  UpsertAllowedUserRequest,
} from '@shared';

const CUSTOM_DOMAIN = 'mstp.change-commit.nl';
const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';

// Injected at build time (GitHub secret FIREBASE_WEB_API_KEY in CI, web/.env.local locally). The key is
// restricted to our domains; access to data is enforced by auth + security rules.
const apiKey = import.meta.env.VITE_FIREBASE_API_KEY || (useEmulators ? 'emulator-fake-key' : '');
if (!apiKey) throw new Error('VITE_FIREBASE_API_KEY is not set (see README)');

export const app = initializeApp({
  apiKey,
  // Serving the auth handler from our own domain keeps Google sign-in working when third-party cookies are blocked.
  authDomain: location.hostname === CUSTOM_DOMAIN ? CUSTOM_DOMAIN : 'mstp-509920.firebaseapp.com',
  projectId: useEmulators ? 'demo-mstp' : 'mstp-509920',
  storageBucket: useEmulators ? 'demo-mstp.appspot.com' : 'mstp-509920.firebasestorage.app',
  messagingSenderId: '2150730116',
  appId: '1:2150730116:web:2c3f916b4947879801f5d1',
});

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const storage = getStorage(app);
export const functions = getFunctions(app, 'europe-west1');

if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

export const api = {
  evaluateAnswer: httpsCallable<EvaluateRequest, EvaluateResponse>(functions, 'evaluateAnswer', { timeout: 180_000 }),
  startTestMaker: httpsCallable<StartTestMakerRequest, { jobId: string }>(functions, 'startTestMaker'),
  upsertAllowedUser: httpsCallable<UpsertAllowedUserRequest, { ok: true }>(functions, 'adminUpsertAllowedUser'),
};
