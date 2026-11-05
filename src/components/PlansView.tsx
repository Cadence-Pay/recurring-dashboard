'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { describePeriod, formatAmount } from '../lib/amount';
import type { KeeperClient, Plan } from '../lib/keeper-client';
import {
  TransactionError,
  type PlanService,
  type TokenInfo,
  type TokenService,
} from '../lib/plan-service';
import { useAsync } from '../lib/use-async';
import { CreatePlanForm } from './CreatePlanForm';
import { StateView } from './StateView';
import { shortAddress } from './WalletButton';
import { useWallet } from './WalletProvider';

/** Props of {@link PlansView}. */
export interface PlansViewProps {
  readonly keeper: KeeperClient;
  readonly plans: PlanService;
  readonly tokens: TokenService;
}

/** The merchant's plans, with a form to create one and a way to deactivate one. */
export function PlansView(props: PlansViewProps) {
  const { keeper, plans, tokens } = props;
  const { state: wallet, wrongNetwork } = useWallet();
  const [reloadKey, setReloadKey] = useState(0);

  if (wallet.status !== 'connected') {
    return (
      <div className="state">
        <p>Connect your wallet to see and manage your plans.</p>
      </div>
    );
  }
  return (
    <ConnectedPlans
      merchant={wallet.address}
      keeper={keeper}
      plans={plans}
      tokens={tokens}
      canSign={!wrongNetwork}
      reloadKey={reloadKey}
      reload={() => {
        setReloadKey((n) => n + 1);
      }}
    />
  );
}

function ConnectedPlans(props: {
  merchant: string;
  keeper: KeeperClient;
  plans: PlanService;
  tokens: TokenService;
  canSign: boolean;
  reloadKey: number;
  reload: () => void;
}) {
  const { merchant, keeper, plans, tokens, canSign, reloadKey, reload } = props;
  const { state, reload: retry } = useAsync(
    (signal) => keeper.listPlans({ merchant, limit: 200 }, signal),
    [keeper, merchant, reloadKey],
  );

  return (
    <div className="stack">
      <CreatePlanForm
        merchant={merchant}
        plans={plans}
        tokens={tokens}
        canSign={canSign}
        onCreated={reload}
      />
      <section aria-labelledby="your-plans" className="stack">
        <div className="wallet">
          <h2 id="your-plans">Your plans</h2>
          <button type="button" className="btn btn--secondary" onClick={reload}>
            Refresh
          </button>
        </div>
        <StateView
          state={state}
          what="your plans"
          onRetry={retry}
          isEmpty={(page) => page.items.length === 0}
          empty="You have no plans yet. Create one above."
        >
          {(page) => (
            <PlansTable
              items={page.items}
              total={page.total}
              merchant={merchant}
              plans={plans}
              tokens={tokens}
              canSign={canSign}
              onChanged={reload}
            />
          )}
        </StateView>
      </section>
    </div>
  );
}

/** Symbol and decimals for each distinct token, or null when a token cannot be read. */
function useTokenInfos(tokens: TokenService, ids: readonly string[]) {
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
  return state.status === 'ready' ? state.data : new Map<string, TokenInfo | null>();
}

function PlansTable(props: {
  items: Plan[];
  total: number;
  merchant: string;
  plans: PlanService;
  tokens: TokenService;
  canSign: boolean;
  onChanged: () => void;
}) {
  const { items, total, merchant, plans, tokens, canSign, onChanged } = props;
  const infos = useTokenInfos(
    tokens,
    useMemo(() => items.map((p) => p.token), [items]),
  );
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming !== null) confirmRef.current?.focus();
  }, [confirming]);

  async function deactivate(planId: number) {
    setBusy(true);
    setMessage(null);
    try {
      const done = await plans.deactivatePlan({ merchant, planId });
      setMessage({
        ok: true,
        text: `Plan ${String(planId)} deactivated (transaction ${shortAddress(done.txHash)}). The list updates after the keeper's next sync.`,
      });
      setConfirming(null);
      onChanged();
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof TransactionError ? error.message : 'The transaction failed.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <table className="table">
        <caption>
          {total} plan{total === 1 ? '' : 's'}
        </caption>
        <thead>
          <tr>
            <th scope="col">Plan</th>
            <th scope="col">Amount</th>
            <th scope="col">Every</th>
            <th scope="col">Status</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((plan) => {
            const info = infos.get(plan.token);
            return (
              <tr key={plan.id}>
                <th scope="row">#{plan.id}</th>
                <td>
                  {info === undefined || info === null ? (
                    <>
                      {plan.amount} <span className="muted">(smallest unit of </span>
                      <span className="mono" title={plan.token}>
                        {shortAddress(plan.token)}
                      </span>
                      <span className="muted">)</span>
                    </>
                  ) : (
                    `${formatAmount(plan.amount, info.decimals)} ${info.symbol}`
                  )}
                </td>
                <td>{describePeriod(plan.periodSecs)}</td>
                <td>
                  <Link
                    href={`/plans/${String(plan.id)}`}
                    aria-label={`Subscribers of plan ${String(plan.id)}`}
                  >
                    Subscribers
                  </Link>{' '}
                  {plan.active ? (
                    <span className="badge badge--ok">Active</span>
                  ) : (
                    <span className="badge badge--warn">Deactivated</span>
                  )}
                </td>
                <td>
                  {plan.active ? (
                    <button
                      type="button"
                      className="btn btn--danger"
                      disabled={!canSign || busy}
                      aria-label={`Deactivate plan ${String(plan.id)}`}
                      onClick={() => {
                        setConfirming(plan.id);
                        setMessage(null);
                      }}
                    >
                      Deactivate
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {confirming === null ? null : (
        <div
          className="card stack"
          role="group"
          aria-label={`Confirm deactivating plan ${String(confirming)}`}
        >
          <p>
            <strong>Deactivate plan {confirming}?</strong> No one can subscribe to it any more.
            People who already subscribed keep being charged until they cancel.
          </p>
          <div className="wallet">
            <button
              type="button"
              className="btn btn--danger"
              ref={confirmRef}
              disabled={busy}
              onClick={() => void deactivate(confirming)}
            >
              {busy ? 'Waiting for your wallet…' : 'Yes, deactivate'}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={busy}
              onClick={() => {
                setConfirming(null);
              }}
            >
              Keep the plan
            </button>
          </div>
        </div>
      )}

      {message === null ? null : (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={message.ok ? 'badge badge--ok' : 'field__error'}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
