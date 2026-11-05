'use client';

import { useParams } from 'next/navigation';
import { ConfigProblems } from './KeeperStatus';
import { SubscribersView } from './SubscribersView';
import { useServices } from './useServices';

/** Reads a positive whole number from an address segment, or undefined if it is not one. */
export function parseId(text: string | undefined): number | undefined {
  return text !== undefined && /^[1-9]\d{0,14}$/.test(text) ? Number(text) : undefined;
}

/** The page for one plan: reads the plan number from the address and builds the real services. */
export function PlanDetailPage() {
  const params = useParams<{ id: string }>();
  const result = useServices();
  if (!result.ok) return <ConfigProblems problems={result.problems} />;
  const planId = parseId(params.id);
  if (planId === undefined) {
    return (
      <div className="state state--error" role="alert">
        <strong>That is not a valid plan number.</strong>
      </div>
    );
  }
  const { keeper, plans, tokens } = result.services;
  return <SubscribersView planId={planId} keeper={keeper} plans={plans} tokens={tokens} />;
}
