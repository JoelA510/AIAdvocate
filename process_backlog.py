# process_backlog.py (Legacy local summarizer)
"""
Legacy helper that reprocesses bills by calling LegiScan directly and running
summaries locally via the OpenAI Chat Completions API. Prefer `process_full_backlog.py`, which delegates the
heavy lifting to the deployed Supabase Edge Function.  This script is left in
place for situations where you explicitly need to run the summaries on your
own machine.
"""

import os
import time
import base64
from typing import Optional

try:
    import requests
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "The `requests` package is required. Install dependencies with "
        "`python -m pip install requests python-dotenv supabase`."
    ) from exc

try:
    from dotenv import load_dotenv
    from supabase import create_client, Client
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "Missing ingestion dependencies. Run "
        "`python -m pip install requests python-dotenv supabase`."
    ) from exc

# --- Step 1: Load Environment Variables ---
load_dotenv() 
print("--- Loading environment variables from project root .env file ---")

LEGISCAN_API_KEY = os.getenv("LEGISCAN_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
OPENAI_API_KEY = os.getenv("OpenAI_GPT_Key")

if not all([LEGISCAN_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY]):
    print("❌ FATAL ERROR: A required environment variable is missing from your root .env file.")
    exit()

print("✅ All necessary secrets loaded.")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# --- Helper Functions ---
def get_summary_with_openai(prompt: str, text: str) -> Optional[str]:
    """
    Generates a summary by calling the OpenAI Chat Completions API.
    """
    try:
        full_prompt = f"{prompt}\n\n---\n\n{text}"

        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "gpt-4o-mini",
                "temperature": 0.2,
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a legislative analyst who writes thorough yet readable summaries.",
                    },
                    {"role": "user", "content": full_prompt},
                ],
            },
            timeout=120,
        )
        response.raise_for_status()
        payload = response.json()
        message = payload.get("choices", [{}])[0].get("message", {}).get("content")
        if not message:
            return "AI_SUMMARY_FAILED: OpenAI response missing content"
        return message.strip()
    except requests.HTTPError as exc:
        print(f"    - ⚠️ OpenAI API returned an error: {exc.response.text if exc.response else exc}")
        return "AI_SUMMARY_FAILED: OpenAI HTTP error"
    except requests.RequestException as exc:
        print(f"    - ⚠️ Network error calling OpenAI API: {exc}")
        return "AI_SUMMARY_FAILED: OpenAI request error"
    except Exception as e:
        print(f"    - ⚠️ An unexpected error occurred calling OpenAI: {e}")
        return f"AI_SUMMARY_FAILED: Unexpected script error"

def get_bills_to_process():
    """Gets a list of all bills that still need summaries."""
    print("  - Calling database function 'get_bills_needing_summaries'...")
    try:
        res = supabase.rpc('get_bills_needing_summaries').execute()
        return res.data
    except Exception as e:
        print(f"❌ DB Error fetching bill list: {e}")
        return None

# --- Main Script ---
print("Starting local-first AI summary backlog processing (using OpenAI ChatGPT)...")

bills_to_process = get_bills_to_process()

if bills_to_process is None:
    print("Halting due to a database error while fetching the bill list.")
    exit()

if not bills_to_process:
    print("✅ No bills found that need processing. All summaries are up-to-date!")
    exit()

total_bills = len(bills_to_process)
print(f"Found {total_bills} bills to process. Starting the run...")

for i, bill_stub in enumerate(bills_to_process):
    bill_id = bill_stub['id']
    print(f"\n--- Processing bill {i+1}/{total_bills} (ID: {bill_id}) ---")

    try:
        # 1. Fetch from LegiScan
        print(f"  - Fetching details from LegiScan...")
        bill_url = f"https://api.legiscan.com/?op=getBill&id={bill_id}&key={LEGISCAN_API_KEY}&access_key=xMfz6U5b64iqAwoAsWGY0"
        bill_res = requests.get(bill_url, headers={'User-Agent': 'Mozilla/5.0'})
        bill_res.raise_for_status()
        bill_data = bill_res.json()['bill']
        
        doc_id = bill_data['texts'][-1]['doc_id']
        if not doc_id:
            print("  - Skipping: No document text found.")
            continue

        print(f"  - Fetching bill text (doc_id: {doc_id})...")
        text_url = f"https://api.legiscan.com/?op=getBillText&id={doc_id}&key={LEGISCAN_API_KEY}&access_key=xMfz6U5b64iqAwoAsWGY0"
        text_res = requests.get(text_url, headers={'User-Agent': 'Mozilla/5.0'})
        text_res.raise_for_status()
        original_text = base64.b64decode(text_res.json()['text']['doc']).decode('utf-8', 'ignore')

        # 2. Generate Summaries with OpenAI ChatGPT
        print("  - Generating summaries with OpenAI ChatGPT (this will be slow)...")
        
        summary_simple = get_summary_with_openai("Explain and summarize this legislative bill to a 12 year old. Be as verbose as needed not to miss a detail.", original_text)
        if summary_simple is None: break

        summary_medium = get_summary_with_openai("Explain and summarize this legislative bill to a 16 year old. Be as verbose as needed not to miss a detail.", original_text)
        if summary_medium is None: break

        summary_complex = get_summary_with_openai("Provide a detailed summary of this bill for a policy expert in plain language.", original_text)
        if summary_complex is None: break

        # 3. Save to Supabase
        print("  - Saving results to database...")
        update_data = {
            "original_text": original_text, "summary_simple": summary_simple,
            "summary_medium": summary_medium, "summary_complex": summary_complex,
            "change_hash": bill_data['change_hash']
        }
        supabase.from_("bills").update(update_data).eq("id", bill_id).execute()
        print(f"  - ✅ Successfully processed and saved bill {bill_data['bill_number']}.")

    except Exception as e:
        print(f"  - ❌ FAILED to process bill {bill_id}: {e}")
    
    time.sleep(2)

print("\n\n✅🎉 Backlog processing complete!")
