import { z } from 'zod';

const schema = z.object({
  NEXT_PUBLIC_KEEPER_URL: z.url({ protocol: /^https?$/ }),
  NEXT_PUBLIC_STELLAR_NETWORK: z.string().min(1).max(32),
  NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: z.string().min(1),
  NEXT_PUBLIC_STELLAR_RPC_URL: z.url({ protocol: /^https?$/ }),
  NEXT_PUBLIC_CONTRACT_ID: z
    .string()
    .regex(/^C[A-Z2-7]{55}$/, 'must be a contract id starting with C'),
});

/**
 * Well-known passphrases, used only to catch a network name that does not match its passphrase.
 * The value actually used always comes from the environment.
 */
const KNOWN_PASSPHRASES: Record<string, string> = {
  testnet: 'Test SDF Network ; September 2015',
  mainnet: 'Public Global Stellar Network ; September 2015',
};

/** Settings the dashboard needs in the browser. All come from environment variables. */
export interface PublicConfig {
  /** Address of the keeper read API. */
  readonly keeperUrl: string;
  /** Label of the network the dashboard expects, for example `testnet`. */
  readonly network: string;
  /** Passphrase of that network. Wallets and transactions must use it. */
  readonly networkPassphrase: string;
  /** Stellar RPC server used to build and send transactions. */
  readonly rpcUrl: string;
  /** The recurring contract. */
  readonly contractId: string;
}

/** Either the settings, or a list of what is wrong with them. */
export type ConfigResult =
  | { readonly ok: true; readonly config: PublicConfig }
  | { readonly ok: false; readonly problems: readonly string[] };

/**
 * Check the public environment variables.
 *
 * Returns a result instead of throwing so a page can explain what is missing. Empty values count
 * as unset. Problems name the variable but never repeat its value.
 *
 * @param raw - The variables, by name.
 */
export function readPublicConfig(raw: Record<string, string | undefined>): ConfigResult {
  const present: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value !== undefined && value !== '') present[key] = value;
  }
  const parsed = schema.safeParse(present);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map(
        (issue) => `${issue.path.map(String).join('.')}: ${issue.message}`,
      ),
    };
  }
  const c = parsed.data;
  const expected = KNOWN_PASSPHRASES[c.NEXT_PUBLIC_STELLAR_NETWORK];
  if (expected !== undefined && expected !== c.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE) {
    return {
      ok: false,
      problems: [
        `NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: does not match the passphrase of ${c.NEXT_PUBLIC_STELLAR_NETWORK}`,
      ],
    };
  }
  return {
    ok: true,
    config: {
      keeperUrl: c.NEXT_PUBLIC_KEEPER_URL,
      network: c.NEXT_PUBLIC_STELLAR_NETWORK,
      networkPassphrase: c.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE,
      rpcUrl: c.NEXT_PUBLIC_STELLAR_RPC_URL,
      contractId: c.NEXT_PUBLIC_CONTRACT_ID,
    },
  };
}
