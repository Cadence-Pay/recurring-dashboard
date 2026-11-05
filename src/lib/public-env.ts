import { readPublicConfig, type ConfigResult } from './config';

/**
 * The public settings of this build.
 *
 * Next.js replaces `process.env.NEXT_PUBLIC_*` only when the name is written out in full, so each
 * variable is listed here by hand instead of passing `process.env` as a whole.
 */
export function getPublicConfig(): ConfigResult {
  return readPublicConfig({
    NEXT_PUBLIC_KEEPER_URL: process.env.NEXT_PUBLIC_KEEPER_URL,
    NEXT_PUBLIC_STELLAR_NETWORK: process.env.NEXT_PUBLIC_STELLAR_NETWORK,
    NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE,
    NEXT_PUBLIC_STELLAR_RPC_URL: process.env.NEXT_PUBLIC_STELLAR_RPC_URL,
    NEXT_PUBLIC_CONTRACT_ID: process.env.NEXT_PUBLIC_CONTRACT_ID,
  });
}
