'use client';

import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { createKeeperClient } from '../lib/keeper-client';
import { createPlanService, createTokenService } from '../lib/plan-service';
import { getPublicConfig } from '../lib/public-env';
import { ConfigProblems } from './KeeperStatus';
import { SubscribersView } from './SubscribersView';
import { useWallet } from './WalletProvider';

/** The page for one plan: reads the plan number from the address and builds the real services. */
export function PlanDetailPage() {
  const params = useParams<{ id: string }>();
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
  const planId = /^[1-9]\d{0,14}$/.test(params.id) ? Number(params.id) : undefined;
  if (planId === undefined) {
    return (
      <div className="state state--error" role="alert">
        <strong>That is not a valid plan number.</strong>
      </div>
    );
  }
  return <SubscribersView planId={planId} {...services} />;
}
