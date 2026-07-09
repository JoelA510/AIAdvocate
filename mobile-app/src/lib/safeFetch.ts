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

  // Always make at least one real attempt, even if a caller passes 0, a
  // negative, or a non-finite retry count.
  const totalAttempts = Number.isFinite(retries) && retries >= 1 ? Math.floor(retries) : 1;

  let lastError: unknown;

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const isLastAttempt = attempt === totalAttempts - 1;
    const controller = timeoutMs ? new AbortController() : undefined;

    // When we own the timeout controller, forward the caller's abort signal so
    // that either the timeout OR the caller can cancel the request. Without
    // this, supplying `timeoutMs` would silently ignore `init.signal`.
    let onCallerAbort: (() => void) | undefined;
    if (controller && init.signal) {
      if (init.signal.aborted) {
        controller.abort();
      } else {
        onCallerAbort = () => controller.abort();
        init.signal.addEventListener("abort", onCallerAbort, { once: true });
      }
    }

    const timer = timeoutMs ? setTimeout(() => controller?.abort(), timeoutMs) : null;

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller?.signal ?? init.signal,
      });

      if (response.status === 429) {
        // Record a meaningful error so an exhausted retry budget surfaces as a
        // rate-limit failure rather than "Unknown error".
        lastError = new Error("HTTP 429: Too Many Requests");
        if (isLastAttempt) break;
        const waitTime = Math.pow(2, attempt) * retryDelayMs;
        const jitter = Math.random() * 0.5 * retryDelayMs;
        const totalWait = waitTime + jitter;
        console.warn(`safeFetch: Received status 429. Retrying in ${totalWait.toFixed(0)}ms...`);
        await new Promise((resolve) => setTimeout(resolve, totalWait));
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        const httpError = new Error(`HTTP ${response.status}: ${errorText}`) as Error & {
          nonRetryable?: boolean;
        };
        // 4xx other than 408 (Request Timeout) are permanent client errors --
        // retrying cannot succeed. 5xx and 408 stay retryable (transient).
        httpError.nonRetryable =
          response.status >= 400 && response.status < 500 && response.status !== 408;
        throw httpError;
      }

      return response;
    } catch (error: any) {
      lastError = error;

      // A caller-initiated abort cancels the whole operation — stop immediately
      // rather than burning the remaining retries with backoff delays.
      if (init.signal?.aborted) {
        console.error(`safeFetch: Attempt ${attempt + 1} cancelled by caller.`);
        break;
      }

      // A permanent 4xx client error cannot succeed on retry -- stop
      // immediately instead of burning the remaining attempts.
      if (error?.nonRetryable) {
        console.error(
          `safeFetch: Attempt ${attempt + 1} failed with a non-retryable client error.`,
          error,
        );
        break;
      }

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
      if (onCallerAbort) init.signal?.removeEventListener("abort", onCallerAbort);
    }
  }

  const message =
    lastError instanceof Error
      ? lastError.message
      : lastError != null
        ? String(lastError)
        : "Unknown error";
  throw new Error(`safeFetch: All ${totalAttempts} attempts failed. Last error: ${message}`);
}
