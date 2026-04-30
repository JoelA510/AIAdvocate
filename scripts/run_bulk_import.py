
import asyncio
import json
import httpx
import sys

async def process_batches():
    url = "https://klpwiiszmzzfvlbfsjrd.supabase.co/functions/v1/bulk-import-dataset"
    api_key = "44ad03c38101d1b4a0505f1fa9d71ac3016f56f9541e6b1739209bcaebed3653"
    headers = {
        "apikey": api_key,
        "Content-Type": "application/json"
    }
    
    has_more = True
    total_matched = 0
    
    print("Starting batch processing...")
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        while has_more:
            try:
                # Batch size 25 is optimized for Supabase Free Tier resources
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
                    print(f"Retrying in 5 seconds...")
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
