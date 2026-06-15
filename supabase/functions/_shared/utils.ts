export function ensureEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

export function isPlaceholder(s: string | null | undefined): boolean {
  return !!s && /^Placeholder for\s/i.test(s);
}

/**
 * Read the OpenAI API key, tolerating both naming conventions used across the
 * project (`OpenAI_GPT_Key` in the docs/env.example, `OPENAI_API_KEY` in some
 * functions). Prefers `OpenAI_GPT_Key` to match `sync-updated-bills`.
 */
export function getOpenAiKey(): string {
  const value = Deno.env.get("OpenAI_GPT_Key") ?? Deno.env.get("OPENAI_API_KEY");
  if (!value) {
    throw new Error("OpenAI_GPT_Key (or OPENAI_API_KEY) must be set.");
  }
  return value;
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
  let index = 0;
  const normalizedLimit =
    Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 1;
  const workerCount =
    items.length === 0 ? 0 : Math.min(items.length, Math.max(1, normalizedLimit));

  const workers = Array.from({ length: workerCount }, async () => {
    while (index < items.length) {
      const current = index++;
      await worker(items[current]);
    }
  });
  await Promise.all(workers);
}
