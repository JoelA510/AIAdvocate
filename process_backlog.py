# process_backlog.py (Definitive Final Version)
import os
import base64
import subprocess
import time
from typing import Optional

import requests
from dotenv import load_dotenv
from supabase import Client, create_client

# --- Step 1: Load Environment Variables ---
load_dotenv() 
print("--- Loading environment variables from project root .env file ---")

LEGISCAN_API_KEY = os.getenv("LEGISCAN_API_KEY")
LEGISCAN_ACCESS_KEY = os.getenv("LEGISCAN_ACCESS_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not all([LEGISCAN_API_KEY, LEGISCAN_ACCESS_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY]):
    print("❌ FATAL ERROR: A required environment variable is missing from your root .env file.")
    exit()

print("✅ All necessary secrets loaded.")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Reuse a single HTTP session for efficiency and specify a timeout for requests
REQUEST_TIMEOUT = 30
session = requests.Session()
session.headers.update({'User-Agent': 'Mozilla/5.0'})

# --- Helper Functions ---
def get_summary_with_gemini_cli(prompt: str, text: str) -> Optional[str]:
    """Generate a summary by calling the 'gemini' command-line tool."""
    try:
        full_prompt = f"{prompt}\n\n---\n\n{text}"
        command = ["gemini", "-p", full_prompt]
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=True,
            encoding="utf-8",
        )
        return result.stdout.strip()
    except FileNotFoundError:
        print("\n--- FATAL ERROR ---")
        print("The 'gemini' command was not found.")
        return None
    except subprocess.CalledProcessError as e:
        print(f"    - ⚠️ Gemini for CLI failed with exit code {e.returncode}")
        print(f"    - Stderr: {e.stderr.strip()}")
        return f"AI_SUMMARY_FAILED: Gemini CLI Error - {e.stderr.strip()}"
    except Exception as e:
        print(f"    - ⚠️ An unexpected error occurred calling Gemini CLI: {e}")
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
def main() -> None:
    print("Starting local-first AI summary backlog processing (using Gemini for CLI)...")

    bills_to_process = get_bills_to_process()

    if bills_to_process is None:
        print("Halting due to a database error while fetching the bill list.")
        return

    if not bills_to_process:
        print("✅ No bills found that need processing. All summaries are up-to-date!")
        return

    total_bills = len(bills_to_process)
    print(f"Found {total_bills} bills to process. Starting the run...")

    for i, bill_stub in enumerate(bills_to_process):
        bill_id = bill_stub["id"]
        print(f"\n--- Processing bill {i+1}/{total_bills} (ID: {bill_id}) ---")

        try:
            # 1. Fetch from LegiScan
            print("  - Fetching details from LegiScan...")
            bill_url = (
                f"https://api.legiscan.com/?op=getBill&id={bill_id}&key={LEGISCAN_API_KEY}"
                f"&access_key={LEGISCAN_ACCESS_KEY}"
            )
            bill_res = session.get(bill_url, timeout=REQUEST_TIMEOUT)
            bill_res.raise_for_status()
            bill_data = bill_res.json()["bill"]

            doc_id = bill_data["texts"][-1]["doc_id"]
            if not doc_id:
                print("  - Skipping: No document text found.")
                continue

            print(f"  - Fetching bill text (doc_id: {doc_id})...")
            text_url = (
                f"https://api.legiscan.com/?op=getBillText&id={doc_id}&key={LEGISCAN_API_KEY}"
                f"&access_key={LEGISCAN_ACCESS_KEY}"
            )
            text_res = session.get(text_url, timeout=REQUEST_TIMEOUT)
            text_res.raise_for_status()
            original_text = base64.b64decode(text_res.json()["text"]["doc"]).decode(
                "utf-8", "ignore"
            )

            # 2. Generate Summaries with Gemini for CLI
            print("  - Generating summaries with Gemini for CLI (this will be slow)...")

            summary_simple = get_summary_with_gemini_cli(
                "Explain and summarize this legislative bill to a 12 year old. Be as verbose as needed not to miss a detail.",
                original_text,
            )
            if summary_simple is None:
                break

            summary_medium = get_summary_with_gemini_cli(
                "Explain and summarize this legislative bill to a 16 year old. Be as verbose as needed not to miss a detail.",
                original_text,
            )
            if summary_medium is None:
                break

            summary_complex = get_summary_with_gemini_cli(
                "Provide a detailed summary of this bill for a policy expert in plain language.",
                original_text,
            )
            if summary_complex is None:
                break

            # 3. Save to Supabase
            print("  - Saving results to database...")
            update_data = {
                "original_text": original_text,
                "summary_simple": summary_simple,
                "summary_medium": summary_medium,
                "summary_complex": summary_complex,
                "change_hash": bill_data["change_hash"],
            }
            supabase.from_("bills").update(update_data).eq("id", bill_id).execute()
            print(
                f"  - ✅ Successfully processed and saved bill {bill_data['bill_number']}."
            )

        except Exception as e:
            print(f"  - ❌ FAILED to process bill {bill_id}: {e}")

        time.sleep(2)

    print("\n\n✅🎉 Backlog processing complete!")


if __name__ == "__main__":
    main()
