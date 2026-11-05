'use client';

import { ConfigProblems } from './KeeperStatus';
import { PlansView } from './PlansView';
import { useServices } from './useServices';

/** The plans page: builds the real services from the settings and the connected wallet. */
export function PlansPage() {
  const result = useServices();
  if (!result.ok) return <ConfigProblems problems={result.problems} />;
  const { keeper, plans, tokens } = result.services;
  return <PlansView keeper={keeper} plans={plans} tokens={tokens} />;
}
