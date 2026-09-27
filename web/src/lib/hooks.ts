import { useEffect, useState } from 'react';
import {
  onSnapshot,
  type DocumentReference,
  type Query,
} from 'firebase/firestore';

export type WithId<T> = T & { id: string };

/** Live document. `undefined` while loading, `null` if missing. */
export function useDoc<T>(ref: DocumentReference | null, deps: unknown[] = []): WithId<T> | null | undefined {
  const [data, setData] = useState<WithId<T> | null | undefined>(undefined);
  useEffect(() => {
    if (!ref) return setData(null);
    setData(undefined);
    return onSnapshot(
      ref,
      (s) => setData(s.exists() ? ({ id: s.id, ...(s.data() as T) } as WithId<T>) : null),
      (e) => {
        console.error(e);
        setData(null);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return data;
}

/** Live query. `undefined` while loading. */
export function useQuery<T>(q: Query | null, deps: unknown[] = []): WithId<T>[] | undefined {
  const [data, setData] = useState<WithId<T>[] | undefined>(undefined);
  useEffect(() => {
    if (!q) return setData([]);
    setData(undefined);
    return onSnapshot(
      q,
      (s) => setData(s.docs.map((d) => ({ id: d.id, ...(d.data() as T) }))),
      (e) => {
        console.error(e);
        setData([]);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return data;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
