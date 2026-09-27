import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onIdTokenChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { doc } from 'firebase/firestore';
import type { Role, UserDoc } from '@shared';
import { auth, db, googleProvider } from './firebase';
import { useDoc, type WithId } from './hooks';

interface AuthState {
  user: User | null | undefined; // undefined = loading
  role: Role | null;
  profile: WithId<UserDoc> | null | undefined;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      onIdTokenChanged(auth, async (u) => {
        if (!u) {
          setRole(null);
          setUser(null);
          return;
        }
        const token = await u.getIdTokenResult();
        setRole((token.claims.role as Role | undefined) ?? null);
        setUser(u);
      }),
    [],
  );

  const profile = useDoc<UserDoc>(user && role ? doc(db, 'users', user.uid) : null, [user?.uid, role]);

  const value: AuthState = {
    user,
    role,
    profile,
    error,
    signIn: async () => {
      setError(null);
      try {
        await signInWithPopup(auth, googleProvider);
      } catch (e) {
        const msg = String((e as Error).message ?? e);
        if (/NOT_ALLOWED|BLOCKING_FUNCTION|permission-denied|PERMISSION_DENIED/i.test(msg)) setError('notAllowed');
        else if (!/popup-closed|cancelled-popup/.test(msg)) setError('signInFailed');
      }
    },
    signOut: () => signOut(auth),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
