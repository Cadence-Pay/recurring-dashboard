import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAsync } from './use-async';

/** A component that shows what `useAsync` reports for a loader. */
function Probe(props: { load: (signal: AbortSignal) => Promise<string>; dep?: number }) {
  const { state, reload } = useAsync(props.load, [props.dep]);
  return (
    <div>
      <p data-testid="status">{state.status}</p>
      <p data-testid="data">{state.status === 'ready' ? state.data : ''}</p>
      <p data-testid="error">{state.status === 'error' ? state.error.message : ''}</p>
      <button type="button" onClick={reload}>
        reload
      </button>
    </div>
  );
}

const text = (id: string) => screen.getByTestId(id).textContent;

describe('useAsync', () => {
  it('goes from loading to ready', async () => {
    render(<Probe load={() => Promise.resolve('hello')} />);
    expect(text('status')).toBe('loading');
    await waitFor(() => {
      expect(text('status')).toBe('ready');
    });
    expect(text('data')).toBe('hello');
  });

  it('reports a failure as an error state', async () => {
    render(<Probe load={() => Promise.reject(new Error('nope'))} />);
    await waitFor(() => {
      expect(text('status')).toBe('error');
    });
    expect(text('error')).toBe('nope');
  });

  it('wraps something that is not an Error', async () => {
    // Rejecting with a string is exactly the case under test.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    render(<Probe load={() => Promise.reject('plain text')} />);
    await waitFor(() => {
      expect(text('status')).toBe('error');
    });
    expect(text('error')).toBe('Something went wrong');
  });

  it('loads again on reload', async () => {
    let calls = 0;
    render(<Probe load={() => Promise.resolve(`call ${String(++calls)}`)} />);
    await waitFor(() => {
      expect(text('data')).toBe('call 1');
    });
    fireEvent.click(screen.getByRole('button', { name: 'reload' }));
    await waitFor(() => {
      expect(text('data')).toBe('call 2');
    });
  });

  it('loads again when a dependency changes', async () => {
    const load = (signal: AbortSignal) => Promise.resolve(signal.aborted ? 'aborted' : 'fresh');
    const { rerender } = render(<Probe load={load} dep={1} />);
    await waitFor(() => {
      expect(text('status')).toBe('ready');
    });
    rerender(<Probe load={() => Promise.resolve('second')} dep={2} />);
    await waitFor(() => {
      expect(text('data')).toBe('second');
    });
  });

  it('aborts the request and ignores a late answer when the component goes away', async () => {
    let signalSeen: AbortSignal | undefined;
    let finish: (value: string) => void = () => undefined;
    const load = (signal: AbortSignal) => {
      signalSeen = signal;
      return new Promise<string>((resolve) => {
        finish = resolve;
      });
    };
    const { unmount } = render(<Probe load={load} />);
    unmount();
    expect(signalSeen?.aborted).toBe(true);
    await act(async () => {
      finish('too late');
      await Promise.resolve();
    });
    // Nothing to assert on screen: the point is that it did not throw or warn about an unmounted update.
  });

  it('ignores the answer of an old request after a dependency change', async () => {
    const finishers: ((value: string) => void)[] = [];
    const load = () =>
      new Promise<string>((resolve) => {
        finishers.push(resolve);
      });
    const { rerender } = render(<Probe load={load} dep={1} />);
    rerender(<Probe load={load} dep={2} />);
    await act(async () => {
      finishers[1]?.('new');
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(text('data')).toBe('new');
    });
    await act(async () => {
      finishers[0]?.('old');
      await Promise.resolve();
    });
    expect(text('data')).toBe('new');
  });
});
