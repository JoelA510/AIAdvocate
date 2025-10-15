export function ensureEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`${name} must be set`);
  return v;
}

export function isPlaceholder(s: string | null | undefined): boolean {
  return !!s && /^Placeholder for\s/i.test(s);
}

export async function invokeFunction(opts: {
  url: string; token: string; body: unknown;
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
  let i = 0;
  const L = Math.max(1, limit);
  const workers = Array.from({ length: L }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx]);
    }
  });
  await Promise.all(workers);
}
