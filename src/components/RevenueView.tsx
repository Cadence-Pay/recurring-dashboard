'use client';

import { formatAmount } from '../lib/amount';
import type { KeeperClient, Revenue } from '../lib/keeper-client';
import type { TokenInfo, TokenService } from '../lib/plan-service';
import { useAsync } from '../lib/use-async';
import { formatTime } from './KeeperStatus';
import { StateView } from './StateView';
import { shortAddress } from './WalletButton';
import { useWallet } from './WalletProvider';

/** Props of {@link RevenueView}. */
export interface RevenueViewProps {
  readonly keeper: KeeperClient;
  readonly tokens: TokenService;
}

/** What the connected merchant has received, one total per token. */
export function RevenueView(props: RevenueViewProps) {
  const { keeper, tokens } = props;
  const { state: wallet } = useWallet();
  if (wallet.status !== 'connected') {
    return (
      <div className="state">
        <p>Connect your wallet to see your revenue.</p>
      </div>
    );
  }
  return <ConnectedRevenue merchant={wallet.address} keeper={keeper} tokens={tokens} />;
}

function ConnectedRevenue(props: { merchant: string; keeper: KeeperClient; tokens: TokenService }) {
  const { merchant, keeper, tokens } = props;
  const { state, reload } = useAsync(
    (signal) => keeper.getRevenue(merchant, signal),
    [keeper, merchant],
  );
  return (
    <StateView
      state={state}
      what="your revenue"
      onRetry={reload}
      isEmpty={(revenue) => revenue.lines.length === 0}
      empty="No revenue yet. It appears here once someone subscribes to one of your plans."
    >
      {(revenue) => <RevenueTable revenue={revenue} tokens={tokens} />}
    </StateView>
  );
}

function RevenueTable(props: { revenue: Revenue; tokens: TokenService }) {
  const { revenue, tokens } = props;
  const ids = revenue.lines.map((line) => line.token);
  const key = [...new Set(ids)].sort().join(',');
  const { state } = useAsync(
    async (signal) => {
      const unique = key === '' ? [] : key.split(',');
      const settled = await Promise.allSettled(unique.map((id) => tokens.getTokenInfo(id, signal)));
      const map = new Map<string, TokenInfo | null>();
      unique.forEach((id, i) => {
        const r = settled[i];
        map.set(id, r?.status === 'fulfilled' ? r.value : null);
      });
      return map;
    },
    [tokens, key],
  );
  const infos = state.status === 'ready' ? state.data : new Map<string, TokenInfo | null>();

  return (
    <div className="stack">
      {/* WAVE-ISSUE(dashboard-5): a revenue chart over time plugs in here. The MVP shows one total per token. */}
      <table className="table">
        <caption>Revenue by token</caption>
        <thead>
          <tr>
            <th scope="col">Token</th>
            <th scope="col">Total received</th>
            <th scope="col">Payments</th>
          </tr>
        </thead>
        <tbody>
          {revenue.lines.map((line) => {
            const info = infos.get(line.token);
            return (
              <tr key={line.token}>
                <th scope="row">
                  {info === undefined || info === null ? (
                    <span className="mono" title={line.token}>
                      {shortAddress(line.token)}
                    </span>
                  ) : (
                    <>
                      {info.symbol}{' '}
                      <span className="mono muted" title={line.token}>
                        {shortAddress(line.token)}
                      </span>
                    </>
                  )}
                </th>
                <td>
                  {info === undefined || info === null
                    ? `${line.total} (smallest unit)`
                    : `${formatAmount(line.total, info.decimals)} ${info.symbol}`}
                </td>
                <td>{line.payments}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted">
        Counts the first payment of every subscription plus every charge, whoever made it. As of the
        keeper&apos;s last sync: {formatTime(revenue.asOf)}.
      </p>
    </div>
  );
}
