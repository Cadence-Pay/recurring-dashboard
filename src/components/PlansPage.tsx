'use client';

import { useMemo } from 'react';
import { createKeeperClient } from '../lib/keeper-client';
import { createPlanService, createTokenService } from '../lib/plan-service';
import { getPublicConfig } from '../lib/public-env';
import { ConfigProblems } from './KeeperStatus';
import { PlansView } from './PlansView';
import { useWallet } from './WalletProvider';

/** The plans page: builds the real services from the settings and the connected wallet. */
export function PlansPage() {
  const config = getPublicConfig();
  const { adapter } = useWallet();
  const services = useMemo(
    () =>
      config.ok
        ? {
            keeper: createKeeperClient(config.config.keeperUrl),
            plans: createPlanService(config.config, adapter),
            tokens: createTokenService(config.config),
          }
        : undefined,
    // The settings are fixed for a build, so the wallet adapter is the only thing that can change.
    [config.ok, adapter],
  );
  if (!config.ok || services === undefined) {
    return <ConfigProblems problems={config.ok ? [] : config.problems} />;
  }
  return <PlansView {...services} />;
}
