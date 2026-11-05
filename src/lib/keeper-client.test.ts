import { describe, expect, it, vi } from 'vitest';
import {
  KeeperApiError,
  KeeperNetworkError,
  KeeperResponseError,
  createKeeperClient,
} from './keeper-client';

const PLAN = {
  id: 1,
  merchant: 'GAIPBT4WCBUALPT77TFYIK4LAHN67QNFM4OOTX3VEH4L6URNOUFJOTSQ',
  token: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  amount: '10000000',
  periodSecs: 60,
  active: true,
};

/** A fake fetch that always answers with the given status and JSON, and records the requests. */
function fakeFetch(status: number, body: unknown) {
  const calls: { url: URL; init: RequestInit | undefined }[] = [];
  const impl = ((input: URL | string, init?: RequestInit) => {
    calls.push({ url: new URL(String(input)), init });
    return Promise.resolve(
      typeof body === 'string'
        ? new Response(body, { status })
        : new Response(JSON.stringify(body), { status }),
    );
  }) as typeof fetch;
  return { impl, calls };
}

describe('createKeeperClient', () => {
  it('reads the health of the keeper', async () => {
    const { impl, calls } = fakeFetch(200, {
      status: 'ok',
      network: 'testnet',
      contractId: 'C1',
      readOnly: true,
      lastSyncAt: 5,
    });
    const health = await createKeeperClient('http://keeper.test:8080/', impl).getHealth();
    expect(health).toEqual({
      status: 'ok',
      network: 'testnet',
      contractId: 'C1',
      readOnly: true,
      lastSyncAt: 5,
    });
    expect(calls[0]?.url.href).toBe('http://keeper.test:8080/health');
    expect((calls[0]?.init?.headers as Record<string, string>)['accept']).toBe('application/json');
  });

  it('lists plans with the merchant filter and paging in the query', async () => {
    const { impl, calls } = fakeFetch(200, { items: [PLAN], total: 1, limit: 10, offset: 20 });
    const page = await createKeeperClient('http://k.test', impl).listPlans({
      merchant: PLAN.merchant,
      limit: 10,
      offset: 20,
    });
    expect(page.items).toEqual([PLAN]);
    expect(calls[0]?.url.pathname).toBe('/plans');
    expect(calls[0]?.url.searchParams.get('merchant')).toBe(PLAN.merchant);
    expect(calls[0]?.url.searchParams.get('limit')).toBe('10');
    expect(calls[0]?.url.searchParams.get('offset')).toBe('20');
  });

  it('leaves out query parameters that were not given', async () => {
    const { impl, calls } = fakeFetch(200, { items: [], total: 0, limit: 50, offset: 0 });
    await createKeeperClient('http://k.test', impl).listPlans();
    expect(calls[0]?.url.search).toBe('');
  });

  it('reads one plan and reports an unknown one as a 404 error', async () => {
    const found = fakeFetch(200, PLAN);
    const plan = await createKeeperClient('http://k.test', found.impl).getPlan(1);
    expect(plan).toEqual(PLAN);
    expect(found.calls[0]?.url.pathname).toBe('/plans/1');

    const missing = fakeFetch(404, { error: { code: 'NOT_FOUND', message: 'Plan 9 not found' } });
    const failure = await createKeeperClient('http://k.test', missing.impl)
      .getPlan(9)
      .catch((e: unknown) => e);
    expect(failure).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('lists subscriptions and charges of the right resource', async () => {
    const subs = fakeFetch(200, {
      items: [
        {
          id: 3,
          planId: 1,
          subscriber: 'GX',
          nextChargeTs: 100,
          status: 'Active',
          charges: 2,
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });
    const sub = await createKeeperClient('http://k.test', subs.impl).listSubscriptions(1);
    expect(sub.items[0]?.status).toBe('Active');
    expect(subs.calls[0]?.url.pathname).toBe('/plans/1/subscriptions');

    const charges = fakeFetch(200, {
      items: [
        {
          id: 1,
          subId: 3,
          planId: 1,
          dueTs: 100,
          amount: '5',
          status: 'succeeded',
          attempts: 0,
          txHash: 'abc',
          errorCode: null,
          nextAttemptAt: null,
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });
    const page = await createKeeperClient('http://k.test', charges.impl).listCharges(3, {
      limit: 5,
    });
    expect(page.items[0]?.txHash).toBe('abc');
    expect(charges.calls[0]?.url.pathname).toBe('/subscriptions/3/charges');
    expect(charges.calls[0]?.url.searchParams.get('limit')).toBe('5');
  });

  it('reads revenue and encodes the merchant in the path', async () => {
    const { impl, calls } = fakeFetch(200, {
      merchant: 'G/odd',
      asOf: null,
      lines: [{ token: 'C1', total: '123456789012345678901234567890', payments: 3 }],
    });
    const revenue = await createKeeperClient('http://k.test', impl).getRevenue('G/odd');
    expect(revenue.lines[0]?.total).toBe('123456789012345678901234567890');
    expect(calls[0]?.url.pathname).toBe('/merchants/G%2Fodd/revenue');
  });

  it('passes the abort signal to fetch', async () => {
    const { impl, calls } = fakeFetch(200, { items: [], total: 0, limit: 50, offset: 0 });
    const controller = new AbortController();
    await createKeeperClient('http://k.test', impl).listPlans({}, controller.signal);
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it('turns an error answer into KeeperApiError with the keeper code', async () => {
    const { impl } = fakeFetch(404, { error: { code: 'NOT_FOUND', message: 'Plan 9 not found' } });
    const failure = await createKeeperClient('http://k.test', impl)
      .listSubscriptions(9)
      .catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(KeeperApiError);
    expect(failure).toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'Plan 9 not found' });
  });

  it('reports an error status without the documented body as a response error', async () => {
    const { impl } = fakeFetch(502, { oops: true });
    const failure = await createKeeperClient('http://k.test', impl)
      .getHealth()
      .catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(KeeperResponseError);
    expect((failure as Error).message).toContain('502');
  });

  it('rejects an answer that is not JSON', async () => {
    const { impl } = fakeFetch(200, '<html>proxy error</html>');
    const failure = await createKeeperClient('http://k.test', impl)
      .getHealth()
      .catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(KeeperResponseError);
  });

  it('rejects an answer in the wrong shape instead of passing wrong data on', async () => {
    const wrongAmount = fakeFetch(200, {
      items: [{ ...PLAN, amount: 'ten' }],
      total: 1,
      limit: 50,
      offset: 0,
    });
    await expect(
      createKeeperClient('http://k.test', wrongAmount.impl).listPlans(),
    ).rejects.toBeInstanceOf(KeeperResponseError);

    const missingField = fakeFetch(200, { status: 'ok', network: 'testnet' });
    await expect(
      createKeeperClient('http://k.test', missingField.impl).getHealth(),
    ).rejects.toBeInstanceOf(KeeperResponseError);
  });

  it('reports an unreachable keeper as KeeperNetworkError', async () => {
    const impl = vi.fn(() =>
      Promise.reject(new TypeError('fetch failed')),
    ) as unknown as typeof fetch;
    const failure = await createKeeperClient('http://k.test', impl)
      .getHealth()
      .catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(KeeperNetworkError);
    expect((failure as Error).message).toContain('Could not reach the keeper');
  });
});
