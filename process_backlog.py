# process_backlog.py (v3 - Local-First Processing)
import os
import requests
import time
from dotenv import load_dotenv
from supabase import create_client, Client
import base64
from google.generativeai import GenerativeModel, configure

# --- Step 1: Load Environment Variables and Configure Clients ---
load_dotenv(dotenv_path=os.path.join('mobile-app', '.env'))
print("--- Loading environment variables ---")

LEGISCAN_API_KEY = os.getenv("LEGISCAN_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not all([LEGISCAN_API_KEY, GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY]):
    print("❌ FATAL ERROR: A required environment variable is missing.")
    exit()

print("✅ All secrets loaded.")

# Configure clients
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
configure(api_key=GEMINI_API_KEY)
model = GenerativeModel('gemini-1.5-flash-latest')

# --- Helper Functions ---
def get_summary(prompt, text):
    try:
        full_prompt = f"{prompt}\n\n---\n\n{text}"
        response = model.generate_content(full_prompt)
        return response.text
    except Exception as e:
        print(f"    - ⚠️ Gemini API Error: {e}")
        return f"AI_SUMMARY_FAILED: {e}"

def get_bills_to_process():
    """Gets a list of all bills that still need summaries."""
    try:
        res = supabase.from_("bills").select("id, change_hash").ilike('summary_simple', 'Placeholder for%').execute()
        return res.data
    except Exception as e:
        print(f"❌ DB Error fetching bills: {e}")
        return None

# --- Main Loop ---
print("Starting local-first AI summary backlog processing...")

bills_to_process = get_bills_to_process()

if bills_to_process is None:
    print("Halting due to database error.")
    exit()

if not bills_to_process:
    print("✅ No bills to process. All summaries are up-to-date!")
    exit()

total_bills = len(bills_to_process)
print(f"Found {total_bills} bills to process.")

for i, bill_stub in enumerate(bills_to_process):
    bill_id = bill_stub['id']
    print(f"\n--- Processing bill {i+1}/{total_bills} (ID: {bill_id}) ---")

    try:
        # 1. Fetch full bill details from LegiScan
        bill_url = f"https://api.legiscan.com/?op=getBill&id={bill_id}&key={LEGISCAN_API_KEY}&access_key=xMfz6U5b64iqAwoAsWGY0"
        bill_res = requests.get(bill_url, headers={'User-Agent': 'Mozilla/5.0'})
        bill_res.raise_for_status()
        bill_data = bill_res.json()['bill']
        
        doc_id = bill_data['texts'][-1]['doc_id']
        if not doc_id:
            print("  - Skipping: No document text found.")
            continue

        # 2. Fetch the full bill text
        text_url = f"https://api.legiscan.com/?op=getBillText&id={doc_id}&key={LEGISCAN_API_KEY}&access_key=xMfz6U5b64iqAwoAsWGY0"
        text_res = requests.get(text_url, headers={'User-Agent': 'Mozilla/5.0'})
        text_res.raise_for_status()
        # Decode the Base64 text
        original_text = base64.b64decode(text_res.json()['text']['doc']).decode('utf-8')

        # 3. Generate Summaries with Gemini
        print("  - Generating summaries with Gemini...")
        summary_simple = get_summary("Explain this legislative bill to a 12-year-old.", original_text)
        summary_medium = get_summary("Summarize this legislative bill for a high school student.", original_text)
        summary_complex = get_summary("Provide a detailed summary of this bill for a policy expert.", original_text)

        # 4. Save to Supabase
        print("  - Saving results to database...")
        update_data = {
            "original_text": original_text,
            "summary_simple": summary_simple,
            "summary_medium": summary_medium,
            "summary_complex": summary_complex,
            "change_hash": bill_data['change_hash'] # Also update hash to prevent re-processing
        }
        supabase.from_("bills").update(update_data).eq("id", bill_id).execute()
        print(f"  - ✅ Successfully processed and saved bill {bill_data['bill_number']}.")

    except Exception as e:
        print(f"  - ❌ FAILED to process bill {bill_id}: {e}")
    
    # Be gentle on the APIs
    time.sleep(15) # 15-second delay to respect Gemini rate limits

print("\n\n✅🎉 Backlog processing complete!")