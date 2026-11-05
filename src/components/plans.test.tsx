/* eslint-disable @typescript-eslint/unbound-method --
   Mocks created with vi.fn are asserted on directly. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { KeeperClient, Page, Plan } from '../lib/keeper-client';
import { KeeperNetworkError } from '../lib/keeper-client';
import {
  TransactionError,
  type PlanService,
  type TokenInfo,
  type TokenService,
} from '../lib/plan-service';
import type { WalletAdapter, WalletSession } from '../lib/wallet';
import { PlansView } from './PlansView';
import { WalletButton } from './WalletButton';
import { WalletProvider } from './WalletProvider';

const TESTNET = 'Test SDF Network ; September 2015';
const MAINNET = 'Public Global Stellar Network ; September 2015';
const MERCHANT = 'GAIPBT4WCBUALPT77TFYIK4LAHN67QNFM4OOTX3VEH4L6URNOUFJOTSQ';
const TOKEN = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const XLM: TokenInfo = { symbol: 'XLM', decimals: 7 };

const PLAN: Plan = {
  id: 1,
  merchant: MERCHANT,
  token: TOKEN,
  amount: '125000000',
  periodSecs: 2_592_000,
  active: true,
};

function pageOf(items: Plan[]): Page<Plan> {
  return { items, total: items.length, limit: 200, offset: 0 };
}

function fakes(
  overrides: {
    list?: KeeperClient['listPlans'];
    createPlan?: PlanService['createPlan'];
    deactivatePlan?: PlanService['deactivatePlan'];
    getTokenInfo?: TokenService['getTokenInfo'];
  } = {},
) {
  const unused = () => Promise.reject(new Error('not used'));
  const keeper: KeeperClient = {
    getHealth: unused,
    getPlan: unused,
    listPlans: overrides.list ?? vi.fn(() => Promise.resolve(pageOf([PLAN]))),
    listSubscriptions: unused,
    listCharges: unused,
    getRevenue: unused,
  };
  const plans: PlanService = {
    createPlan:
      overrides.createPlan ??
      vi.fn(() => Promise.resolve({ planId: 2, txHash: 'ABCDEF1234567890' })),
    deactivatePlan:
      overrides.deactivatePlan ?? vi.fn(() => Promise.resolve({ txHash: 'DEACT1234567890' })),
    cancelSubscription: vi.fn(() => Promise.resolve({ txHash: 'CANCEL1234567890' })),
  };
  const tokens: TokenService = {
    getTokenInfo: overrides.getTokenInfo ?? vi.fn(() => Promise.resolve(XLM)),
  };
  return { keeper, plans, tokens };
}

async function renderConnected(
  services: ReturnType<typeof fakes>,
  walletPassphrase: string | null = TESTNET,
) {
  const adapter: WalletAdapter = {
    connect: vi.fn(() =>
      Promise.resolve<WalletSession>({ address: MERCHANT, networkPassphrase: walletPassphrase }),
    ),
    disconnect: vi.fn(() => Promise.resolve()),
    signTransaction: vi.fn(() => Promise.resolve('SIGNED')),
  };
  render(
    <WalletProvider adapter={adapter} expectedPassphrase={TESTNET}>
      <WalletButton networkLabel="testnet" />
      <PlansView {...services} />
    </WalletProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Connect wallet' }));
  await screen.findByRole('button', { name: 'Disconnect' });
}

function fillForm(token: string, amount: string, period: string) {
  fireEvent.change(screen.getByLabelText('Token contract id'), { target: { value: token } });
  fireEvent.change(screen.getByLabelText(/Amount per period/), { target: { value: amount } });
  fireEvent.change(screen.getByLabelText('Charge every'), { target: { value: period } });
}

describe('PlansView without a wallet', () => {
  it('asks the person to connect and does not call the keeper', () => {
    const services = fakes();
    const adapter: WalletAdapter = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      signTransaction: vi.fn(),
    };
    render(
      <WalletProvider adapter={adapter} expectedPassphrase={TESTNET}>
        <PlansView {...services} />
      </WalletProvider>,
    );
    expect(screen.getByText(/Connect your wallet/)).toBeTruthy();
    expect(services.keeper.listPlans).not.toHaveBeenCalled();
  });
});

describe('PlansView list', () => {
  it('asks the keeper for the connected merchant and shows readable amounts and periods', async () => {
    const services = fakes();
    await renderConnected(services);
    const row = (await screen.findByRole('rowheader', { name: '#1' })).closest('tr');
    expect(row).not.toBeNull();
    const cells = within(row as HTMLElement);
    expect(await cells.findByText('12.5 XLM')).toBeTruthy();
    expect(cells.getByText('30 days')).toBeTruthy();
    expect(cells.getByText('Active')).toBeTruthy();
    expect(services.keeper.listPlans).toHaveBeenCalledWith(
      { merchant: MERCHANT, limit: 200 },
      expect.anything(),
    );
  });

  it('shows the raw amount when the token cannot be read', async () => {
    const services = fakes({ getTokenInfo: () => Promise.reject(new Error('no')) });
    await renderConnected(services);
    expect(await screen.findByText(/125000000/)).toBeTruthy();
    expect(screen.getByText(/smallest unit of/)).toBeTruthy();
  });

  it('shows an empty state', async () => {
    await renderConnected(fakes({ list: () => Promise.resolve(pageOf([])) }));
    expect(await screen.findByText(/no plans yet/i)).toBeTruthy();
  });

  it('shows an error with a retry that loads again', async () => {
    const list = vi
      .fn<KeeperClient['listPlans']>()
      .mockRejectedValueOnce(new KeeperNetworkError(new Error('down')))
      .mockResolvedValueOnce(pageOf([PLAN]));
    await renderConnected(fakes({ list }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Could not load your plans');
    expect(alert.textContent).toContain('Could not reach the keeper');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('rowheader', { name: '#1' })).toBeTruthy();
  });

  it('shows deactivated plans without a deactivate button', async () => {
    await renderConnected(
      fakes({ list: () => Promise.resolve(pageOf([{ ...PLAN, active: false }])) }),
    );
    expect(await screen.findByText('Deactivated')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Deactivate plan/ })).toBeNull();
  });
});

describe('CreatePlanForm', () => {
  it('creates a plan with the amount converted to the smallest unit', async () => {
    const services = fakes();
    await renderConnected(services);
    fillForm(TOKEN, '12.5', '30');
    await screen.findByText(/Token: XLM, 7 decimal places/);
    fireEvent.click(screen.getByRole('button', { name: 'Create plan' }));
    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('Plan 2 created');
    expect(services.plans.createPlan).toHaveBeenCalledWith({
      merchant: MERCHANT,
      token: TOKEN,
      amount: 125_000_000n,
      periodSecs: 30 * 86_400,
    });
  });

  it('refreshes the list after creating', async () => {
    const services = fakes();
    await renderConnected(services);
    await screen.findByRole('rowheader', { name: '#1' });
    fillForm(TOKEN, '1', '1');
    await screen.findByText(/Token: XLM/);
    fireEvent.click(screen.getByRole('button', { name: 'Create plan' }));
    await screen.findByRole('status');
    await waitFor(() => {
      expect(services.keeper.listPlans).toHaveBeenCalledTimes(2);
    });
  });

  it('uses the unit chosen for the period', async () => {
    const services = fakes();
    await renderConnected(services);
    fillForm(TOKEN, '1', '2');
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'hours' } });
    await screen.findByText(/Token: XLM/);
    fireEvent.click(screen.getByRole('button', { name: 'Create plan' }));
    await screen.findByRole('status');
    expect(services.plans.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({ periodSecs: 7200 }),
    );
  });

  it('shows field errors, focuses the first one and sends nothing', async () => {
    const services = fakes();
    await renderConnected(services);
    fireEvent.click(screen.getByRole('button', { name: 'Create plan' }));
    const token = screen.getByLabelText('Token contract id');
    expect(token.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(token);
    expect(screen.getByText(/Enter the token contract id/)).toBeTruthy();
    expect(services.plans.createPlan).not.toHaveBeenCalled();
  });

  it('refuses an amount with too many decimals and a period out of range', async () => {
    const services = fakes();
    await renderConnected(services);
    fillForm(TOKEN, '1.12345678', '1000');
    await screen.findByText(/Token: XLM/);
    fireEvent.click(screen.getByRole('button', { name: 'Create plan' }));
    expect(screen.getByText(/at most 7 decimal places/)).toBeTruthy();
    expect(screen.getByLabelText(/Amount per period/).getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(screen.getByLabelText(/Amount per period/), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create plan' }));
    expect(screen.getByText(/between 1 minute and 365 days/)).toBeTruthy();
    expect(services.plans.createPlan).not.toHaveBeenCalled();
  });

  it('says so when the token cannot be read', async () => {
    const services = fakes({
      getTokenInfo: () =>
        Promise.reject(new TransactionError('FAILED', 'Could not read this token.')),
    });
    await renderConnected(services);
    fillForm(TOKEN, '1', '1');
    await waitFor(() => {
      expect(screen.getAllByText('Could not read this token.').length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create plan' }));
    expect(services.plans.createPlan).not.toHaveBeenCalled();
  });

  it('shows the reason when the person declines in the wallet, and allows trying again', async () => {
    const createPlan = vi
      .fn<PlanService['createPlan']>()
      .mockRejectedValueOnce(
        new TransactionError(
          'REJECTED',
          'You declined the request in your wallet. Nothing was sent.',
        ),
      )
      .mockResolvedValueOnce({ planId: 5, txHash: 'HASH1234567890' });
    await renderConnected(fakes({ createPlan }));
    fillForm(TOKEN, '1', '1');
    await screen.findByText(/Token: XLM/);
    fireEvent.click(screen.getByRole('button', { name: 'Create plan' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Nothing was sent');
    fireEvent.click(screen.getByRole('button', { name: 'Create plan' }));
    expect((await screen.findByRole('status')).textContent).toContain('Plan 5 created');
  });

  it('shows a contract refusal in plain words', async () => {
    const createPlan = vi.fn<PlanService['createPlan']>().mockRejectedValue(
      new TransactionError('CONTRACT', 'The period must be between 1 minute and 365 days.', {
        contractError: 'InvalidPeriod',
      }),
    );
    await renderConnected(fakes({ createPlan }));
    fillForm(TOKEN, '1', '1');
    await screen.findByText(/Token: XLM/);
    fireEvent.click(screen.getByRole('button', { name: 'Create plan' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'between 1 minute and 365 days',
    );
  });

  it('warns when a transaction is still pending, so it is not sent twice', async () => {
    const createPlan = vi
      .fn<PlanService['createPlan']>()
      .mockRejectedValue(
        new TransactionError('PENDING', 'The transaction was sent but is not confirmed yet.'),
      );
    await renderConnected(fakes({ createPlan }));
    fillForm(TOKEN, '1', '1');
    await screen.findByText(/Token: XLM/);
    fireEvent.click(screen.getByRole('button', { name: 'Create plan' }));
    const alert = await screen.findByRole('alert');
    expect(alert.className).toContain('badge--warn');
  });

  it('cannot be submitted while the wallet is on the wrong network', async () => {
    const services = fakes();
    await renderConnected(services, MAINNET);
    const button = screen.getByRole('button', { name: 'Create plan' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Switch your wallet to the right network/)).toBeTruthy();
  });

  it('labels every control', async () => {
    await renderConnected(fakes());
    for (const label of ['Token contract id', /Amount per period/, 'Charge every', 'Unit']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });
});

describe('deactivating a plan', () => {
  it('asks for confirmation first and does nothing until confirmed', async () => {
    const services = fakes();
    await renderConnected(services);
    fireEvent.click(await screen.findByRole('button', { name: 'Deactivate plan 1' }));
    const group = screen.getByRole('group', { name: 'Confirm deactivating plan 1' });
    expect(group.textContent).toContain('keep being charged');
    expect(document.activeElement).toBe(
      within(group).getByRole('button', { name: 'Yes, deactivate' }),
    );
    expect(services.plans.deactivatePlan).not.toHaveBeenCalled();
  });

  it('can be cancelled', async () => {
    const services = fakes();
    await renderConnected(services);
    fireEvent.click(await screen.findByRole('button', { name: 'Deactivate plan 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep the plan' }));
    expect(screen.queryByRole('group')).toBeNull();
    expect(services.plans.deactivatePlan).not.toHaveBeenCalled();
  });

  it('deactivates after confirmation and refreshes the list', async () => {
    const services = fakes();
    await renderConnected(services);
    fireEvent.click(await screen.findByRole('button', { name: 'Deactivate plan 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, deactivate' }));
    expect((await screen.findByRole('status')).textContent).toContain('Plan 1 deactivated');
    expect(services.plans.deactivatePlan).toHaveBeenCalledWith({ merchant: MERCHANT, planId: 1 });
    await waitFor(() => {
      expect(services.keeper.listPlans).toHaveBeenCalledTimes(2);
    });
  });

  it('shows why it failed and keeps the confirmation open', async () => {
    const deactivatePlan = vi
      .fn<PlanService['deactivatePlan']>()
      .mockRejectedValue(
        new TransactionError(
          'REJECTED',
          'You declined the request in your wallet. Nothing was sent.',
        ),
      );
    await renderConnected(fakes({ deactivatePlan }));
    fireEvent.click(await screen.findByRole('button', { name: 'Deactivate plan 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, deactivate' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Nothing was sent');
    expect(screen.getByRole('group')).toBeTruthy();
  });

  it('is disabled on the wrong network', async () => {
    await renderConnected(fakes(), MAINNET);
    const button = await screen.findByRole('button', { name: 'Deactivate plan 1' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});
