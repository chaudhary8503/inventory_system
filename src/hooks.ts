import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** Runs `load` when `deps` change; ignores stale results. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const runId = useRef(0);

  useEffect(() => {
    const id = ++runId.current;
    setLoading(true);
    setError(null);
    load()
      .then((d) => {
        if (id === runId.current) setData(d);
      })
      .catch((e: unknown) => {
        if (id === runId.current) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (id === runId.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

/** Wraps a submit: busy flag, error text, success text. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const run = useCallback(async (action: () => Promise<string | void>) => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const message = await action();
      if (message) setDone(message);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const clear = useCallback(() => {
    setError(null);
    setDone(null);
  }, []);

  return { busy, error, done, run, clear };
}
