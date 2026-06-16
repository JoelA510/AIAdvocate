export function ensureEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

export function isPlaceholder(s: string | null | undefined): boolean {
  return !!s && /^Placeholder for\s/i.test(s);
}

/**
 * Resolve the OpenAI API key, tolerating both naming conventions used across
 * the project (`OpenAI_GPT_Key` in the docs/env.example, `OPENAI_API_KEY` in
 * some functions) and treating an empty/whitespace value as unset so a blank
 * `OpenAI_GPT_Key` falls back to `OPENAI_API_KEY`. Returns undefined when no
 * usable key is configured.
 */
function resolveOpenAiKey(): string | undefined {
  return (
    Deno.env.get("OpenAI_GPT_Key")?.trim() ||
    Deno.env.get("OPENAI_API_KEY")?.trim() ||
    undefined
  );
}

/** Read the OpenAI API key, throwing if none is configured. */
export function getOpenAiKey(): string {
  const value = resolveOpenAiKey();
  if (!value) {
    throw new Error("OpenAI_GPT_Key (or OPENAI_API_KEY) must be set.");
  }
  return value;
}

/**
 * Non-throwing variant of {@link getOpenAiKey}: returns "" when no key is
 * configured, for callers that defer the missing-key error (e.g.
 * `sync-updated-bills` reports it per bill instead of aborting the run).
 */
export function getOptionalOpenAiKey(): string {
  return resolveOpenAiKey() ?? "";
}

export function parseKeyMap(name: string): Record<string, string> {
  try {
    const parsed = JSON.parse(Deno.env.get(name) ?? "{}");
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Resolve the Supabase secret/service key, preferring the new secret key
 * (`SUPABASE_SECRET_KEYS.default`) and falling back to the legacy
 * `SUPABASE_SERVICE_ROLE_KEY`. Returns undefined when neither is configured.
 */
export function resolveServiceKey(): string | undefined {
  return (
    parseKeyMap("SUPABASE_SECRET_KEYS")["default"]?.trim() ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ||
    undefined
  );
}

/** Resolve the Supabase secret/service key, throwing if none is configured. */
export function getServiceKey(): string {
  const value = resolveServiceKey();
  if (!value) {
    throw new Error(
      "No Supabase secret key configured (SUPABASE_SECRET_KEYS or SUPABASE_SERVICE_ROLE_KEY).",
    );
  }
  return value;
}

/**
 * Resolve the Supabase publishable/anon key, preferring the new publishable key
 * (`SUPABASE_PUBLISHABLE_KEYS.default`) and falling back to the legacy
 * `SUPABASE_ANON_KEY`. Returns undefined when neither is configured.
 */
export function resolvePublishableKey(): string | undefined {
  return (
    parseKeyMap("SUPABASE_PUBLISHABLE_KEYS")["default"]?.trim() ||
    Deno.env.get("SUPABASE_ANON_KEY")?.trim() ||
    undefined
  );
}

/** Resolve the Supabase publishable/anon key, throwing if none is configured. */
export function getPublishableKey(): string {
  const value = resolvePublishableKey();
  if (!value) {
    throw new Error(
      "No Supabase publishable key configured (SUPABASE_PUBLISHABLE_KEYS or SUPABASE_ANON_KEY).",
    );
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
