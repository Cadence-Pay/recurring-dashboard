import { z } from 'zod';

/** Base class of every error the keeper client throws. */
export class KeeperClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

/** The keeper answered with an error status. `code` is the keeper's error code. */
export class KeeperApiError extends KeeperClientError {
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(code, message);
    this.status = status;
  }
}

/** The keeper could not be reached, or the request was cut off. */
export class KeeperNetworkError extends KeeperClientError {
  constructor(cause: unknown) {
    super('NETWORK', 'Could not reach the keeper. Check that it is running and the URL is right.', {
      cause,
    });
  }
}

/** The keeper answered, but not in the documented shape. */
export class KeeperResponseError extends KeeperClientError {
  constructor(message: string, cause?: unknown) {
    super('BAD_RESPONSE', message, { cause });
  }
}

const amount = z.string().regex(/^\d+$/);

const planSchema = z.object({
  id: z.number().int(),
  merchant: z.string(),
  token: z.string(),
  amount,
  periodSecs: z.number().int(),
  active: z.boolean(),
});

const subscriptionSchema = z.object({
  id: z.number().int(),
  planId: z.number().int(),
  subscriber: z.string(),
  nextChargeTs: z.number().int(),
  status: z.enum(['Active', 'Cancelled']),
  charges: z.number().int(),
});

const chargeSchema = z.object({
  id: z.number().int(),
  subId: z.number().int(),
  planId: z.number().int(),
  dueTs: z.number().int(),
  amount,
  status: z.enum(['pending', 'succeeded', 'failed', 'superseded']),
  attempts: z.number().int(),
  txHash: z.string().nullable(),
  errorCode: z.string().nullable(),
  nextAttemptAt: z.number().int().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

const revenueSchema = z.object({
  merchant: z.string(),
  asOf: z.number().int().nullable(),
  lines: z.array(z.object({ token: z.string(), total: amount, payments: z.number().int() })),
});

const healthSchema = z.object({
  status: z.literal('ok'),
  network: z.string(),
  contractId: z.string(),
  readOnly: z.boolean(),
  lastSyncAt: z.number().int().nullable(),
});

const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
  });
}

export type Plan = z.infer<typeof planSchema>;
export type Subscription = z.infer<typeof subscriptionSchema>;
export type Charge = z.infer<typeof chargeSchema>;
export type Revenue = z.infer<typeof revenueSchema>;
export type Health = z.infer<typeof healthSchema>;
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** Paging options. The keeper allows `limit` from 1 to 200. */
export interface PageOptions {
  limit?: number;
  offset?: number;
}

/** Calls to the keeper's read API. Each takes an optional abort signal. */
export interface KeeperClient {
  getHealth(signal?: AbortSignal): Promise<Health>;
  listPlans(
    options?: PageOptions & { merchant?: string },
    signal?: AbortSignal,
  ): Promise<Page<Plan>>;
  /** One plan. Throws KeeperApiError with status 404 if there is none. */
  getPlan(planId: number, signal?: AbortSignal): Promise<Plan>;
  listSubscriptions(
    planId: number,
    options?: PageOptions,
    signal?: AbortSignal,
  ): Promise<Page<Subscription>>;
  listCharges(subId: number, options?: PageOptions, signal?: AbortSignal): Promise<Page<Charge>>;
  getRevenue(merchant: string, signal?: AbortSignal): Promise<Revenue>;
}

/**
 * Create a client for the keeper's read API (see the keeper's `openapi.yaml`).
 *
 * Every response is checked against a schema. A reply that does not match throws
 * KeeperResponseError instead of letting wrong data reach the screen.
 *
 * @param baseUrl - Address of the keeper, for example `http://127.0.0.1:8080`.
 * @param fetchImpl - HTTP client. Defaults to the global `fetch`.
 * @returns The client.
 */
export function createKeeperClient(
  baseUrl: string,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): KeeperClient {
  const root = baseUrl.replace(/\/+$/, '');

  async function get<S extends z.ZodType>(
    path: string,
    schema: S,
    query: Record<string, string | number | undefined>,
    signal: AbortSignal | undefined,
  ): Promise<z.infer<S>> {
    const url = new URL(root + path);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    let response: Response;
    try {
      response = await fetchImpl(url, { headers: { accept: 'application/json' }, signal });
    } catch (error) {
      throw new KeeperNetworkError(error);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      throw new KeeperResponseError(
        `The keeper answered HTTP ${String(response.status)} with something that is not JSON`,
        error,
      );
    }
    if (!response.ok) {
      const parsed = errorSchema.safeParse(body);
      if (parsed.success) {
        throw new KeeperApiError(
          response.status,
          parsed.data.error.code,
          parsed.data.error.message,
        );
      }
      throw new KeeperResponseError(`The keeper answered HTTP ${String(response.status)}`);
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new KeeperResponseError('The keeper answered in an unexpected format', parsed.error);
    }
    return parsed.data;
  }

  const paging = (options: PageOptions | undefined) => ({
    limit: options?.limit,
    offset: options?.offset,
  });

  return {
    getHealth: (signal) => get('/health', healthSchema, {}, signal),
    listPlans: (options, signal) =>
      get(
        '/plans',
        pageSchema(planSchema),
        { merchant: options?.merchant, ...paging(options) },
        signal,
      ),
    getPlan: (planId, signal) =>
      get(`/plans/${encodeURIComponent(String(planId))}`, planSchema, {}, signal),
    listSubscriptions: (planId, options, signal) =>
      get(
        `/plans/${encodeURIComponent(String(planId))}/subscriptions`,
        pageSchema(subscriptionSchema),
        paging(options),
        signal,
      ),
    listCharges: (subId, options, signal) =>
      get(
        `/subscriptions/${encodeURIComponent(String(subId))}/charges`,
        pageSchema(chargeSchema),
        paging(options),
        signal,
      ),
    getRevenue: (merchant, signal) =>
      get(`/merchants/${encodeURIComponent(merchant)}/revenue`, revenueSchema, {}, signal),
  };
}
