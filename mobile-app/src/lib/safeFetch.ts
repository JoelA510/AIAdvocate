// mobile-app/src/lib/safeFetch.ts

/**
 * A wrapper around the native fetch API that provides automatic retries
 * with exponential backoff for transient errors, particularly for handling
 * rate-limiting (HTTP 429) responses.
 *
 * @param url The URL to fetch.
 * @param init The request initialization options (e.g., method, headers, body).
 * @param maxTries The maximum number of attempts to make before failing.
 * @returns A Promise that resolves to the Response object on success.
 * @throws Will throw the last encountered error after all retries fail.
 */
export async function safeFetch(
  url: string,
  init: RequestInit = {},
  maxTries: number = 3,
): Promise<Response> {
  let lastError: any;

  for (let i = 0; i < maxTries; i++) {
    try {
      const response = await fetch(url, init);

      if (response.status === 429) {
        const waitTime = Math.pow(2, i) * 1000;
        const jitter = Math.random() * 500;
        const totalWait = waitTime + jitter;

        console.warn(`safeFetch: Received status 429. Retrying in ${totalWait.toFixed(0)}ms...`);
        await new Promise(resolve => setTimeout(resolve, totalWait));
        
        continue; 
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return response;

    } catch (error) {
      lastError = error;
      console.error(`safeFetch: Attempt ${i + 1} failed.`, error);

      if (i === maxTries - 1) {
        break;
      }
    }
  }

  throw new Error(`safeFetch: All ${maxTries} attempts failed. Last error: ${lastError.message}`);
}