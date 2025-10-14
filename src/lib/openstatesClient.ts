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
    const message = `OpenStates request failed (${res.status})`;
    console.error(
      JSON.stringify({
        level: "error",
        context: "openstatesClient",
        msg: "Non-200 response",
        status: res.status,
        statusText: res.statusText,
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
  query BillVotes($id: String!, $after: String, $since: DateTime) {
    bill(id: $id) {
      id
      identifier
      title
      votes(first: 100, after: $after, updatedSince: $since) {
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

const BILL_VOTES_QUERY_LEGACY = `
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

let supportsUpdatedSince: boolean | null = null;

const RECENT_VOTE_EVENTS_QUERY = `
  query RecentVoteEvents($since: DateTime!, $first: Int!, $after: String) {
    voteEvents(updatedSince: $since, first: $first, after: $after) {
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
  // Decide which query variant to use (and detect support on the fly).
  const sinceValue = (variables as { since?: unknown }).since;
  const hasSince = sinceValue !== undefined && sinceValue !== null;
  const shouldUseLegacy = supportsUpdatedSince === false || !hasSince;
  const runQuery = (query: string) =>
    withRetry(() => performQuery<BillVotesQueryResult>(query, variables, apiKey));

  if (shouldUseLegacy) {
    return runQuery(BILL_VOTES_QUERY_LEGACY);
  }

  try {
    const data = await runQuery(BILL_VOTES_QUERY);
    supportsUpdatedSince = true;
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (supportsUpdatedSince !== false && /Unknown argument "updatedSince"/.test(message)) {
      console.warn(
        JSON.stringify({
          level: "warn",
          context: "openstatesClient",
          msg: "OpenStates schema missing updatedSince argument; falling back",
        }),
      );
      supportsUpdatedSince = false;
      const legacyVariables = { ...variables };
      delete (legacyVariables as { since?: unknown }).since;
      return runQuery(BILL_VOTES_QUERY_LEGACY);
    }
    throw error;
  }
}

export async function fetchRecentVoteEvents(
  apiKey: string,
  sinceIso: string,
  pageSize = 200,
): Promise<OpenStatesVoteEvent[]> {
  const collected: OpenStatesVoteEvent[] = [];
  let after: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const data = await withRetry(() =>
      performQuery<{
        voteEvents: {
          pageInfo: PageInfo;
          edges: Array<{ node: OpenStatesVoteEvent | null }>;
        };
      }>(RECENT_VOTE_EVENTS_QUERY, { since: sinceIso, first: pageSize, after }, apiKey)
    );

    const edges = data.voteEvents?.edges ?? [];
    for (const edge of edges) {
      if (edge?.node?.id) {
        collected.push(edge.node);
      }
    }

    hasNextPage = Boolean(data.voteEvents?.pageInfo?.hasNextPage);
    after = data.voteEvents?.pageInfo?.endCursor ?? null;
    if (!hasNextPage) break;
  }

  return collected;
}
