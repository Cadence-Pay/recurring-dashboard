'use client';

import { ConfigProblems } from './KeeperStatus';
import { RevenueView } from './RevenueView';
import { useServices } from './useServices';

/** The revenue page for the connected merchant. */
export function RevenuePage() {
  const result = useServices();
  if (!result.ok) return <ConfigProblems problems={result.problems} />;
  return <RevenueView keeper={result.services.keeper} tokens={result.services.tokens} />;
}
