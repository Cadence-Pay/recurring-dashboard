'use client';

import { useCallback, useEffect, useState } from 'react';

/** Where an asynchronous load stands. */
export type AsyncState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: Error }
  | { readonly status: 'ready'; readonly data: T };

/**
 * Load data when a component appears, and again when `deps` change or `reload` is called.
 *
 * The request is aborted when the component goes away or the inputs change, and a late answer from
 * an old request is ignored.
 *
 * @param load - Fetches the data. Receives an abort signal.
 * @param deps - Values the data depends on.
 * @returns The state, and a function that loads again.
 */
export function useAsync<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): { state: AsyncState<T>; reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: 'ready', data });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          error: error instanceof Error ? error : new Error('Something went wrong'),
        });
      },
    );
    return () => {
      controller.abort();
    };
    // `load` is expected to be recreated on every render, so `deps` decides when to run again.
  }, [...deps, attempt]);

  const reload = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  return { state, reload };
}
