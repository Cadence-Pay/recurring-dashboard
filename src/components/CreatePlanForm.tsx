'use client';

import { StrKey } from '@stellar/stellar-sdk';
import { useId, useRef, useState, type SyntheticEvent } from 'react';
import { PERIOD_UNITS, parseAmount, parsePeriod } from '../lib/amount';
import { TransactionError, type PlanService, type TokenService } from '../lib/plan-service';
import { useAsync } from '../lib/use-async';
import { shortAddress } from './WalletButton';

type Outcome =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'done'; readonly planId: number; readonly txHash: string }
  | { readonly status: 'error'; readonly code: string; readonly message: string };

interface FieldErrors {
  token?: string;
  amount?: string;
  period?: string;
}

/** Props of {@link CreatePlanForm}. */
export interface CreatePlanFormProps {
  /** The connected merchant. They sign and receive the payments. */
  readonly merchant: string;
  readonly plans: PlanService;
  readonly tokens: TokenService;
  /** False when the wallet is on the wrong network: the form is shown but cannot be submitted. */
  readonly canSign: boolean;
  /** Called after a plan was created, so the list can refresh. */
  readonly onCreated: () => void;
}

/**
 * Form to create a plan: which token, how much per period, how often.
 *
 * The amount is typed in whole tokens and converted using the token's own number of decimals,
 * which are read from the token contract once a valid token id is entered.
 */
export function CreatePlanForm(props: CreatePlanFormProps) {
  const { merchant, plans, tokens, canSign, onCreated } = props;
  const ids = {
    token: useId(),
    amount: useId(),
    period: useId(),
    unit: useId(),
  };
  const [token, setToken] = useState('');
  const [amount, setAmount] = useState('');
  const [periodValue, setPeriodValue] = useState('');
  const [unit, setUnit] = useState<(typeof PERIOD_UNITS)[number]['id']>('days');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [outcome, setOutcome] = useState<Outcome>({ status: 'idle' });
  const tokenRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const periodRef = useRef<HTMLInputElement>(null);

  const trimmedToken = token.trim();
  const tokenIsValid = StrKey.isValidContract(trimmedToken);
  const { state: tokenState } = useAsync(
    (signal) => (tokenIsValid ? tokens.getTokenInfo(trimmedToken, signal) : Promise.resolve(null)),
    [tokenIsValid ? trimmedToken : null, tokens],
  );
  const info = tokenState.status === 'ready' ? tokenState.data : null;

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    if (outcome.status === 'submitting') return;

    const next: FieldErrors = {};
    if (!tokenIsValid) next.token = 'Enter the token contract id (it starts with C).';
    else if (tokenState.status === 'error') next.token = tokenState.error.message;
    else if (info === null) next.token = 'Wait until the token has been read.';
    const parsedAmount = info === null ? undefined : parseAmount(amount, info.decimals);
    if (parsedAmount !== undefined && !parsedAmount.ok) next.amount = parsedAmount.message;
    else if (info !== null && parsedAmount === undefined) next.amount = 'Enter an amount.';
    const unitSecs = PERIOD_UNITS.find((u) => u.id === unit)?.secs ?? 60;
    const parsedPeriod = parsePeriod(periodValue, unitSecs);
    if (!parsedPeriod.ok) next.period = parsedPeriod.message;
    setErrors(next);

    const firstInvalid =
      next.token !== undefined
        ? tokenRef.current
        : next.amount !== undefined
          ? amountRef.current
          : next.period !== undefined
            ? periodRef.current
            : undefined;
    if (firstInvalid !== undefined) {
      firstInvalid?.focus();
      return;
    }
    if (parsedAmount?.ok !== true || !parsedPeriod.ok) return;

    setOutcome({ status: 'submitting' });
    try {
      const created = await plans.createPlan({
        merchant,
        token: trimmedToken,
        amount: parsedAmount.value,
        periodSecs: parsedPeriod.value,
      });
      setOutcome({ status: 'done', planId: created.planId, txHash: created.txHash });
      onCreated();
    } catch (error) {
      const failure =
        error instanceof TransactionError
          ? error
          : new TransactionError('FAILED', 'The transaction failed.');
      setOutcome({ status: 'error', code: failure.code, message: failure.message });
    }
  }

  const submitting = outcome.status === 'submitting';
  return (
    <form
      className="card stack"
      onSubmit={(e) => void submit(e)}
      noValidate
      aria-labelledby={`${ids.token}-title`}
    >
      <h2 id={`${ids.token}-title`}>Create a plan</h2>
      <p className="muted">
        Subscribers pay the first period when they subscribe, then the keeper charges once per
        period.
      </p>

      <div className="field">
        <label htmlFor={ids.token}>Token contract id</label>
        <input
          id={ids.token}
          ref={tokenRef}
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
          }}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={errors.token !== undefined}
          aria-describedby={`${ids.token}-help`}
        />
        <p
          id={`${ids.token}-help`}
          className={errors.token === undefined ? 'muted' : 'field__error'}
        >
          {errors.token ??
            (!tokenIsValid
              ? 'The Stellar asset contract or other token that subscribers pay with.'
              : tokenState.status === 'loading'
                ? 'Reading the token…'
                : tokenState.status === 'error'
                  ? tokenState.error.message
                  : `Token: ${info?.symbol ?? ''}, ${String(info?.decimals ?? 0)} decimal places.`)}
        </p>
      </div>

      <div className="field">
        <label htmlFor={ids.amount}>
          Amount per period{info === null ? '' : ` (${info.symbol})`}
        </label>
        <input
          id={ids.amount}
          ref={amountRef}
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
          }}
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={errors.amount !== undefined}
          aria-describedby={`${ids.amount}-help`}
        />
        <p
          id={`${ids.amount}-help`}
          className={errors.amount === undefined ? 'muted' : 'field__error'}
        >
          {errors.amount ?? 'In whole tokens, for example 5 or 12.5.'}
        </p>
      </div>

      <div className="field">
        <label htmlFor={ids.period}>Charge every</label>
        <div className="wallet">
          <input
            id={ids.period}
            ref={periodRef}
            value={periodValue}
            onChange={(e) => {
              setPeriodValue(e.target.value);
            }}
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={errors.period !== undefined}
            aria-describedby={`${ids.period}-help`}
          />
          <label htmlFor={ids.unit} className="visually-hidden">
            Unit
          </label>
          <select
            id={ids.unit}
            value={unit}
            onChange={(e) => {
              const chosen = PERIOD_UNITS.find((u) => u.id === e.target.value);
              if (chosen !== undefined) setUnit(chosen.id);
            }}
          >
            {PERIOD_UNITS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
        <p
          id={`${ids.period}-help`}
          className={errors.period === undefined ? 'muted' : 'field__error'}
        >
          {errors.period ?? 'From 1 minute to 365 days.'}
        </p>
      </div>

      <button
        type="submit"
        className="btn"
        disabled={!canSign || submitting}
        aria-busy={submitting}
      >
        {submitting ? 'Waiting for your wallet…' : 'Create plan'}
      </button>
      {canSign ? null : (
        <p className="muted">Switch your wallet to the right network to create a plan.</p>
      )}

      {outcome.status === 'done' ? (
        <p role="status" className="badge badge--ok">
          Plan {outcome.planId} created (transaction {shortAddress(outcome.txHash)}). It appears in
          the list after the keeper&apos;s next sync.
        </p>
      ) : null}
      {outcome.status === 'error' ? (
        <p
          role="alert"
          className={outcome.code === 'PENDING' ? 'badge badge--warn' : 'field__error'}
        >
          {outcome.message}
        </p>
      ) : null}
    </form>
  );
}
