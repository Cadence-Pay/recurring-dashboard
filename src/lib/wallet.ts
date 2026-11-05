/** Why a wallet operation failed. */
export type WalletErrorCode = 'REJECTED' | 'FAILED';

/** A wallet operation failed. The message is written for the person using the dashboard. */
export class WalletError extends Error {
  readonly code: WalletErrorCode;

  constructor(code: WalletErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'WalletError';
    this.code = code;
  }
}

/** Who is connected, and on which network their wallet says it is. */
export interface WalletSession {
  readonly address: string;
  /** Network passphrase reported by the wallet, or null if the wallet would not say. */
  readonly networkPassphrase: string | null;
}

/**
 * What the dashboard needs from a wallet. The Stellar Wallets Kit implements it for real wallets;
 * tests use a fake.
 */
export interface WalletAdapter {
  /** Let the person choose a wallet and share an address. Throws WalletError. */
  connect(): Promise<WalletSession>;
  /** Forget the connection. Never throws. */
  disconnect(): Promise<void>;
  /**
   * Ask the wallet to sign a transaction.
   * @returns The signed transaction as base64 XDR.
   * @throws WalletError with code REJECTED if the person declined.
   */
  signTransaction(
    xdr: string,
    options: { networkPassphrase: string; address: string },
  ): Promise<string>;
}

/** The part of the Stellar Wallets Kit this dashboard uses. */
export interface KitLike {
  init(params: { modules: unknown[]; network?: string }): void;
  authModal(): Promise<{ address: string }>;
  getNetwork(): Promise<{ network: string; networkPassphrase: string }>;
  signTransaction(
    xdr: string,
    options: { networkPassphrase: string; address: string },
  ): Promise<{ signedTxXdr: string }>;
  disconnect(): Promise<void>;
}

/** Loads the kit and its default wallet modules. Replaceable in tests. */
export type KitLoader = () => Promise<{ kit: KitLike; modules: () => unknown[] }>;

/** Loads the real kit. It touches `window`, so it must only be called in the browser. */
export const loadKit: KitLoader = async () => {
  const [{ StellarWalletsKit }, { defaultModules }] = await Promise.all([
    import('@creit.tech/stellar-wallets-kit/sdk'),
    import('@creit.tech/stellar-wallets-kit/modules/utils'),
  ]);
  // The kit's static methods already match KitLike. Its `network` parameter is an enum of strings.
  return { kit: StellarWalletsKit as unknown as KitLike, modules: () => defaultModules() };
};

/**
 * Turn whatever the kit or a wallet threw into a WalletError.
 *
 * Wallets that follow SEP-43 report a declined request with code -4. Some wallets only say so in
 * the message, so a few common words are matched as well.
 */
export function toWalletError(error: unknown): WalletError {
  if (error instanceof WalletError) return error;
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : typeof error === 'string'
          ? error
          : '';
  if (code === -4 || /reject|declin|denied|cancel|closed/i.test(message)) {
    return new WalletError('REJECTED', 'The request was closed or declined in your wallet.', {
      cause: error,
    });
  }
  return new WalletError(
    'FAILED',
    message === '' ? 'The wallet reported an error.' : `The wallet reported an error: ${message}`,
    { cause: error },
  );
}

/**
 * Create a WalletAdapter backed by the Stellar Wallets Kit.
 *
 * The kit is loaded on first use and initialised once, for the given network.
 *
 * @param networkPassphrase - Passphrase of the network the dashboard works on.
 * @param load - How to load the kit. Defaults to the real one.
 */
export function createKitAdapter(
  networkPassphrase: string,
  load: KitLoader = loadKit,
): WalletAdapter {
  let ready: Promise<KitLike> | undefined;
  const kit = (): Promise<KitLike> => {
    ready ??= load().then((loaded) => {
      loaded.kit.init({ modules: loaded.modules(), network: networkPassphrase });
      return loaded.kit;
    });
    return ready;
  };

  return {
    async connect() {
      try {
        const k = await kit();
        const { address } = await k.authModal();
        let passphrase: string | null = null;
        try {
          passphrase = (await k.getNetwork()).networkPassphrase;
        } catch {
          // Some wallets cannot report their network; the session then has none.
        }
        return { address, networkPassphrase: passphrase };
      } catch (error) {
        throw toWalletError(error);
      }
    },
    async disconnect() {
      try {
        await (await kit()).disconnect();
      } catch {
        // Disconnecting must always succeed from the dashboard's point of view.
      }
    },
    async signTransaction(xdr, options) {
      try {
        const { signedTxXdr } = await (await kit()).signTransaction(xdr, options);
        return signedTxXdr;
      } catch (error) {
        throw toWalletError(error);
      }
    },
  };
}
