# process_backlog.py (v5 - Self-Healing)
import os
import requests
import time
from dotenv import load_dotenv
from supabase import create_client, Client

# --- Step 1: Load Environment Variables and Configure Clients ---
load_dotenv(dotenv_path=os.path.join('mobile-app', '.env'))
print("--- Loading environment variables ---")

ANON_KEY = os.getenv("EXPO_PUBLIC_SUPABASE_ANON_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
PROJECT_REF = "klpwiiszmzzfvlbfsjrd"

if not all([ANON_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY]):
    print("❌ FATAL ERROR: A required environment variable is missing.")
    exit()

print("✅ All secrets loaded.")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
FUNCTION_URL = f"https://{PROJECT_REF}.supabase.co/functions/v1/sync-updated-bills"

def get_bills_to_process():
    """
    Gets a list of all bills that still need summaries, including both
    initial placeholders and any that previously failed.
    """
    try:
        # **THE FIX:** Use an 'or' filter to find bills that have EITHER the
        # placeholder text OR the AI failure message.
        res = supabase.from_("bills").select("id").or_(
            'summary_simple.ilike.Placeholder for%,summary_simple.ilike.AI_SUMMARY_FAILED%'
        ).execute()
        return res.data
    except Exception as e:
        print(f"❌ DB Error fetching bills: {e}")
        return None

# --- Main Loop ---
print("Starting self-healing backlog processing...")
total_processed_this_run = 0

bills_to_process = get_bills_to_process()

if bills_to_process is None:
    print("Halting due to database error.")
    exit()

if not bills_to_process:
    print("✅ No bills to process. All summaries are up-to-date!")
    exit()

total_bills = len(bills_to_process)
print(f"Found {total_bills} bills that need AI summaries. Starting the run...")

for i, bill_stub in enumerate(bills_to_process):
    bill_id = bill_stub['id']
    print(f"\nProcessing bill {i + 1} of {total_bills} (ID: {bill_id})...")

    try:
        headers = { "apikey": ANON_KEY, "Authorization": f"Bearer {ANON_KEY}" }
        response = requests.post(FUNCTION_URL, headers=headers, json={'bill_id': bill_id}, timeout=120)
        response.raise_for_status()
        total_processed_this_run += 1
        print(f"-> {response.json().get('message', '(No message returned)')}")
    except Exception as e:
        print(f"\n--- SCRIPT HALTED: Function invocation failed ---")
        print(f"Error: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response Body: {e.response.text}")
        break
    
    # Respect the free tier rate limit of ~2 requests per minute.
    # A 35-second delay is safe.
    time.sleep(35)

print(f"\n\n✅🎉 Backlog script finished. Processed {total_processed_this_run} bills in this run.")