import type { ReactNode } from 'react';
import type { AsyncState } from '../lib/use-async';

/** Props of {@link StateView}. */
export interface StateViewProps<T> {
  readonly state: AsyncState<T>;
  /** What this data is, for the loading text, for example "plans". */
  readonly what: string;
  /** Called when the person presses "Try again" after an error. */
  readonly onRetry?: () => void;
  /** Tells when the loaded data has nothing to show. */
  readonly isEmpty?: (data: T) => boolean;
  /** Shown instead of the data when it is empty. */
  readonly empty?: ReactNode;
  readonly children: (data: T) => ReactNode;
}

/**
 * Show one of four things for loaded data: a loading message, an error with a retry button, an
 * empty message, or the data itself. Screen readers are told about loading (polite) and errors
 * (assertive).
 */
export function StateView<T>(props: StateViewProps<T>): ReactNode {
  const { state } = props;
  if (state.status === 'loading') {
    return (
      <p className="state" role="status">
        Loading {props.what}…
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="state state--error" role="alert">
        <p>
          <strong>Could not load {props.what}.</strong> {state.error.message}
        </p>
        {props.onRetry === undefined ? null : (
          <button type="button" className="btn btn--secondary" onClick={props.onRetry}>
            Try again
          </button>
        )}
      </div>
    );
  }
  if (props.isEmpty?.(state.data) === true) {
    return <p className="state">{props.empty ?? `No ${props.what} yet.`}</p>;
  }
  return props.children(state.data);
}
