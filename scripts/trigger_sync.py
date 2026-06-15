import os
import asyncio

import httpx

from load_env import load_project_env

load_project_env()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not all([SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY]):
    raise SystemExit(
        "Missing required environment variables. Set SUPABASE_URL and "
        "SUPABASE_SERVICE_ROLE_KEY in your environment or a .env file."
    )


async def sync_bills():
    base_url = SUPABASE_URL.rstrip("/")
    sync_url = f"{base_url}/rest/v1/rpc/sync_updated_bills"
    vote_url = f"{base_url}/rest/v1/rpc/invoke_edge_function"

    # The service_role key authenticates both the gateway (apikey) and the
    # PostgREST role (Bearer), matching the other ops scripts.
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }

    print("Starting bill synchronization via RPC...")

    async with httpx.AsyncClient(timeout=60.0) as client:
        # sync-updated-bills processes a few bills per call, so run several
        # passes sequentially with a small delay to stay within free-tier and
        # OpenAI rate limits.
        for i in range(30):
            try:
                print(f"Call {i + 1}: Invoking sync_updated_bills...")
                response = await client.post(sync_url, headers=headers, json={})

                if response.status_code == 200:
                    print(f"Call {i + 1} successful.")
                else:
                    print(f"Call {i + 1} failed with status {response.status_code}: {response.text}")

                await asyncio.sleep(10)
            except Exception as e:
                print(f"Error during call {i + 1}: {e}")
                break

        print("Starting vote synchronization...")
        try:
            vote_payload = {"endpoint": "votes-daily", "job_name": "manual-vote-sync"}
            print("Invoking votes-daily...")
            response = await client.post(vote_url, headers=headers, json=vote_payload)
            if response.status_code == 200:
                print("Vote sync successful.")
            else:
                print(f"Vote sync failed with status {response.status_code}: {response.text}")
        except Exception as e:
            print(f"Error during vote sync: {e}")

    print("Finished all synchronization tasks.")


if __name__ == "__main__":
    asyncio.run(sync_bills())
