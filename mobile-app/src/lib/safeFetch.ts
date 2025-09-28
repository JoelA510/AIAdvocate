// mobile-app/src/lib/safeFetch.ts

type SafeFetchOptions = {
  /** Native fetch init options (method, headers, body, etc.). */
  init?: RequestInit;
  /** Total number of attempts (defaults to 3). */
  retries?: number;
  /** Base delay in ms used for exponential backoff (defaults to 1000ms). */
  retryDelayMs?: number;
  /** Optional request timeout per attempt (ms). */
  timeoutMs?: number;
};

function isOptions(arg: RequestInit | SafeFetchOptions | undefined): arg is SafeFetchOptions {
  if (!arg) return false;
  return "retries" in arg || "retryDelayMs" in arg || "timeoutMs" in arg || "init" in arg;
}

export async function safeFetch(url: string, options?: SafeFetchOptions): Promise<Response>;
export async function safeFetch(
  url: string,
  init?: RequestInit,
  retries?: number,
): Promise<Response>;
export async function safeFetch(
  url: string,
  initOrOptions: RequestInit | SafeFetchOptions = {},
  maybeRetries?: number,
): Promise<Response> {
  const options: SafeFetchOptions = isOptions(initOrOptions)
    ? initOrOptions
    : { init: initOrOptions as RequestInit, retries: maybeRetries };

  const {
    init = {},
    retries = typeof options.retries === "number" ? options.retries : 3,
    retryDelayMs = 1000,
    timeoutMs,
  } = options;

  let lastError: any;

  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = timeoutMs ? new AbortController() : undefined;
    const timer = timeoutMs ? setTimeout(() => controller?.abort(), timeoutMs) : null;

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller?.signal ?? init.signal,
      });

      if (response.status === 429) {
        const waitTime = Math.pow(2, attempt) * retryDelayMs;
        const jitter = Math.random() * 0.5 * retryDelayMs;
        const totalWait = waitTime + jitter;
        console.warn(`safeFetch: Received status 429. Retrying in ${totalWait.toFixed(0)}ms...`);
        await new Promise((resolve) => setTimeout(resolve, totalWait));
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return response;
    } catch (error: any) {
      lastError = error;
      const isLastAttempt = attempt === retries - 1;

      if (error?.name === "AbortError") {
        console.error(`safeFetch: Attempt ${attempt + 1} aborted after ${timeoutMs}ms.`);
      } else {
        console.error(`safeFetch: Attempt ${attempt + 1} failed.`, error);
      }

      if (isLastAttempt) break;

      const waitTime = Math.pow(2, attempt) * retryDelayMs;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  const message = lastError?.message ?? "Unknown error";
  throw new Error(`safeFetch: All ${retries} attempts failed. Last error: ${message}`);
}
