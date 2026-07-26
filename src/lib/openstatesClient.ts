// src/lib/openstatesClient.ts
// Shared OpenStates GraphQL client with simple LRU caching and retry handling.
// Designed for usage inside Supabase Edge Functions (Deno runtime).

type GraphQLVariables = Record<string, unknown>;

type PageInfo = {
  hasNextPage: boolean;
  endCursor: string | null;
};

type Organization = {
  classification: string | null;
  name: string | null;
};

type Voter = {
  id: string | null;
  name: string | null;
};

type BillRef = {
  id: string;
  identifier?: string | null;
};

export type OpenStatesVote = {
  option: string | null;
  voter: Voter | null;
};

export type OpenStatesVoteEvent = {
  id: string;
  motionText: string | null;
  result: string | null;
  startDate: string | null;
  updatedAt: string | null;
  organization: Organization | null;
  votes: OpenStatesVote[] | null;
  bill?: BillRef | null;
};

export type OpenStatesBillVotes = {
  billId: string;
  billIdentifier: string | null;
  billTitle: string | null;
  events: OpenStatesVoteEvent[];
};

type BillVotesQueryResult = {
  bill: {
    id: string;
    identifier: string | null;
    title: string | null;
    votes: {
      pageInfo: PageInfo;
      edges: Array<{ node: OpenStatesVoteEvent | null }>;
    } | null;
  } | null;
};

const GRAPHQL_ENDPOINT = "https://openstates.org/graphql";
const MAX_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 600;

class RetryableError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "RetryableError";
  }
}

type LruEntry<V> = {
  value: V;
  expiresAt: number;
};

class SimpleLru<K, V> {
  #limit: number;
  #ttlMs: number;
  #store = new Map<K, LruEntry<V>>();

  constructor(limit = 32, ttlMs = 5 * 60 * 1000) {
    this.#limit = limit;
    this.#ttlMs = ttlMs;
  }

  get(key: K): V | undefined {
    const entry = this.#store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.#store.delete(key);
      return undefined;
    }
    // refresh LRU order
    this.#store.delete(key);
    this.#store.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V) {
    if (this.#store.has(key)) {
      this.#store.delete(key);
    } else if (this.#store.size >= this.#limit) {
      const firstKey = this.#store.keys().next().value;
      if (firstKey !== undefined) this.#store.delete(firstKey);
    }
    this.#store.set(key, { value, expiresAt: Date.now() + this.#ttlMs });
  }
}

const billCache = new SimpleLru<string, OpenStatesBillVotes>();

async function performQuery<T>(
  query: string,
  variables: GraphQLVariables,
  apiKey: string,
): Promise<T> {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({ query, variables }),
  }).catch((error) => {
    console.error(
      JSON.stringify({
        level: "error",
        context: "openstatesClient",
        msg: "Fetch failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    throw new RetryableError("Network error contacting OpenStates");
  });

  if (!res.ok) {
    // Always surface the response body. OpenStates answers a query written
    // against a stale schema with a 400 whose body names the offending field —
    // and a bare "request failed (400)" hid exactly that for months (the
    // nightly job queried a root `voteEvents` field that does not exist).
    const body = await res.text().catch(() => "");
    const detail = body.slice(0, 500).replace(/\s+/g, " ").trim();
    const message = detail
      ? `OpenStates request failed (${res.status}): ${detail}`
      : `OpenStates request failed (${res.status})`;
    console.error(
      JSON.stringify({
        level: "error",
        context: "openstatesClient",
        msg: "Non-200 response",
        status: res.status,
        statusText: res.statusText,
        body: detail,
      }),
    );
    if (res.status >= 500 || res.status === 429) {
      throw new RetryableError(message, res.status);
    }
    throw new Error(message);
  }

  const payload = await res.json();
  if (payload.errors?.length) {
    const message = payload.errors.map((err: any) => err?.message ?? "Unknown error").join("; ");
    const isRetryable = payload.errors.some((err: any) =>
      typeof err?.message === "string" && /rate limit|timeout/i.test(err.message)
    );
    console.error(
      JSON.stringify({
        level: "error",
        context: "openstatesClient",
        msg: "GraphQL errors",
        errors: payload.errors,
      }),
    );
    if (isRetryable) {
      throw new RetryableError(message);
    }
    throw new Error(`OpenStates error: ${message}`);
  }

  return payload.data as T;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < MAX_ATTEMPTS) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isRetryable = error instanceof RetryableError;
      if (!isRetryable || attempt >= MAX_ATTEMPTS - 1) break;
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(
        JSON.stringify({
          level: "warn",
          context: "openstatesClient",
          msg: "Retrying request",
          attempt: attempt + 1,
          delayMs: delay,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      await sleep(delay);
      attempt += 1;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function buildCacheKey(billId: string, since?: string | null) {
  return `${billId}::${since ?? "all"}`;
}

const BILL_VOTES_QUERY = `
  query BillVotes($id: String!, $after: String) {
    bill(id: $id) {
      id
      identifier
      title
      votes(first: 100, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            motionText
            result
            startDate
            updatedAt
            organization {
              classification
              name
            }
            bill {
              id
              identifier
            }
            votes {
              option
              voter {
                id
                name
              }
            }
          }
        }
      }
    }
  }
`;

// OpenStates exposes no root `voteEvents` field and no `DateTime` scalar — the
// only root entry points are jurisdictions/jurisdiction/people/person/
// organization/bill/bills, and `updatedSince` is a plain `String`. Recently
// changed bills are therefore discovered through `bills`, and their vote
// events are read per bill via BILL_VOTES_QUERY.
const RECENT_BILLS_QUERY = `
  query RecentBills($jurisdiction: String!, $since: String!, $first: Int!, $after: String) {
    bills(jurisdiction: $jurisdiction, updatedSince: $since, first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          identifier
          updatedAt
        }
      }
    }
  }
`;

export async function fetchBillVotes(
  apiKey: string,
  billId: string,
  sinceIso?: string | null,
): Promise<OpenStatesBillVotes> {
  const cacheKey = buildCacheKey(billId, sinceIso);
  const cached = billCache.get(cacheKey);
  if (cached) return cached;

  const events: OpenStatesVoteEvent[] = [];
  let after: string | null = null;
  let hasNextPage = true;
  let lastBillMeta: { identifier: string | null; title: string | null } | null = null;

  while (hasNextPage) {
    const variables: GraphQLVariables = { id: billId, after };
    if (sinceIso) variables.since = sinceIso;

    const data = await queryBillVotes(variables, apiKey);

    const bill = data.bill;
    if (!bill) {
      throw new Error(`OpenStates returned no bill for id ${billId}`);
    }

    lastBillMeta = { identifier: bill.identifier ?? null, title: bill.title ?? null };

    const edges = bill.votes?.edges ?? [];
    for (const edge of edges) {
      const node = edge?.node;
      if (node?.id) {
        if (sinceIso && node.updatedAt && new Date(node.updatedAt) < new Date(sinceIso)) {
          continue;
        }
        events.push(node);
      }
    }

    hasNextPage = Boolean(bill.votes?.pageInfo?.hasNextPage);
    after = bill.votes?.pageInfo?.endCursor ?? null;
    if (!hasNextPage) break;
  }

  const result: OpenStatesBillVotes = {
    billId,
    billIdentifier: lastBillMeta?.identifier ?? null,
    billTitle: lastBillMeta?.title ?? null,
    events,
  };

  billCache.set(cacheKey, result);
  return result;
}

type FetchBatchOptions = {
  batchSize?: number;
  sinceIso?: string | null;
};

export async function fetchVotesForBills(
  apiKey: string,
  billIds: string[],
  options: FetchBatchOptions = {},
): Promise<Map<string, OpenStatesBillVotes>> {
  const { batchSize = 5, sinceIso = null } = options;
  const results = new Map<string, OpenStatesBillVotes>();

  for (let i = 0; i < billIds.length; i += batchSize) {
    const batch = billIds.slice(i, i + batchSize);
    const promises = batch.map(async (billId) => {
      const data = await fetchBillVotes(apiKey, billId, sinceIso);
      results.set(billId, data);
    });
    await Promise.all(promises);
  }

  return results;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function queryBillVotes(
  variables: GraphQLVariables,
  apiKey: string,
): Promise<BillVotesQueryResult> {
  // `bill.votes` takes no updatedSince argument, so the whole vote connection
  // is fetched and `since` is applied client-side in fetchBillVotes.
  const billVariables = { ...variables };
  delete (billVariables as { since?: unknown }).since;
  return withRetry(() =>
    performQuery<BillVotesQueryResult>(BILL_VOTES_QUERY, billVariables, apiKey)
  );
}

export type OpenStatesBillRef = {
  id: string;
  identifier: string | null;
  updatedAt: string | null;
};

/**
 * List bills in a jurisdiction touched since `sinceIso`.
 *
 * This replaces a root `voteEvents(updatedSince:)` query that OpenStates does
 * not implement — it returned HTTP 400 on every nightly run. Callers pair the
 * returned ids with `fetchVotesForBills` to read the vote payloads.
 */
export async function fetchRecentlyUpdatedBills(
  apiKey: string,
  sinceIso: string,
  jurisdiction = "California",
  pageSize = 100,
  maxPages = 20,
): Promise<OpenStatesBillRef[]> {
  const collected: OpenStatesBillRef[] = [];
  let after: string | null = null;
  let hasNextPage = true;
  let page = 0;

  while (hasNextPage && page < maxPages) {
    const data: {
      bills: {
        pageInfo: PageInfo;
        edges: Array<{ node: OpenStatesBillRef | null }>;
      } | null;
    } = await withRetry(() =>
      performQuery(
        RECENT_BILLS_QUERY,
        { jurisdiction, since: sinceIso, first: pageSize, after },
        apiKey,
      )
    );

    for (const edge of data.bills?.edges ?? []) {
      const node = edge?.node;
      if (node?.id) {
        collected.push({
          id: node.id,
          identifier: node.identifier ?? null,
          updatedAt: node.updatedAt ?? null,
        });
      }
    }

    hasNextPage = Boolean(data.bills?.pageInfo?.hasNextPage);
    after = data.bills?.pageInfo?.endCursor ?? null;
    page += 1;
    if (!hasNextPage || !after) break;
  }

  return collected;
}
