/* eslint-disable @typescript-eslint/unbound-method --
   Mocks created with vi.fn are asserted on directly. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  KeeperApiError,
  type KeeperClient,
  type Page,
  type Plan,
  type Subscription,
} from '../lib/keeper-client';
import { TransactionError, type PlanService, type TokenService } from '../lib/plan-service';
import type { WalletAdapter, WalletSession } from '../lib/wallet';
import { PAGE_SIZE, SubscribersView } from './SubscribersView';
import { WalletButton } from './WalletButton';
import { WalletProvider } from './WalletProvider';

const TESTNET = 'Test SDF Network ; September 2015';
const MAINNET = 'Public Global Stellar Network ; September 2015';
const MERCHANT = 'GAIPBT4WCBUALPT77TFYIK4LAHN67QNFM4OOTX3VEH4L6URNOUFJOTSQ';
const STRANGER = 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI';
const SUBSCRIBER = 'GACJH7JXHQWIW66GHZFNMCK2I7WOZ562QAOF7B7PUENTAPRGC5RLW24A';
const TOKEN = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

const PLAN: Plan = {
  id: 1,
  merchant: MERCHANT,
  token: TOKEN,
  amount: '125000000',
  periodSecs: 2_592_000,
  active: true,
};

const now = Math.floor(Date.now() / 1000);
const ACTIVE: Subscription = {
  id: 1,
  planId: 1,
  subscriber: SUBSCRIBER,
  nextChargeTs: now + 86_400,
  status: 'Active',
  charges: 2,
};
const CANCELLED: Subscription = { ...ACTIVE, id: 2, status: 'Cancelled', charges: 0 };
const OVERDUE: Subscription = { ...ACTIVE, id: 3, nextChargeTs: now - 60 };

function page(items: Subscription[], total = items.length, offset = 0): Page<Subscription> {
  return { items, total, limit: PAGE_SIZE, offset };
}

function fakes(
  overrides: {
    getPlan?: KeeperClient['getPlan'];
    list?: KeeperClient['listSubscriptions'];
    cancel?: PlanService['cancelSubscription'];
  } = {},
) {
  const unused = () => Promise.reject(new Error('not used'));
  const keeper: KeeperClient = {
    getHealth: unused,
    getPlan: overrides.getPlan ?? vi.fn(() => Promise.resolve(PLAN)),
    listPlans: unused,
    listSubscriptions:
      overrides.list ?? vi.fn(() => Promise.resolve(page([ACTIVE, CANCELLED, OVERDUE]))),
    listCharges: unused,
    getRevenue: unused,
  };
  const plans: PlanService = {
    createPlan: unused,
    deactivatePlan: unused,
    cancelSubscription:
      overrides.cancel ?? vi.fn(() => Promise.resolve({ txHash: 'CANCEL1234567890' })),
  };
  const tokens: TokenService = {
    getTokenInfo: vi.fn(() => Promise.resolve({ symbol: 'XLM', decimals: 7 })),
  };
  return { keeper, plans, tokens };
}

async function renderView(
  services: ReturnType<typeof fakes>,
  wallet: { address: string; passphrase?: string | null } | null,
  planId = 1,
) {
  const adapter: WalletAdapter = {
    connect: vi.fn(() =>
      Promise.resolve<WalletSession>({
        address: wallet?.address ?? '',
        networkPassphrase: wallet?.passphrase === undefined ? TESTNET : wallet.passphrase,
      }),
    ),
    disconnect: vi.fn(() => Promise.resolve()),
    signTransaction: vi.fn(() => Promise.resolve('SIGNED')),
  };
  render(
    <WalletProvider adapter={adapter} expectedPassphrase={TESTNET}>
      <WalletButton networkLabel="testnet" />
      <SubscribersView planId={planId} {...services} />
    </WalletProvider>,
  );
  if (wallet !== null) {
    fireEvent.click(screen.getByRole('button', { name: 'Connect wallet' }));
    await screen.findByRole('button', { name: 'Disconnect' });
  }
}

const cancelButton = (id: number) =>
  screen.getByRole('button', { name: `Cancel subscription ${String(id)}` });

describe('SubscribersView', () => {
  it('shows the plan and its subscribers in plain words', async () => {
    await renderView(fakes(), null);
    expect(await screen.findByText(/12\.5 XLM/)).toBeTruthy();
    expect(screen.getByText(/every 30 days/)).toBeTruthy();
    const row1 = (await screen.findByRole('rowheader', { name: '#1' })).closest(
      'tr',
    ) as HTMLElement;
    expect(within(row1).getByText('GACJH…W24A').getAttribute('title')).toBe(SUBSCRIBER);
    expect(within(row1).getByText('Active')).toBeTruthy();
    expect(within(row1).getByText('3')).toBeTruthy(); // 2 charges + the first payment
    expect(within(row1).queryByText('Due')).toBeNull();
    const row2 = screen.getByRole('rowheader', { name: '#2' }).closest('tr') as HTMLElement;
    expect(within(row2).getByText('Cancelled')).toBeTruthy();
    expect(within(row2).getByText('1')).toBeTruthy();
    expect(within(row2).queryByRole('button')).toBeNull();
  });

  it('marks a subscription whose charge time has passed as due', async () => {
    await renderView(fakes(), null);
    const row = (await screen.findByRole('rowheader', { name: '#3' })).closest('tr') as HTMLElement;
    expect(within(row).getByText('Due')).toBeTruthy();
  });

  it('asks the keeper for the right plan and page', async () => {
    const services = fakes();
    await renderView(services, null, 1);
    await screen.findByRole('rowheader', { name: '#1' });
    expect(services.keeper.getPlan).toHaveBeenCalledWith(1, expect.anything());
    expect(services.keeper.listSubscriptions).toHaveBeenCalledWith(
      1,
      { limit: PAGE_SIZE, offset: 0 },
      expect.anything(),
    );
  });

  it('shows the keeper message when the plan does not exist, and no subscribers request', async () => {
    const services = fakes({
      getPlan: () => Promise.reject(new KeeperApiError(404, 'NOT_FOUND', 'Plan 9 not found')),
    });
    await renderView(services, null, 9);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Could not load the plan');
    expect(alert.textContent).toContain('Plan 9 not found');
    expect(services.keeper.listSubscriptions).not.toHaveBeenCalled();
  });

  it('says when nobody has subscribed', async () => {
    await renderView(fakes({ list: () => Promise.resolve(page([])) }), null);
    expect(await screen.findByText(/Nobody has subscribed/)).toBeTruthy();
  });

  it('shows a loading error for the subscribers with a retry that works', async () => {
    const list = vi
      .fn<KeeperClient['listSubscriptions']>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(page([ACTIVE]));
    await renderView(fakes({ list }), null);
    expect((await screen.findByRole('alert')).textContent).toContain('Could not load subscribers');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('rowheader', { name: '#1' })).toBeTruthy();
  });

  it('warns on a deactivated plan', async () => {
    await renderView(fakes({ getPlan: () => Promise.resolve({ ...PLAN, active: false }) }), null);
    expect(await screen.findByText(/no new subscribers/)).toBeTruthy();
  });
});

describe('cancelling a subscription', () => {
  it('is not possible without the merchant wallet, and says why', async () => {
    await renderView(fakes(), null);
    await screen.findByRole('rowheader', { name: '#1' });
    expect((cancelButton(1) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Connect the wallet of this plan/)).toBeTruthy();
  });

  it('is not possible for another connected account', async () => {
    await renderView(fakes(), { address: STRANGER });
    await screen.findByRole('rowheader', { name: '#1' });
    expect((cancelButton(1) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Connect the wallet of this plan/)).toBeTruthy();
  });

  it('is not possible on the wrong network', async () => {
    await renderView(fakes(), { address: MERCHANT, passphrase: MAINNET });
    await screen.findByRole('rowheader', { name: '#1' });
    expect((cancelButton(1) as HTMLButtonElement).disabled).toBe(true);
  });

  it('asks for confirmation and sends nothing until confirmed', async () => {
    const services = fakes();
    await renderView(services, { address: MERCHANT });
    await screen.findByRole('rowheader', { name: '#1' });
    fireEvent.click(cancelButton(1));
    const group = screen.getByRole('group', { name: 'Confirm cancelling subscription 1' });
    expect(group.textContent).toContain('not returned');
    expect(document.activeElement).toBe(
      within(group).getByRole('button', { name: 'Yes, cancel it' }),
    );
    expect(services.plans.cancelSubscription).not.toHaveBeenCalled();
    fireEvent.click(within(group).getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByRole('group')).toBeNull();
    expect(services.plans.cancelSubscription).not.toHaveBeenCalled();
  });

  it('cancels after confirmation as the merchant and refreshes the list', async () => {
    const services = fakes();
    await renderView(services, { address: MERCHANT });
    await screen.findByRole('rowheader', { name: '#1' });
    fireEvent.click(cancelButton(1));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel it' }));
    expect((await screen.findByRole('status')).textContent).toContain('Subscription 1 cancelled');
    expect(services.plans.cancelSubscription).toHaveBeenCalledWith({ caller: MERCHANT, subId: 1 });
    await waitFor(() => {
      expect(services.keeper.listSubscriptions).toHaveBeenCalledTimes(2);
    });
  });

  it('shows why it failed and keeps the confirmation open', async () => {
    const cancel = vi
      .fn<PlanService['cancelSubscription']>()
      .mockRejectedValue(
        new TransactionError(
          'REJECTED',
          'You declined the request in your wallet. Nothing was sent.',
        ),
      );
    await renderView(fakes({ cancel }), { address: MERCHANT });
    await screen.findByRole('rowheader', { name: '#1' });
    fireEvent.click(cancelButton(1));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel it' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Nothing was sent');
    expect(screen.getByRole('group')).toBeTruthy();
  });
});

describe('paging', () => {
  it('has no pager when everything fits on one page', async () => {
    await renderView(fakes(), null);
    await screen.findByRole('rowheader', { name: '#1' });
    expect(screen.queryByRole('navigation', { name: 'Pages' })).toBeNull();
  });

  it('moves between pages and asks the keeper for the right offset', async () => {
    const list = vi.fn<KeeperClient['listSubscriptions']>((_planId, options) =>
      Promise.resolve(
        page([{ ...ACTIVE, id: (options?.offset ?? 0) + 1 }], 60, options?.offset ?? 0),
      ),
    );
    await renderView(fakes({ list }), null);
    await screen.findByRole('rowheader', { name: '#1' });
    expect(screen.getByText('Showing 1–1 of 60')).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Previous' }).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('rowheader', { name: '#26' });
    expect(list).toHaveBeenLastCalledWith(
      1,
      { limit: PAGE_SIZE, offset: PAGE_SIZE },
      expect.anything(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await screen.findByRole('rowheader', { name: '#1' });
    expect(list).toHaveBeenLastCalledWith(1, { limit: PAGE_SIZE, offset: 0 }, expect.anything());
  });
});
