'use client';

import { useMemo } from 'react';
import type { PublicConfig } from '../lib/config';
import { createKeeperClient, type KeeperClient } from '../lib/keeper-client';
import {
  createPlanService,
  createTokenService,
  type PlanService,
  type TokenService,
} from '../lib/plan-service';
import { getPublicConfig } from '../lib/public-env';
import { useWallet } from './WalletProvider';

/** The services every page uses, built from the settings and the connected wallet. */
export interface Services {
  readonly config: PublicConfig;
  readonly keeper: KeeperClient;
  readonly plans: PlanService;
  readonly tokens: TokenService;
}

/** Either the services, or what is wrong with the settings. */
export type ServicesResult =
  | { readonly ok: true; readonly services: Services }
  | { readonly ok: false; readonly problems: readonly string[] };

/** Build the real services once per wallet adapter. Must be used inside a WalletProvider. */
export function useServices(): ServicesResult {
  const config = getPublicConfig();
  const { adapter } = useWallet();
  const services = useMemo(
    () =>
      config.ok
        ? {
            config: config.config,
            keeper: createKeeperClient(config.config.keeperUrl),
            plans: createPlanService(config.config, adapter),
            tokens: createTokenService(config.config),
          }
        : undefined,
    // The settings are fixed for a build, so the wallet adapter is the only thing that can change.
    [config.ok, adapter],
  );
  if (!config.ok) return { ok: false, problems: config.problems };
  if (services === undefined) return { ok: false, problems: [] };
  return { ok: true, services };
}
