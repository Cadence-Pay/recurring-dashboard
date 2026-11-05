// @vitest-environment node
// This file tests service logic with no DOM. Under jsdom the XDR library sees a different
// Uint8Array than Node's and rejects its own byte arrays, which does not happen in a real browser.
import { nativeToScVal, type rpc } from '@stellar/stellar-sdk';
import { AssembledTransaction, SentTransaction } from '@stellar/stellar-sdk/contract';
import { describe, expect, it, vi } from 'vitest';
import type { PublicConfig } from './config';
import {
  CONTRACT_MESSAGES,
  TransactionError,
  createPlanService,
  createTokenService,
  toTransactionError,
  type PlanClientLike,
  type ResultLike,
  type SimulatedCall,
} from './plan-service';
import { WalletError, type WalletAdapter } from './wallet';

const CONFIG: PublicConfig = {
  keeperUrl: 'http://k.test',
  network: 'testnet',
  networkPassphrase: 'Test SDF Network ; September 2015',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  contractId: 'CCUXOGU3N5HWMLRDXC5TCQ3QDA23X3RJCDXWHMBIC4SFLD2IABQT465E',
};
const MERCHANT = 'GAIPBT4WCBUALPT77TFYIK4LAHN67QNFM4OOTX3VEH4L6URNOUFJOTSQ';
const TOKEN = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

const adapter: WalletAdapter = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  signTransaction: vi.fn(),
};

function ok<T>(value: T): ResultLike<T> {
  return {
    isErr: () => false,
    unwrap: () => value,
    unwrapErr: () => {
      throw new Error('not an error');
    },
  };
}

function err<T>(message: string): ResultLike<T> {
  return {
    isErr: () => true,
    unwrap: () => {
      throw new Error(message);
    },
    unwrapErr: () => ({ message }),
  };
}

function call<T>(
  result: ResultLike<T>,
  options: {
    sent?: ResultLike<T>;
    hash?: string | null;
    simulation?: unknown;
    sendFails?: Error;
  } = {},
): SimulatedCall<T> {
  return {
    result,
    simulation: options.simulation,
    signAndSend: () =>
      options.sendFails !== undefined
        ? Promise.reject(options.sendFails)
        : Promise.resolve({
            result: options.sent ?? result,
            sendTransactionResponse:
              options.hash === null ? undefined : { hash: options.hash ?? 'HASH' },
          }),
  };
}

function service(client: Partial<PlanClientLike>) {
  const full: PlanClientLike = {
    create_plan: () => Promise.resolve(call(ok(1n))),
    deactivate_plan: () => Promise.resolve(call(ok(null))),
    cancel: () => Promise.resolve(call(ok(null))),
    ...client,
  };
  return createPlanService(CONFIG, adapter, () => full);
}

const INPUT = { merchant: MERCHANT, token: TOKEN, amount: 10_000_000n, periodSecs: 60 };

describe('createPlanService.createPlan', () => {
  it('creates a plan and returns its id and transaction hash', async () => {
    const create_plan = vi.fn(() => Promise.resolve(call(ok(7n), { hash: 'ABC' })));
    const result = await service({ create_plan }).createPlan(INPUT);
    expect(result).toEqual({ planId: 7, txHash: 'ABC' });
    expect(create_plan).toHaveBeenCalledWith({
      merchant: MERCHANT,
      token: TOKEN,
      amount: 10_000_000n,
      period_secs: 60n,
    });
  });

  it('reports a contract refusal found while testing, using the error code', async () => {
    const refused = call(err<bigint>('Amount is zero or negative.'), {
      simulation: { error: 'HostError: Error(Contract, #2)' },
    });
    const failure = await service({ create_plan: () => Promise.resolve(refused) })
      .createPlan(INPUT)
      .catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(TransactionError);
    expect(failure).toMatchObject({ code: 'CONTRACT', contractError: 'InvalidPeriod' });
    expect((failure as TransactionError).message).toBe(CONTRACT_MESSAGES['InvalidPeriod']);
  });

  it('reports a simulation failure thrown by the SDK', async () => {
    const failure = await service({
      create_plan: () =>
        Promise.reject(
          new AssembledTransaction.Errors.SimulationFailed('HostError: Error(Contract, #1)'),
        ),
    })
      .createPlan(INPUT)
      .catch((e: unknown) => e);
    expect(failure).toMatchObject({ code: 'CONTRACT', contractError: 'InvalidAmount' });
  });

  it('says so when the person declines to sign, and nothing was sent', async () => {
    const declined = call(ok(1n), {
      sendFails: new WalletError('REJECTED', 'closed'),
    });
    const failure = await service({ create_plan: () => Promise.resolve(declined) })
      .createPlan(INPUT)
      .catch((e: unknown) => e);
    expect(failure).toMatchObject({ code: 'REJECTED' });
    expect((failure as TransactionError).message).toContain('Nothing was sent');
  });

  it('warns that a transaction may still go through when it stays pending', async () => {
    const pending = call(ok(1n), {
      sendFails: new SentTransaction.Errors.TransactionStillPending('pending'),
    });
    const failure = await service({ create_plan: () => Promise.resolve(pending) })
      .createPlan(INPUT)
      .catch((e: unknown) => e);
    expect(failure).toMatchObject({ code: 'PENDING' });
    expect((failure as TransactionError).message).toContain('before trying again');
  });

  it('fails when the network returns no transaction hash', async () => {
    const noHash = call(ok(1n), { hash: null });
    const failure = await service({ create_plan: () => Promise.resolve(noHash) })
      .createPlan(INPUT)
      .catch((e: unknown) => e);
    expect(failure).toMatchObject({ code: 'FAILED' });
  });

  it('reports a network failure', async () => {
    const failure = await service({
      create_plan: () => Promise.reject(new TypeError('fetch failed')),
    })
      .createPlan(INPUT)
      .catch((e: unknown) => e);
    expect(failure).toMatchObject({ code: 'NETWORK' });
  });
});

describe('createPlanService.deactivatePlan', () => {
  it('deactivates and returns the transaction hash', async () => {
    const deactivate_plan = vi.fn(() => Promise.resolve(call(ok(null), { hash: 'DEACT' })));
    const result = await service({ deactivate_plan }).deactivatePlan({
      merchant: MERCHANT,
      planId: 3,
    });
    expect(result).toEqual({ txHash: 'DEACT' });
    expect(deactivate_plan).toHaveBeenCalledWith({ plan_id: 3n });
  });

  it('explains an authorization failure in plain words', async () => {
    const failure = await service({
      deactivate_plan: () =>
        Promise.reject(
          new AssembledTransaction.Errors.SimulationFailed('HostError: Error(Auth, InvalidAction)'),
        ),
    })
      .deactivatePlan({ merchant: MERCHANT, planId: 3 })
      .catch((e: unknown) => e);
    expect(failure).toMatchObject({ code: 'CONTRACT' });
    expect((failure as TransactionError).message).toContain('Only the merchant');
  });

  it('reports an unknown plan', async () => {
    const failure = await service({
      deactivate_plan: () =>
        Promise.reject(
          new AssembledTransaction.Errors.SimulationFailed('HostError: Error(Contract, #3)'),
        ),
    })
      .deactivatePlan({ merchant: MERCHANT, planId: 99 })
      .catch((e: unknown) => e);
    expect(failure).toMatchObject({ contractError: 'PlanNotFound' });
  });
});

describe('createPlanService.cancelSubscription', () => {
  it('cancels and returns the transaction hash', async () => {
    const cancel = vi.fn(() => Promise.resolve(call(ok(null), { hash: 'CXL' })));
    const result = await service({ cancel }).cancelSubscription({ caller: MERCHANT, subId: 4 });
    expect(result).toEqual({ txHash: 'CXL' });
    expect(cancel).toHaveBeenCalledWith({ caller: MERCHANT, sub_id: 4n });
  });

  it('explains that a subscription cannot be cancelled twice', async () => {
    const failure = await service({
      cancel: () =>
        Promise.reject(
          new AssembledTransaction.Errors.SimulationFailed('HostError: Error(Contract, #6)'),
        ),
    })
      .cancelSubscription({ caller: MERCHANT, subId: 4 })
      .catch((e: unknown) => e);
    expect(failure).toMatchObject({ code: 'CONTRACT', contractError: 'NotActive' });
    expect((failure as TransactionError).message).toContain('already cancelled');
  });

  it('says so when the person declines to sign', async () => {
    const declined = call(ok(null), { sendFails: new WalletError('REJECTED', 'closed') });
    const failure = await service({ cancel: () => Promise.resolve(declined) })
      .cancelSubscription({ caller: MERCHANT, subId: 4 })
      .catch((e: unknown) => e);
    expect(failure).toMatchObject({ code: 'REJECTED' });
  });
});

describe('toTransactionError', () => {
  it('passes a TransactionError through', () => {
    const e = new TransactionError('FAILED', 'x');
    expect(toTransactionError(e)).toBe(e);
  });

  it('maps an unfunded account', () => {
    const e = toTransactionError(
      new AssembledTransaction.Errors.SimulationFailed('Account not found: GABC'),
    );
    expect(e.message).toContain('does not exist on this network');
  });

  it('keeps an unknown simulation failure generic', () => {
    const e = toTransactionError(new AssembledTransaction.Errors.SimulationFailed('weird'));
    expect(e).toMatchObject({ code: 'FAILED' });
  });

  it('maps a rejected send and a wallet failure', () => {
    expect(toTransactionError(new SentTransaction.Errors.SendFailed('txBadSeq')).code).toBe(
      'FAILED',
    );
    expect(toTransactionError(new WalletError('FAILED', 'device locked'))).toMatchObject({
      code: 'FAILED',
      message: 'device locked',
    });
    expect(toTransactionError(new AssembledTransaction.Errors.UserRejected('no')).code).toBe(
      'REJECTED',
    );
  });

  it('never exposes raw internals for something unknown', () => {
    expect(toTransactionError('weird').message).toBe('The transaction failed.');
  });
});

describe('createTokenService', () => {
  const answer = (symbol: unknown, decimals: unknown) => {
    const values = new Map<string, unknown>([
      ['symbol', symbol],
      ['decimals', decimals],
    ]);
    return vi.fn((tx: { operations: unknown[] }) => {
      const op = tx.operations[0] as {
        func: { invokeContract: { functionName: { toString(): string } } };
      };
      const method = op.func.invokeContract.functionName.toString();
      const value = values.get(method);
      const retval =
        typeof value === 'number'
          ? nativeToScVal(value, { type: 'u32' })
          : nativeToScVal(String(value));
      return Promise.resolve({
        transactionData: {},
        result: { retval },
      } as unknown as rpc.Api.SimulateTransactionResponse);
    });
  };

  it('reads the symbol and decimals of a token', async () => {
    const simulate = answer('XLM', 7);
    const info = await createTokenService(CONFIG, simulate).getTokenInfo(TOKEN);
    expect(info).toEqual({ symbol: 'XLM', decimals: 7 });
    expect(simulate).toHaveBeenCalledTimes(2);
  });

  it('shows the native token as XLM instead of the word the contract answers', async () => {
    const info = await createTokenService(CONFIG, answer('native', 7)).getTokenInfo(TOKEN);
    expect(info.symbol).toBe('XLM');
  });

  it('refuses an id that is not a contract', async () => {
    const simulate = answer('XLM', 7);
    const failure = await createTokenService(CONFIG, simulate as never)
      .getTokenInfo('GABC')
      .catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(TransactionError);
    expect(simulate).not.toHaveBeenCalled();
  });

  it('refuses something that answers but is not a token', async () => {
    const failure = await createTokenService(CONFIG, answer('XLM', 'seven') as never)
      .getTokenInfo(TOKEN)
      .catch((e: unknown) => e);
    expect((failure as TransactionError).message).toContain('does not look like a token');
  });

  it('reports a contract that cannot be simulated', async () => {
    const simulate = vi.fn(() =>
      Promise.resolve({
        error: 'no such function',
      } as unknown as rpc.Api.SimulateTransactionResponse),
    );
    const failure = await createTokenService(CONFIG, simulate as never)
      .getTokenInfo(TOKEN)
      .catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(TransactionError);
  });

  it('reports a network failure without leaking internals', async () => {
    const simulate = vi.fn(() => Promise.reject(new TypeError('fetch failed')));
    const failure = await createTokenService(CONFIG, simulate as never)
      .getTokenInfo(TOKEN)
      .catch((e: unknown) => e);
    expect((failure as TransactionError).message).toContain('Could not read this token');
  });
});
