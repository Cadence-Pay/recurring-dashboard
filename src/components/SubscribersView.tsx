'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { describePeriod, formatAmount } from '../lib/amount';
import type { KeeperClient, Plan, Subscription } from '../lib/keeper-client';
import { TransactionError, type PlanService, type TokenService } from '../lib/plan-service';
import { useAsync } from '../lib/use-async';
import { formatTime } from './KeeperStatus';
import { StateView } from './StateView';
import { shortAddress } from './WalletButton';
import { useWallet } from './WalletProvider';

/** Subscribers shown per page. */
export const PAGE_SIZE = 25;

/** Props of {@link SubscribersView}. */
export interface SubscribersViewProps {
  readonly planId: number;
  readonly keeper: KeeperClient;
  readonly plans: PlanService;
  readonly tokens: TokenService;
}

/** One plan and the people subscribed to it. */
export function SubscribersView(props: SubscribersViewProps) {
  const { planId, keeper, plans, tokens } = props;
  const { state: planState, reload: retryPlan } = useAsync(
    (signal) => keeper.getPlan(planId, signal),
    [keeper, planId],
  );
  return (
    <div className="stack">
      <p>
        <Link href="/plans">← All plans</Link>
      </p>
      <StateView state={planState} what="the plan" onRetry={retryPlan}>
        {(plan) => (
          <PlanWithSubscribers plan={plan} keeper={keeper} plans={plans} tokens={tokens} />
        )}
      </StateView>
    </div>
  );
}

function PlanWithSubscribers(props: {
  plan: Plan;
  keeper: KeeperClient;
  plans: PlanService;
  tokens: TokenService;
}) {
  const { plan, keeper, plans, tokens } = props;
  const { state: wallet, wrongNetwork } = useWallet();
  const [offset, setOffset] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const { state: tokenState } = useAsync(
    (signal) => tokens.getTokenInfo(plan.token, signal),
    [tokens, plan.token],
  );
  const { state, reload: retry } = useAsync(
    (signal) => keeper.listSubscriptions(plan.id, { limit: PAGE_SIZE, offset }, signal),
    [keeper, plan.id, offset, reloadKey],
  );

  const isMerchant = wallet.status === 'connected' && wallet.address === plan.merchant;
  const canCancel = isMerchant && !wrongNetwork;
  const token = tokenState.status === 'ready' ? tokenState.data : null;

  return (
    <div className="stack">
      <section className="card stack" aria-labelledby="plan-title">
        <h2 id="plan-title">Plan #{plan.id}</h2>
        <p>
          {token === null
            ? `${plan.amount} (smallest unit)`
            : `${formatAmount(plan.amount, token.decimals)} ${token.symbol}`}{' '}
          every {describePeriod(plan.periodSecs)}{' '}
          {plan.active ? (
            <span className="badge badge--ok">Active</span>
          ) : (
            <span className="badge badge--warn">Deactivated: no new subscribers</span>
          )}
        </p>
      </section>

      <section aria-labelledby="subscribers-title" className="stack">
        <div className="wallet">
          <h2 id="subscribers-title">Subscribers</h2>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => {
              setReloadKey((n) => n + 1);
            }}
          >
            Refresh
          </button>
        </div>
        {isMerchant ? null : (
          <p className="muted">
            Connect the wallet of this plan&apos;s merchant to cancel subscriptions.
          </p>
        )}
        <StateView
          state={state}
          what="subscribers"
          onRetry={retry}
          isEmpty={(page) => page.total === 0}
          empty="Nobody has subscribed to this plan yet."
        >
          {(page) => (
            <>
              <SubscribersTable
                items={page.items}
                caller={wallet.status === 'connected' ? wallet.address : null}
                plans={plans}
                canCancel={canCancel}
                onChanged={() => {
                  setReloadKey((n) => n + 1);
                }}
              />
              <Pager
                total={page.total}
                offset={page.offset}
                shown={page.items.length}
                onChange={setOffset}
              />
            </>
          )}
        </StateView>
      </section>
    </div>
  );
}

/** Previous and next buttons with a "Showing 1–25 of 60" line. */
export function Pager(props: {
  total: number;
  offset: number;
  shown: number;
  onChange: (offset: number) => void;
}) {
  const { total, offset, shown, onChange } = props;
  if (total <= PAGE_SIZE) return null;
  return (
    <nav aria-label="Pages" className="wallet">
      <button
        type="button"
        className="btn btn--secondary"
        disabled={offset === 0}
        onClick={() => {
          onChange(Math.max(0, offset - PAGE_SIZE));
        }}
      >
        Previous
      </button>
      <span aria-live="polite">
        Showing {offset + 1}–{offset + shown} of {total}
      </span>
      <button
        type="button"
        className="btn btn--secondary"
        disabled={offset + shown >= total}
        onClick={() => {
          onChange(offset + PAGE_SIZE);
        }}
      >
        Next
      </button>
    </nav>
  );
}

function SubscribersTable(props: {
  items: Subscription[];
  caller: string | null;
  plans: PlanService;
  canCancel: boolean;
  onChanged: () => void;
}) {
  const { items, caller, plans, canCancel, onChanged } = props;
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming !== null) confirmRef.current?.focus();
  }, [confirming]);

  async function cancel(subId: number) {
    if (caller === null) return;
    setBusy(true);
    setMessage(null);
    try {
      const done = await plans.cancelSubscription({ caller, subId });
      setMessage({
        ok: true,
        text: `Subscription ${String(subId)} cancelled (transaction ${shortAddress(done.txHash)}). The list updates after the keeper's next sync.`,
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

  const nowSecs = Math.floor(Date.now() / 1000);
  return (
    <div className="stack">
      <table className="table">
        <caption>Subscriptions to this plan</caption>
        <thead>
          <tr>
            <th scope="col">Subscription</th>
            <th scope="col">Subscriber</th>
            <th scope="col">Status</th>
            <th scope="col">Next charge</th>
            <th scope="col">Payments made</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((sub) => (
            <tr key={sub.id}>
              <th scope="row">#{sub.id}</th>
              <td>
                <span className="mono" title={sub.subscriber}>
                  {shortAddress(sub.subscriber)}
                </span>
              </td>
              <td>
                {sub.status === 'Active' ? (
                  <span className="badge badge--ok">Active</span>
                ) : (
                  <span className="badge badge--bad">Cancelled</span>
                )}
              </td>
              <td>
                {sub.status === 'Active' ? (
                  <>
                    {formatTime(sub.nextChargeTs)}
                    {sub.nextChargeTs <= nowSecs ? (
                      <>
                        {' '}
                        <span className="badge badge--warn">Due</span>
                      </>
                    ) : null}
                  </>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td>{sub.charges + 1}</td>
              <td>
                <Link
                  href={`/subscriptions/${String(sub.id)}`}
                  aria-label={`Charges of subscription ${String(sub.id)}`}
                >
                  Charges
                </Link>{' '}
                {sub.status === 'Active' ? (
                  <button
                    type="button"
                    className="btn btn--danger"
                    disabled={!canCancel || busy}
                    aria-label={`Cancel subscription ${String(sub.id)}`}
                    onClick={() => {
                      setConfirming(sub.id);
                      setMessage(null);
                    }}
                  >
                    Cancel
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {confirming === null ? null : (
        <div
          className="card stack"
          role="group"
          aria-label={`Confirm cancelling subscription ${String(confirming)}`}
        >
          <p>
            <strong>Cancel subscription {confirming}?</strong> The subscriber will not be charged
            again. They would have to subscribe again to come back. Money already paid is not
            returned.
          </p>
          <div className="wallet">
            <button
              type="button"
              className="btn btn--danger"
              ref={confirmRef}
              disabled={busy}
              onClick={() => void cancel(confirming)}
            >
              {busy ? 'Waiting for your wallet…' : 'Yes, cancel it'}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={busy}
              onClick={() => {
                setConfirming(null);
              }}
            >
              Keep it
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
