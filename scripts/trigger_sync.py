
import httpx
import asyncio
import time

async def sync_bills():
    url = "https://klpwiiszmzzfvlbfsjrd.supabase.co/rest/v1/rpc/sync_updated_bills"
    anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtscHdpaXN6bXp6ZnZsYmZzanJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIzNjkwMTEsImV4cCI6MjA2Nzk0NTAxMX0.GlGRLwbqoJBc_KiS9Q1dCTnRqboDNBiv6B_gVAFVUQc"
    service_role_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtscHdpaXN6bXp6ZnZsYmZzanJkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjM2OTAxMSwiZXhwIjoyMDY3OTQ1MDExfQ.kfVXeIo5H1lHqZAG_NT7dYsv60JXXPfYo6qIqWwo6N8"
    
    headers = {
        "apikey": anon_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json"
    }

    print("Starting bill synchronization via RPC...")
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        # We'll run it a few times to process a batch of bills. 
        # Since sync-updated-bills processes SYNC_BILLS_PER_RUN (3) bills at a time,
        # and we matched 16 + 66 = 82 bills, we might need ~27-30 calls.
        # However, to be safe and free-tier optimized, we'll do them sequentially with a small delay.
        
        for i in range(30):
            try:
                print(f"Call {i+1}: Invoking sync_updated_bills...")
                response = await client.post(url, headers=headers, json={})
                
                if response.status_code == 200:
                    print(f"Call {i+1} successful.")
                else:
                    print(f"Call {i+1} failed with status {response.status_code}: {response.text}")
                
                # Wait 10 seconds between calls to respect free tier and OpenAI rate limits
                await asyncio.sleep(10)
                
            except Exception as e:
                print(f"Error during call {i+1}: {e}")
                break

    print("Starting vote synchronization...")
    try:
        vote_url = "https://klpwiiszmzzfvlbfsjrd.supabase.co/rest/v1/rpc/invoke_edge_function"
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
