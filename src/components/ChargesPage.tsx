'use client';

import { useParams } from 'next/navigation';
import { ChargesView } from './ChargesView';
import { ConfigProblems } from './KeeperStatus';
import { parseId } from './PlanDetailPage';
import { useServices } from './useServices';

/** The charges page for one subscription. */
export function ChargesPage() {
  const params = useParams<{ id: string }>();
  const result = useServices();
  if (!result.ok) return <ConfigProblems problems={result.problems} />;
  const subId = parseId(params.id);
  if (subId === undefined) {
    return (
      <div className="state state--error" role="alert">
        <strong>That is not a valid subscription number.</strong>
      </div>
    );
  }
  const { keeper, tokens, config } = result.services;
  return <ChargesView subId={subId} keeper={keeper} tokens={tokens} network={config.network} />;
}
