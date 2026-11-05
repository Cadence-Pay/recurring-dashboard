import {
  Account,
  Contract,
  StrKey,
  TransactionBuilder,
  type Transaction,
  rpc,
  scValToNative,
} from '@stellar/stellar-sdk';
import { AssembledTransaction, NULL_ACCOUNT, SentTransaction } from '@stellar/stellar-sdk/contract';
import { Client, Error as ContractErrors } from '../contract';
import type { PublicConfig } from './config';
import { WalletError, type WalletAdapter } from './wallet';

/** Why a transaction did not go through. */
export type TransactionErrorCode = 'CONTRACT' | 'REJECTED' | 'PENDING' | 'NETWORK' | 'FAILED';

/**
 * A transaction could not be completed. The message is written for the person using the
 * dashboard. `PENDING` means the transaction was sent but is not confirmed yet: it may still go
 * through, so it must not be sent again blindly.
 */
export class TransactionError extends Error {
  readonly code: TransactionErrorCode;
  /** Contract error name when the contract refused, for example `InvalidPeriod`. */
  readonly contractError: string | undefined;

  constructor(
    code: TransactionErrorCode,
    message: string,
    options?: { contractError?: string; cause?: unknown },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'TransactionError';
    this.code = code;
    this.contractError = options?.contractError;
  }
}

/** What each contract error means for the person, in plain words. */
export const CONTRACT_MESSAGES: Readonly<Record<string, string>> = {
  InvalidAmount: 'The amount must be greater than zero.',
  InvalidPeriod: 'The period must be between 1 minute and 365 days.',
  PlanNotFound: 'That plan does not exist.',
  PlanInactive: 'That plan no longer accepts new subscriptions.',
  SubNotFound: 'That subscription does not exist.',
  NotActive: 'That subscription is already cancelled.',
  NotDue: 'That subscription is not due yet.',
  NotAuthorized: 'Only the subscriber or the merchant of the plan can do that.',
  Overflow: 'A number was too large.',
  PaymentFailed: 'The payment could not be made. The balance or the allowance is too low.',
};

function contractErrorName(message: string): string | undefined {
  const match = /Error\(Contract, #(\d+)\)/.exec(message);
  const code = match?.[1];
  if (code === undefined) return undefined;
  return (ContractErrors as Record<number, { message: string } | undefined>)[Number(code)]?.message;
}

/**
 * Turn anything thrown while building, signing or sending a transaction into a TransactionError
 * with a message the person can act on.
 */
export function toTransactionError(error: unknown): TransactionError {
  if (error instanceof TransactionError) return error;
  if (
    error instanceof AssembledTransaction.Errors.UserRejected ||
    (error instanceof WalletError && error.code === 'REJECTED')
  ) {
    return new TransactionError(
      'REJECTED',
      'You declined the request in your wallet. Nothing was sent.',
      {
        cause: error,
      },
    );
  }
  if (error instanceof WalletError) {
    return new TransactionError('FAILED', error.message, { cause: error });
  }
  if (error instanceof SentTransaction.Errors.TransactionStillPending) {
    return new TransactionError(
      'PENDING',
      'The transaction was sent but is not confirmed yet. Wait a minute and check again before trying again.',
      { cause: error },
    );
  }
  const text = error instanceof Error ? error.message : '';
  if (error instanceof AssembledTransaction.Errors.SimulationFailed) {
    const name = contractErrorName(text);
    if (name !== undefined) {
      return new TransactionError(
        'CONTRACT',
        CONTRACT_MESSAGES[name] ?? `The contract refused: ${name}.`,
        {
          contractError: name,
          cause: error,
        },
      );
    }
    if (/Error\(Auth/.test(text)) {
      return new TransactionError(
        'CONTRACT',
        'This account is not allowed to do that. Only the merchant who created the plan can.',
        { cause: error },
      );
    }
    if (/account not found|does not exist/i.test(text)) {
      return new TransactionError(
        'FAILED',
        'This account does not exist on this network yet. Fund it first.',
        { cause: error },
      );
    }
    return new TransactionError('FAILED', 'The network refused the transaction when testing it.', {
      cause: error,
    });
  }
  if (error instanceof SentTransaction.Errors.SendFailed) {
    return new TransactionError('FAILED', 'The network did not accept the transaction.', {
      cause: error,
    });
  }
  if (error instanceof TypeError || /fetch|network|timeout/i.test(text)) {
    return new TransactionError(
      'NETWORK',
      'Could not reach the network. Check your connection and try again.',
      {
        cause: error,
      },
    );
  }
  return new TransactionError('FAILED', 'The transaction failed.', { cause: error });
}

/** Creating and deactivating plans. */
export interface PlanService {
  /**
   * Create a plan. The merchant's wallet signs.
   * @returns The new plan id and the transaction hash.
   * @throws TransactionError
   */
  createPlan(input: {
    merchant: string;
    token: string;
    amount: bigint;
    periodSecs: number;
  }): Promise<{ planId: number; txHash: string }>;
  /**
   * Stop a plan accepting new subscriptions. The merchant's wallet signs.
   * @throws TransactionError
   */
  deactivatePlan(input: { merchant: string; planId: number }): Promise<{ txHash: string }>;
  /**
   * Cancel a subscription. The caller (the subscriber or the plan's merchant) signs. The
   * subscription is never charged again; the token allowance is not touched.
   * @throws TransactionError
   */
  cancelSubscription(input: { caller: string; subId: number }): Promise<{ txHash: string }>;
}

/** Symbol and decimals of a token. */
export interface TokenInfo {
  readonly symbol: string;
  readonly decimals: number;
}

/** Looks up how a token should be shown. */
export interface TokenService {
  /** @throws TransactionError with code FAILED or NETWORK if the token cannot be read. */
  getTokenInfo(tokenId: string, signal?: AbortSignal): Promise<TokenInfo>;
}

/** A contract result: a value, or an error carrying the SDK's message. */
export interface ResultLike<T> {
  isErr(): boolean;
  unwrap(): T;
  unwrapErr(): { message: string };
}

/** A call that has been simulated and can be signed and sent. */
export interface SimulatedCall<T> {
  readonly result: ResultLike<T>;
  /** The raw simulation response, read only for the contract error code. */
  readonly simulation?: unknown;
  signAndSend(): Promise<{
    readonly result: ResultLike<T>;
    readonly sendTransactionResponse?: { readonly hash: string } | undefined;
  }>;
}

/** The calls of the generated contract client that plan management uses. */
export interface PlanClientLike {
  create_plan(args: {
    merchant: string;
    token: string;
    amount: bigint;
    period_secs: bigint;
  }): Promise<SimulatedCall<bigint>>;
  deactivate_plan(args: { plan_id: bigint }): Promise<SimulatedCall<null>>;
  cancel(args: { caller: string; sub_id: bigint }): Promise<SimulatedCall<null>>;
}

/**
 * Plan service backed by the generated contract client and the connected wallet.
 *
 * @param config - Network and contract settings.
 * @param adapter - Signs through the wallet.
 * @param makeClient - Builds the contract client for an account. Replaceable in tests.
 */
export function createPlanService(
  config: PublicConfig,
  adapter: WalletAdapter,
  makeClient?: (account: string) => PlanClientLike,
): PlanService {
  const clientFor: (account: string) => PlanClientLike =
    makeClient ??
    ((account: string) =>
      new Client({
        contractId: config.contractId,
        networkPassphrase: config.networkPassphrase,
        rpcUrl: config.rpcUrl,
        allowHttp: config.rpcUrl.startsWith('http://'),
        publicKey: account,
        signTransaction: async (xdr) => ({
          signedTxXdr: await adapter.signTransaction(xdr, {
            networkPassphrase: config.networkPassphrase,
            address: account,
          }),
        }),
      }));

  return {
    async createPlan(input) {
      try {
        const tx = await clientFor(input.merchant).create_plan({
          merchant: input.merchant,
          token: input.token,
          amount: input.amount,
          period_secs: BigInt(input.periodSecs),
        });
        if (tx.result.isErr()) throw contractRefusal(tx.result.unwrapErr().message, tx.simulation);
        const sent = await tx.signAndSend();
        if (sent.result.isErr()) throw contractRefusal(sent.result.unwrapErr().message);
        return {
          planId: Number(sent.result.unwrap()),
          txHash: hashOf(sent.sendTransactionResponse),
        };
      } catch (error) {
        throw toTransactionError(error);
      }
    },
    async deactivatePlan(input) {
      try {
        const tx = await clientFor(input.merchant).deactivate_plan({
          plan_id: BigInt(input.planId),
        });
        if (tx.result.isErr()) throw contractRefusal(tx.result.unwrapErr().message, tx.simulation);
        const sent = await tx.signAndSend();
        if (sent.result.isErr()) throw contractRefusal(sent.result.unwrapErr().message);
        return { txHash: hashOf(sent.sendTransactionResponse) };
      } catch (error) {
        throw toTransactionError(error);
      }
    },
    async cancelSubscription(input) {
      try {
        const tx = await clientFor(input.caller).cancel({
          caller: input.caller,
          sub_id: BigInt(input.subId),
        });
        if (tx.result.isErr()) throw contractRefusal(tx.result.unwrapErr().message, tx.simulation);
        const sent = await tx.signAndSend();
        if (sent.result.isErr()) throw contractRefusal(sent.result.unwrapErr().message);
        return { txHash: hashOf(sent.sendTransactionResponse) };
      } catch (error) {
        throw toTransactionError(error);
      }
    },
  };
}

function hashOf(response: { hash: string } | undefined): string {
  if (response === undefined) {
    throw new TransactionError('FAILED', 'The network returned no transaction hash.');
  }
  return response.hash;
}

/** The `error` text of a raw simulation response, if it has one. */
function simulationErrorText(simulation: unknown): string | undefined {
  if (typeof simulation !== 'object' || simulation === null || !('error' in simulation)) {
    return undefined;
  }
  return typeof simulation.error === 'string' ? simulation.error : undefined;
}

/**
 * Build the error for a contract refusal. The SDK's own message comes from doc comments and can
 * be empty or prose, so the contract error code in the raw simulation text is used first.
 */
function contractRefusal(message: string, simulation?: unknown): TransactionError {
  const raw = simulationErrorText(simulation);
  const name =
    (raw === undefined ? undefined : contractErrorName(raw)) ??
    (message in CONTRACT_MESSAGES ? message : undefined);
  if (name !== undefined) {
    return new TransactionError(
      'CONTRACT',
      CONTRACT_MESSAGES[name] ?? `The contract refused: ${name}.`,
      {
        contractError: name,
      },
    );
  }
  return new TransactionError(
    'CONTRACT',
    message === '' ? 'The contract refused the request.' : message,
  );
}

/**
 * Token lookups through simulated calls to the token contract. Nothing is signed or sent.
 *
 * @param config - Network settings.
 */
export function createTokenService(
  config: PublicConfig,
  simulate?: (tx: Transaction) => Promise<rpc.Api.SimulateTransactionResponse>,
): TokenService {
  const server = new rpc.Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith('http://') });
  const run = simulate ?? ((tx: Transaction) => server.simulateTransaction(tx));

  async function view(tokenId: string, method: string): Promise<unknown> {
    const tx = new TransactionBuilder(new Account(NULL_ACCOUNT, '0'), {
      fee: '100',
      networkPassphrase: config.networkPassphrase,
    })
      .addOperation(new Contract(tokenId).call(method))
      .setTimeout(30)
      .build();
    const result = await run(tx);
    if (!rpc.Api.isSimulationSuccess(result) || result.result === undefined) {
      throw new TransactionError('FAILED', `The token did not answer ${method}.`);
    }
    return scValToNative(result.result.retval);
  }

  return {
    async getTokenInfo(tokenId, signal) {
      if (!StrKey.isValidContract(tokenId)) {
        throw new TransactionError('FAILED', 'That is not a valid token contract id.');
      }
      try {
        const [symbol, decimals] = await Promise.all([
          view(tokenId, 'symbol'),
          view(tokenId, 'decimals'),
        ]);
        signal?.throwIfAborted();
        if (typeof symbol !== 'string' || typeof decimals !== 'number') {
          throw new TransactionError('FAILED', 'This contract does not look like a token.');
        }
        // The contract of native XLM answers `native`, which means nothing to a person.
        return { symbol: symbol === 'native' ? 'XLM' : symbol, decimals };
      } catch (error) {
        if (error instanceof TransactionError) throw error;
        if (signal?.aborted === true) throw error;
        throw new TransactionError(
          'FAILED',
          'Could not read this token. Check the contract id and the network.',
          { cause: error },
        );
      }
    },
  };
}
