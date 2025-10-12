// supabase/functions/votes-backfill/openstates.ts
// Lightweight client for the OpenStates GraphQL API.

const OS_URL = "https://openstates.org/graphql";

type Organization = {
  classification: string | null;
  name: string | null;
};

type Voter = {
  id: string | null;
  name: string | null;
};

export type OpenStatesVote = {
  option: string | null;
  voter: Voter | null;
};

export type OpenStatesVoteEvent = {
  id: string;
  motion: string | null;
  result: string | null;
  startDate: string | null;
  updatedAt?: string | null;
  organization: Organization | null;
  votes: OpenStatesVote[] | null;
  bill?: {
    id: string;
    identifier?: string | null;
  } | null;
};

type GraphQlOptions = {
  query: string;
  variables?: Record<string, unknown>;
  apiKey: string;
};

async function performQuery<T>({ query, variables, apiKey }: GraphQlOptions): Promise<T> {
  const res = await fetch(OS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`OpenStates request failed (${res.status})`);
  }

  const payload = await res.json();
  if (payload.errors?.length) {
    const message = payload.errors.map((err: any) => err?.message ?? "Unknown error").join("; ");
    throw new Error(`OpenStates error: ${message}`);
  }

  return payload.data as T;
}

export async function fetchBillVoteEvents(
  apiKey: string,
  billExternalId: string,
): Promise<OpenStatesVoteEvent[]> {
  const query = `
    query BillVoteEvents($id: ID!) {
      bill(id: $id) {
        id
        votes {
          id
          motion
          result
          startDate
          updatedAt
          organization { classification name }
          votes {
            option
            voter { id name }
          }
        }
      }
    }
  `;

  const data = await performQuery<{
    bill: { votes: OpenStatesVoteEvent[] | null } | null;
  }>({ query, variables: { id: billExternalId }, apiKey });

  return data.bill?.votes?.filter((vote) => vote?.id) ?? [];
}

export async function fetchRecentVoteEvents(
  apiKey: string,
  sinceIso: string,
  pageSize = 200,
): Promise<OpenStatesVoteEvent[]> {
  const query = `
    query RecentVoteEvents($since: DateTime!, $first: Int!, $after: String) {
      voteEvents(updatedSince: $since, first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            motion
            result
            startDate
            updatedAt
            organization { classification name }
            bill { id identifier }
            votes { option voter { id name } }
          }
        }
      }
    }
  `;

  const collected: OpenStatesVoteEvent[] = [];
  let after: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const data = await performQuery<{
      voteEvents: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        edges: Array<{ node: OpenStatesVoteEvent | null }>;
      };
    }>({
      query,
      variables: { since: sinceIso, first: pageSize, after },
      apiKey,
    });

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
