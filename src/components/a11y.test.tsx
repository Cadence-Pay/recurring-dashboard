import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Charge, KeeperClient, Plan, Subscription } from '../lib/keeper-client';
import type { PlanService, TokenService } from '../lib/plan-service';
import type { WalletAdapter, WalletSession } from '../lib/wallet';
import { ChargesView } from './ChargesView';
import { PlansView } from './PlansView';
import { RevenueView } from './RevenueView';
import { SubscribersView } from './SubscribersView';
import { WalletButton } from './WalletButton';
import { WalletProvider } from './WalletProvider';

/*
 * Mechanical accessibility checks that run on every data view in its main states. They do not
 * replace a walkthrough with a screen reader, but they catch the usual mistakes: a control with
 * no name, a table without a caption or header cells, focus taken out of the keyboard order.
 */

const TESTNET = 'Test SDF Network ; September 2015';
const MERCHANT = 'GAIPBT4WCBUALPT77TFYIK4LAHN67QNFM4OOTX3VEH4L6URNOUFJOTSQ';
const TOKEN = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const HASH = '9d5fa7605df7e7be0cad4fb12045cbf46259d536519513a59937aaa1e97f832a';
const NOW = Math.floor(Date.now() / 1000);

const PLAN: Plan = {
  id: 1,
  merchant: MERCHANT,
  token: TOKEN,
  amount: '125000000',
  periodSecs: 60,
  active: true,
};
const SUB: Subscription = {
  id: 1,
  planId: 1,
  subscriber: MERCHANT,
  nextChargeTs: NOW + 60,
  status: 'Active',
  charges: 1,
};
const CHARGE: Charge = {
  id: 1,
  subId: 1,
  planId: 1,
  dueTs: NOW,
  amount: '125000000',
  status: 'succeeded',
  attempts: 0,
  txHash: HASH,
  errorCode: null,
  nextAttemptAt: null,
  createdAt: 1,
  updatedAt: 2,
};

function page<T>(items: T[]) {
  return { items, total: items.length, limit: 25, offset: 0 };
}

const keeper: KeeperClient = {
  getHealth: () => Promise.reject(new Error('unused')),
  getPlan: () => Promise.resolve(PLAN),
  listPlans: () => Promise.resolve(page([PLAN])),
  listSubscriptions: () => Promise.resolve(page([SUB])),
  listCharges: () => Promise.resolve(page([CHARGE])),
  getRevenue: () =>
    Promise.resolve({
      merchant: MERCHANT,
      asOf: NOW,
      lines: [{ token: TOKEN, total: '20000000', payments: 2 }],
    }),
};
const plans: PlanService = {
  createPlan: () => Promise.resolve({ planId: 1, txHash: 'x' }),
  deactivatePlan: () => Promise.resolve({ txHash: 'x' }),
  cancelSubscription: () => Promise.resolve({ txHash: 'x' }),
};
const tokens: TokenService = {
  getTokenInfo: () => Promise.resolve({ symbol: 'XLM', decimals: 7 }),
};

function inProvider(children: React.ReactNode) {
  const adapter: WalletAdapter = {
    connect: vi.fn(() =>
      Promise.resolve<WalletSession>({ address: MERCHANT, networkPassphrase: TESTNET }),
    ),
    disconnect: vi.fn(() => Promise.resolve()),
    signTransaction: vi.fn(() => Promise.resolve('SIGNED')),
  };
  return render(
    <WalletProvider adapter={adapter} expectedPassphrase={TESTNET}>
      <WalletButton networkLabel="testnet" />
      {children}
    </WalletProvider>,
  );
}

async function connect() {
  fireEvent.click(screen.getByRole('button', { name: 'Connect wallet' }));
  await screen.findByRole('button', { name: 'Disconnect' });
}

/** The name a screen reader would announce for a control, in the simple cases used here. */
function accessibleName(element: Element, root: ParentNode): string {
  const label = element.getAttribute('aria-label');
  if (label !== null && label.trim() !== '') return label.trim();
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy !== null) {
    return labelledBy
      .split(/\s+/)
      .map((id) => root.querySelector(`#${CSS.escape(id)}`)?.textContent ?? '')
      .join(' ')
      .trim();
  }
  const id = element.getAttribute('id');
  if (id !== null) {
    const forLabel = root.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (forLabel !== null) return forLabel.textContent.trim();
  }
  return element.textContent.trim();
}

function auditPage(container: HTMLElement) {
  const root = document;
  // 1. Every control has a name.
  const controls = container.querySelectorAll('button, a[href], input, select, textarea');
  expect(controls.length).toBeGreaterThan(0);
  for (const control of controls) {
    expect(accessibleName(control, root), control.outerHTML.slice(0, 80)).not.toBe('');
  }
  // 2. Nothing is pulled into or out of the keyboard order.
  for (const element of container.querySelectorAll('[tabindex]')) {
    expect(
      Number(element.getAttribute('tabindex')),
      element.outerHTML.slice(0, 80),
    ).toBeLessThanOrEqual(0);
  }
  // 3. Every table has a caption and header cells with a scope.
  for (const table of container.querySelectorAll('table')) {
    expect(table.querySelector('caption')?.textContent.trim() ?? '', 'table caption').not.toBe('');
    const headers = table.querySelectorAll('th');
    expect(headers.length).toBeGreaterThan(0);
    for (const th of headers)
      expect(th.getAttribute('scope'), th.outerHTML.slice(0, 60)).toMatch(/^(col|row)$/);
  }
  // 4. Interactive things are real buttons and links, not clickable divs.
  for (const element of container.querySelectorAll('[onclick], [role="button"]')) {
    expect(['BUTTON', 'A']).toContain(element.tagName);
  }
  // 5. Inputs are labelled by a visible or hidden label, not only a placeholder.
  for (const input of container.querySelectorAll('input, select')) {
    const id = input.getAttribute('id');
    expect(id, input.outerHTML.slice(0, 80)).not.toBeNull();
    expect(container.querySelector(`label[for="${CSS.escape(id ?? '')}"]`)).not.toBeNull();
  }
  // 6. Live regions that announce errors use alert, and loading uses status.
  for (const alert of container.querySelectorAll('[role="alert"]')) {
    expect(alert.textContent.trim()).not.toBe('');
  }
  // 7. No colour is written inline: colours come from the stylesheet's tokens only.
  for (const styled of container.querySelectorAll('[style]')) {
    expect(styled.getAttribute('style') ?? '').not.toMatch(/#[0-9a-f]{3,8}|rgb|hsl/i);
  }
}

describe('the audit itself', () => {
  it('fails on a button without a name', () => {
    const { container } = render(<button type="button" />);
    expect(() => {
      auditPage(container);
    }).toThrow();
  });

  it('fails on a table without a caption', () => {
    const { container } = render(
      <>
        <a href="/x">x</a>
        <table>
          <tbody>
            <tr>
              <th scope="row">a</th>
              <td>b</td>
            </tr>
          </tbody>
        </table>
      </>,
    );
    expect(() => {
      auditPage(container);
    }).toThrow();
  });

  it('fails on an input that only has a placeholder', () => {
    const { container } = render(<input id="a" placeholder="Name" aria-label="Name" />);
    expect(() => {
      auditPage(container);
    }).toThrow();
  });

  it('fails on a positive tabindex and on an inline colour', () => {
    const tab = render(
      <a href="/x" tabIndex={3}>
        x
      </a>,
    );
    expect(() => {
      auditPage(tab.container);
    }).toThrow();
    tab.unmount();
    const colour = render(
      <a href="/x" style={{ color: '#ff0000' }}>
        x
      </a>,
    );
    expect(() => {
      auditPage(colour.container);
    }).toThrow();
  });
});

describe('accessibility checks', () => {
  it('plans page', async () => {
    const { container } = inProvider(<PlansView keeper={keeper} plans={plans} tokens={tokens} />);
    await connect();
    await screen.findByRole('rowheader', { name: '#1' });
    auditPage(container);
  });

  it('plans page with the deactivate confirmation open', async () => {
    const { container } = inProvider(<PlansView keeper={keeper} plans={plans} tokens={tokens} />);
    await connect();
    fireEvent.click(await screen.findByRole('button', { name: 'Deactivate plan 1' }));
    expect(screen.getByRole('group', { name: /Confirm deactivating plan 1/ })).toBeTruthy();
    auditPage(container);
  });

  it('plans page when not connected', () => {
    const { container } = inProvider(<PlansView keeper={keeper} plans={plans} tokens={tokens} />);
    auditPage(container);
  });

  it('plan page with subscribers', async () => {
    const { container } = inProvider(
      <SubscribersView planId={1} keeper={keeper} plans={plans} tokens={tokens} />,
    );
    await connect();
    await screen.findByRole('rowheader', { name: '#1' });
    auditPage(container);
  });

  it('charges page', async () => {
    const { container } = inProvider(
      <ChargesView subId={1} keeper={keeper} tokens={tokens} network="testnet" />,
    );
    await screen.findByText('Charged');
    auditPage(container);
  });

  it('revenue page', async () => {
    const { container } = inProvider(<RevenueView keeper={keeper} tokens={tokens} />);
    await connect();
    await screen.findByText('2 XLM');
    auditPage(container);
  });

  it('error and empty states are announced', async () => {
    const failing: KeeperClient = {
      ...keeper,
      listCharges: () => Promise.reject(new Error('down')),
    };
    inProvider(<ChargesView subId={1} keeper={failing} tokens={tokens} network="testnet" />);
    expect((await screen.findByRole('alert')).textContent).toContain('down');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('loading is announced politely', () => {
    const slow: KeeperClient = { ...keeper, listCharges: () => new Promise(() => undefined) };
    inProvider(<ChargesView subId={1} keeper={slow} tokens={tokens} network="testnet" />);
    expect(screen.getByRole('status').textContent).toContain('Loading');
  });
});
