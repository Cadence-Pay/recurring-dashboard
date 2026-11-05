'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { toWalletError, type WalletAdapter } from '../lib/wallet';

/** The state of the wallet connection. */
export type WalletState =
  | { readonly status: 'disconnected' }
  | { readonly status: 'connecting' }
  | {
      readonly status: 'connected';
      readonly address: string;
      /** The network the wallet reported, or null if it did not say. */
      readonly walletPassphrase: string | null;
    }
  | { readonly status: 'error'; readonly message: string };

/** What components get from `useWallet`. */
export interface WalletContextValue {
  readonly state: WalletState;
  /** The network passphrase the dashboard expects. */
  readonly expectedPassphrase: string;
  /** True when a connected wallet reports a different network than the dashboard expects. */
  readonly wrongNetwork: boolean;
  readonly adapter: WalletAdapter;
  readonly connect: () => Promise<void>;
  readonly disconnect: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

/**
 * Provides the wallet connection to the page.
 *
 * Nothing is remembered between page loads: the person connects each time, so the dashboard never
 * acts for an address they did not just choose.
 */
export function WalletProvider(props: {
  adapter: WalletAdapter;
  expectedPassphrase: string;
  children: ReactNode;
}) {
  const { adapter, expectedPassphrase } = props;
  const [state, setState] = useState<WalletState>({ status: 'disconnected' });
  const busy = useRef(false);

  const connect = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setState({ status: 'connecting' });
    try {
      const session = await adapter.connect();
      setState({
        status: 'connected',
        address: session.address,
        walletPassphrase: session.networkPassphrase,
      });
    } catch (error) {
      setState({ status: 'error', message: toWalletError(error).message });
    } finally {
      busy.current = false;
    }
  }, [adapter]);

  const disconnect = useCallback(async () => {
    await adapter.disconnect();
    setState({ status: 'disconnected' });
  }, [adapter]);

  const value = useMemo<WalletContextValue>(
    () => ({
      state,
      expectedPassphrase,
      wrongNetwork:
        state.status === 'connected' &&
        state.walletPassphrase !== null &&
        state.walletPassphrase !== expectedPassphrase,
      adapter,
      connect,
      disconnect,
    }),
    [state, expectedPassphrase, adapter, connect, disconnect],
  );

  return <WalletContext.Provider value={value}>{props.children}</WalletContext.Provider>;
}

/** The wallet connection. Must be used inside a WalletProvider. */
export function useWallet(): WalletContextValue {
  const value = useContext(WalletContext);
  if (value === undefined) throw new Error('useWallet must be used inside a WalletProvider');
  return value;
}
