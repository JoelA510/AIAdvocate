export function ensureEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

export function isPlaceholder(s: string | null | undefined): boolean {
  return !!s && /^Placeholder for\s/i.test(s);
}

export async function invokeFunction(opts: {
  url: string;
  token: string;
  body: unknown;
}): Promise<Response> {
  const { url, token, body } = opts;
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

export async function runConcurrent<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
) {
  let index = 0;
  const normalizedLimit = Number.isFinite(limit) && limit > 0
    ? Math.floor(limit)
    : 1;
  const workerCount = items.length === 0
    ? 0
    : Math.min(items.length, Math.max(1, normalizedLimit));

  const workers = Array.from({ length: workerCount }, async () => {
    while (index < items.length) {
      const current = index++;
      await worker(items[current]);
    }
  });
  await Promise.all(workers);
}
