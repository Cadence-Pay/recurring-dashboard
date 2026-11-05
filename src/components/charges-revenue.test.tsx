/* eslint-disable @typescript-eslint/unbound-method --
   Mocks created with vi.fn are asserted on directly. */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Charge, KeeperClient, Page, Plan, Revenue } from '../lib/keeper-client';
import { KeeperNetworkError } from '../lib/keeper-client';
import type { TokenService } from '../lib/plan-service';
import type { WalletAdapter, WalletSession } from '../lib/wallet';
import { ChargesView, explainError } from './ChargesView';
import { parseId } from './PlanDetailPage';
import { RevenueView } from './RevenueView';
import { PAGE_SIZE } from './SubscribersView';
import { WalletButton } from './WalletButton';
import { WalletProvider } from './WalletProvider';

const TESTNET = 'Test SDF Network ; September 2015';
const MERCHANT = 'GAIPBT4WCBUALPT77TFYIK4LAHN67QNFM4OOTX3VEH4L6URNOUFJOTSQ';
const TOKEN = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const HASH = '9d5fa7605df7e7be0cad4fb12045cbf46259d536519513a59937aaa1e97f832a';

const PLAN: Plan = {
  id: 1,
  merchant: MERCHANT,
  token: TOKEN,
  amount: '125000000',
  periodSecs: 60,
  active: true,
};

function charge(overrides: Partial<Charge>): Charge {
  return {
    id: 1,
    subId: 4,
    planId: 1,
    dueTs: 1_793_883_000,
    amount: '125000000',
    status: 'succeeded',
    attempts: 0,
    txHash: HASH,
    errorCode: null,
    nextAttemptAt: null,
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

function pageOf(items: Charge[], total = items.length, offset = 0): Page<Charge> {
  return { items, total, limit: PAGE_SIZE, offset };
}

function chargeFakes(
  list: KeeperClient['listCharges'],
  tokenInfo: TokenService['getTokenInfo'] = () => Promise.resolve({ symbol: 'XLM', decimals: 7 }),
) {
  const unused = () => Promise.reject(new Error('not used'));
  const keeper: KeeperClient = {
    getHealth: unused,
    getPlan: vi.fn(() => Promise.resolve(PLAN)),
    listPlans: unused,
    listSubscriptions: unused,
    listCharges: list,
    getRevenue: unused,
  };
  const tokens: TokenService = { getTokenInfo: tokenInfo };
  return { keeper, tokens };
}

describe('ChargesView', () => {
  it('lists charges with readable amounts, status and an explorer link on testnet', async () => {
    const { keeper, tokens } = chargeFakes(() => Promise.resolve(pageOf([charge({})])));
    render(<ChargesView subId={4} keeper={keeper} tokens={tokens} network="testnet" />);
    expect(await screen.findByText('12.5 XLM')).toBeTruthy();
    expect(screen.getByText('Charged')).toBeTruthy();
    const link = screen.getByRole('link', { name: /9d5fa760/ });
    expect(link.getAttribute('href')).toBe(`https://stellar.expert/explorer/testnet/tx/${HASH}`);
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.textContent).toContain('opens the block explorer');
  });

  it('shows the raw hash and no link on a private network', async () => {
    const { keeper, tokens } = chargeFakes(() => Promise.resolve(pageOf([charge({})])));
    render(<ChargesView subId={4} keeper={keeper} tokens={tokens} network="local" />);
    expect(await screen.findByText(HASH)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /9d5fa760/ })).toBeNull();
  });

  it('explains a failed charge and a retry that is waiting', async () => {
    const items = [
      charge({ id: 1, status: 'failed', attempts: 5, txHash: null, errorCode: 'PaymentFailed' }),
      charge({
        id: 2,
        dueTs: 1_793_883_100,
        status: 'pending',
        attempts: 2,
        txHash: null,
        errorCode: 'RPC_TIMEOUT',
        nextAttemptAt: 1_793_883_200,
      }),
      charge({ id: 3, dueTs: 1_793_883_300, status: 'superseded', txHash: null }),
    ];
    const { keeper, tokens } = chargeFakes(() => Promise.resolve(pageOf(items)));
    render(<ChargesView subId={4} keeper={keeper} tokens={tokens} network="testnet" />);
    expect(await screen.findByText('Failed')).toBeTruthy();
    expect(screen.getByText(/balance or token allowance was too low/)).toBeTruthy();
    expect(screen.getByText('Waiting to retry')).toBeTruthy();
    expect(screen.getByText(/did not answer in time/)).toBeTruthy();
    expect(screen.getByText(/Next try:/)).toBeTruthy();
    expect(screen.getByText('Handled elsewhere')).toBeTruthy();
  });

  it('falls back to the raw amount when the token cannot be read', async () => {
    const { keeper, tokens } = chargeFakes(
      () => Promise.resolve(pageOf([charge({})])),
      () => Promise.reject(new Error('no token')),
    );
    render(<ChargesView subId={4} keeper={keeper} tokens={tokens} network="testnet" />);
    expect(await screen.findByText('125000000')).toBeTruthy();
  });

  it('explains that the first payment is not a charge when there are none', async () => {
    const { keeper, tokens } = chargeFakes(() => Promise.resolve(pageOf([])));
    render(<ChargesView subId={4} keeper={keeper} tokens={tokens} network="testnet" />);
    expect(await screen.findByText(/No charges yet/)).toBeTruthy();
    expect(keeper.getPlan).not.toHaveBeenCalled();
  });

  it('shows an error with a retry', async () => {
    const list = vi
      .fn<KeeperClient['listCharges']>()
      .mockRejectedValueOnce(new KeeperNetworkError(new Error('down')))
      .mockResolvedValueOnce(pageOf([charge({})]));
    const { keeper, tokens } = chargeFakes(list);
    render(<ChargesView subId={4} keeper={keeper} tokens={tokens} network="testnet" />);
    expect((await screen.findByRole('alert')).textContent).toContain('Could not reach the keeper');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Charged')).toBeTruthy();
  });

  it('pages through many charges', async () => {
    const list = vi.fn<KeeperClient['listCharges']>((_subId, options) =>
      Promise.resolve(
        pageOf([charge({ id: (options?.offset ?? 0) + 1 })], 60, options?.offset ?? 0),
      ),
    );
    const { keeper, tokens } = chargeFakes(list);
    render(<ChargesView subId={4} keeper={keeper} tokens={tokens} network="testnet" />);
    await screen.findByText('Showing 1–1 of 60');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Showing 26–26 of 60');
    expect(list).toHaveBeenLastCalledWith(
      4,
      { limit: PAGE_SIZE, offset: PAGE_SIZE },
      expect.anything(),
    );
  });
});

describe('explainError and parseId', () => {
  it('explain known error codes and pass unknown ones through', () => {
    expect(explainError(null)).toBeNull();
    expect(explainError('PaymentFailed')).toContain('allowance');
    expect(explainError('FEE_CAP_EXCEEDED')).toContain('limit');
    expect(explainError('SOMETHING_NEW')).toBe('SOMETHING_NEW');
  });

  it('parseId accepts positive whole numbers only', () => {
    expect(parseId('7')).toBe(7);
    expect(parseId('123456789')).toBe(123456789);
    for (const bad of [
      '0',
      '-1',
      '01',
      '1.5',
      'abc',
      '',
      '1e3',
      '9999999999999999999',
      undefined,
    ]) {
      expect(parseId(bad), String(bad)).toBeUndefined();
    }
  });
});

const REVENUE: Revenue = {
  merchant: MERCHANT,
  asOf: 1_793_886_022,
  lines: [{ token: TOKEN, total: '20000000', payments: 2 }],
};

function revenueSetup(
  getRevenue: KeeperClient['getRevenue'],
  connected: boolean,
  tokenInfo: TokenService['getTokenInfo'] = () => Promise.resolve({ symbol: 'XLM', decimals: 7 }),
) {
  const unused = () => Promise.reject(new Error('not used'));
  const keeper: KeeperClient = {
    getHealth: unused,
    getPlan: unused,
    listPlans: unused,
    listSubscriptions: unused,
    listCharges: unused,
    getRevenue,
  };
  const adapter: WalletAdapter = {
    connect: vi.fn(() =>
      Promise.resolve<WalletSession>({ address: MERCHANT, networkPassphrase: TESTNET }),
    ),
    disconnect: vi.fn(() => Promise.resolve()),
    signTransaction: vi.fn(() => Promise.resolve('SIGNED')),
  };
  render(
    <WalletProvider adapter={adapter} expectedPassphrase={TESTNET}>
      <WalletButton networkLabel="testnet" />
      <RevenueView keeper={keeper} tokens={{ getTokenInfo: tokenInfo }} />
    </WalletProvider>,
  );
  if (connected) fireEvent.click(screen.getByRole('button', { name: 'Connect wallet' }));
  return keeper;
}

describe('RevenueView', () => {
  it('asks the person to connect, without calling the keeper', () => {
    const getRevenue = vi.fn<KeeperClient['getRevenue']>();
    revenueSetup(getRevenue, false);
    expect(screen.getByText(/Connect your wallet to see your revenue/)).toBeTruthy();
    expect(getRevenue).not.toHaveBeenCalled();
  });

  it('shows the total per token in whole tokens, the payment count and when it was counted', async () => {
    const getRevenue = vi.fn<KeeperClient['getRevenue']>(() => Promise.resolve(REVENUE));
    revenueSetup(getRevenue, true);
    const row = (await screen.findByRole('rowheader', { name: /XLM/ })).closest(
      'tr',
    ) as HTMLElement;
    expect(within(row).getByText('2 XLM')).toBeTruthy();
    expect(within(row).getByText('2')).toBeTruthy();
    expect(getRevenue).toHaveBeenCalledWith(MERCHANT, expect.anything());
    expect(screen.getByText(/As of the keeper/)).toBeTruthy();
  });

  it('falls back to the smallest unit when the token cannot be read', async () => {
    revenueSetup(
      () => Promise.resolve(REVENUE),
      true,
      () => Promise.reject(new Error('no')),
    );
    expect(await screen.findByText('20000000 (smallest unit)')).toBeTruthy();
  });

  it('keeps a huge 128-bit total exact', async () => {
    const huge = (2n ** 100n).toString();
    revenueSetup(
      () => Promise.resolve({ ...REVENUE, lines: [{ token: TOKEN, total: huge, payments: 1 }] }),
      true,
      () => Promise.resolve({ symbol: 'BIG', decimals: 0 }),
    );
    expect(await screen.findByText(`${huge} BIG`)).toBeTruthy();
  });

  it('says there is no revenue yet', async () => {
    revenueSetup(() => Promise.resolve({ ...REVENUE, lines: [] }), true);
    expect(await screen.findByText(/No revenue yet/)).toBeTruthy();
  });

  it('shows an error with a retry', async () => {
    const getRevenue = vi
      .fn<KeeperClient['getRevenue']>()
      .mockRejectedValueOnce(new KeeperNetworkError(new Error('down')))
      .mockResolvedValueOnce(REVENUE);
    revenueSetup(getRevenue, true);
    expect((await screen.findByRole('alert')).textContent).toContain('Could not load your revenue');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('2 XLM')).toBeTruthy();
  });
});
