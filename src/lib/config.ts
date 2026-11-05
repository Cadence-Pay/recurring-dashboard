import { z } from 'zod';

const schema = z.object({
  NEXT_PUBLIC_KEEPER_URL: z.url({ protocol: /^https?$/ }),
  NEXT_PUBLIC_STELLAR_NETWORK: z.string().min(1).max(32),
});

/** Settings the dashboard needs in the browser. All come from environment variables. */
export interface PublicConfig {
  /** Address of the keeper read API. */
  readonly keeperUrl: string;
  /** Label of the network the dashboard expects, for example `testnet`. */
  readonly network: string;
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
  return {
    ok: true,
    config: {
      keeperUrl: parsed.data.NEXT_PUBLIC_KEEPER_URL,
      network: parsed.data.NEXT_PUBLIC_STELLAR_NETWORK,
    },
  };
}
