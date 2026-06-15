import asyncio
import os
from pathlib import Path

import httpx

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover
    load_dotenv = None

# Load secrets from .env files (repo root and supabase/.env) when python-dotenv
# is installed; otherwise fall back to the ambient environment.
if load_dotenv is not None:
    ROOT_DIR = Path(__file__).resolve().parent.parent
    load_dotenv(ROOT_DIR / ".env")
    load_dotenv(ROOT_DIR / "supabase" / ".env")
    load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not all([SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY]):
    raise SystemExit(
        "Missing required environment variables. Set SUPABASE_URL and "
        "SUPABASE_SERVICE_ROLE_KEY in your environment or a .env file."
    )


async def process_batches():
    url = f"{SUPABASE_URL.rstrip('/')}/functions/v1/bulk-import-dataset"
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }

    has_more = True
    total_matched = 0

    print("Starting batch processing...")

    async with httpx.AsyncClient(timeout=60.0) as client:
        while has_more:
            try:
                # Batch size 25 is optimized for Supabase Free Tier resources.
                response = await client.post(url, headers=headers, json={"max_files": 25})
                response.raise_for_status()
                data = response.json()

                matched = data.get("matched_bills", 0)
                total_matched += matched
                continuation = data.get("continuation", {})
                has_more = continuation.get("has_more", False)
                next_index = continuation.get("next_index", "N/A")
                total_files = continuation.get("total_files", "N/A")

                print(f"Batch processed. Matched: {matched}. Total Matched: {total_matched}. Progress: {next_index}/{total_files}")

            except httpx.HTTPStatusError as e:
                if e.response.status_code == 500:
                    print(f"Server error 500: {e.response.text}")
                    print("Retrying in 5 seconds...")
                    await asyncio.sleep(5)
                    continue
                else:
                    print(f"HTTP error {e.response.status_code}: {e}")
                    print(f"Response: {e.response.text}")
                    break
            except Exception as e:
                print(f"Unexpected error: {e}")
                break

    print(f"Bulk import finished. Total bills matched: {total_matched}")


if __name__ == "__main__":
    asyncio.run(process_batches())
