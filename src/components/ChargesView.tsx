'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatAmount } from '../lib/amount';
import { explorerTxUrl } from '../lib/explorer';
import type { Charge, KeeperClient } from '../lib/keeper-client';
import type { TokenInfo, TokenService } from '../lib/plan-service';
import { useAsync } from '../lib/use-async';
import { formatTime } from './KeeperStatus';
import { StateView } from './StateView';
import { Pager, PAGE_SIZE } from './SubscribersView';

/** What each charge status means, for the person reading the table. */
export const CHARGE_STATUS: Readonly<Record<Charge['status'], { label: string; tone: string }>> = {
  succeeded: { label: 'Charged', tone: 'badge--ok' },
  pending: { label: 'Waiting to retry', tone: 'badge--warn' },
  failed: { label: 'Failed', tone: 'badge--bad' },
  superseded: { label: 'Handled elsewhere', tone: 'badge--warn' },
};

/** Why a charge failed, in plain words. Unknown codes are shown as they are. */
export function explainError(code: string | null): string | null {
  if (code === null) return null;
  if (code === 'PaymentFailed') {
    return "The subscriber's balance or token allowance was too low or had expired.";
  }
  if (code === 'RPC_TIMEOUT' || code === 'RPC') return 'The network did not answer in time.';
  if (code === 'FEE_CAP_EXCEEDED') return 'The network fee was above the keeper’s limit.';
  return code;
}

/** Props of {@link ChargesView}. */
export interface ChargesViewProps {
  readonly subId: number;
  readonly keeper: KeeperClient;
  readonly tokens: TokenService;
  /** Network label, used to link transactions to a block explorer. */
  readonly network: string;
}

/** The charge records the keeper has for one subscription. */
export function ChargesView(props: ChargesViewProps) {
  const { subId, keeper, tokens, network } = props;
  const [offset, setOffset] = useState(0);
  const { state, reload } = useAsync(
    (signal) => keeper.listCharges(subId, { limit: PAGE_SIZE, offset }, signal),
    [keeper, subId, offset],
  );
  return (
    <div className="stack">
      <p>
        <Link href="/plans">← All plans</Link>
      </p>
      <p className="muted">
        These are the charges this keeper tried. The first payment is made when the person
        subscribes and is not listed. Charges made by other keepers are not listed either, but they
        are counted in the plan&apos;s revenue.
      </p>
      <StateView
        state={state}
        what="charges"
        onRetry={reload}
        isEmpty={(page) => page.total === 0}
        empty="No charges yet. The first payment was made when this person subscribed; the next one is charged when it is due."
      >
        {(page) => (
          <>
            <ChargesTable items={page.items} keeper={keeper} tokens={tokens} network={network} />
            <Pager
              total={page.total}
              offset={page.offset}
              shown={page.items.length}
              onChange={setOffset}
            />
          </>
        )}
      </StateView>
    </div>
  );
}

function ChargesTable(props: {
  items: Charge[];
  keeper: KeeperClient;
  tokens: TokenService;
  network: string;
}) {
  const { items, keeper, tokens, network } = props;
  const planId = items[0]?.planId;
  // The token is only needed to show amounts nicely; without it the raw amount is shown.
  const { state: tokenState } = useAsync(
    async (signal): Promise<TokenInfo | null> => {
      if (planId === undefined) return null;
      try {
        const plan = await keeper.getPlan(planId, signal);
        return await tokens.getTokenInfo(plan.token, signal);
      } catch {
        return null;
      }
    },
    [keeper, tokens, planId],
  );
  const token = tokenState.status === 'ready' ? tokenState.data : null;

  return (
    <div className="stack">
      {/* WAVE-ISSUE(dashboard-1): a CSV export of this table plugs in here. */}
      <table className="table">
        <caption>Charges of subscription #{items[0]?.subId}</caption>
        <thead>
          <tr>
            <th scope="col">Due</th>
            <th scope="col">Status</th>
            <th scope="col">Amount</th>
            <th scope="col">Attempts</th>
            <th scope="col">Transaction</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((charge) => {
            const status = CHARGE_STATUS[charge.status];
            const url = charge.txHash === null ? undefined : explorerTxUrl(network, charge.txHash);
            const reason = charge.status === 'succeeded' ? null : explainError(charge.errorCode);
            return (
              <tr key={charge.id}>
                <th scope="row">{formatTime(charge.dueTs)}</th>
                <td>
                  <span className={`badge ${status.tone}`}>{status.label}</span>
                  {reason === null ? null : <p className="muted">{reason}</p>}
                  {charge.status === 'pending' && charge.nextAttemptAt !== null ? (
                    <p className="muted">Next try: {formatTime(charge.nextAttemptAt)}</p>
                  ) : null}
                </td>
                <td>
                  {token === null
                    ? charge.amount
                    : `${formatAmount(charge.amount, token.decimals)} ${token.symbol}`}
                </td>
                <td>{charge.attempts}</td>
                <td>
                  {charge.txHash === null ? (
                    <span className="muted">—</span>
                  ) : url === undefined ? (
                    <span className="mono">{charge.txHash}</span>
                  ) : (
                    <a href={url} target="_blank" rel="noreferrer noopener">
                      <span className="mono">{charge.txHash.slice(0, 8)}…</span>
                      <span className="visually-hidden"> (opens the block explorer)</span>
                    </a>
                  )}
                </td>
                <td>
                  {/* WAVE-ISSUE(dashboard-2): an invoice PDF for this charge plugs in here. */}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
