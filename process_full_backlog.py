# process_full_backlog.py (Version 2.0 - Quota Aware)
# A smart script that pauses on quota errors and resumes automatically.

import os
import requests
import time
import json
from dotenv import load_dotenv

# --- Step 1: Load Environment Variables ---
print("--- Loading environment variables ---")
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY]):
    print("❌ FATAL ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.")
    print("Ensure you have a .env file in the project root with these values.")
    exit()

print("✅ Secrets loaded successfully.")

# --- Step 2: Prepare the Request ---
FUNCTION_URL = f"{SUPABASE_URL}/functions/v1/sync-updated-bills"
HEADERS = {
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json"
}
BODY = {}

# --- Step 3: Loop until the job is done ---
print("\n--- Starting to process the bill summary backlog (Quota Aware) ---")
print("The script will automatically pause for 1 hour if it hits a quota limit.")

bill_counter = 0
while True:
    bill_counter += 1
    print(f"\n[{bill_counter}] Triggering function...")

    try:
        response = requests.post(FUNCTION_URL, headers=HEADERS, json=BODY, timeout=90) # Increased timeout
        response_data = {}

        # Safely parse the JSON response
        try:
            response_data = response.json()
        except json.JSONDecodeError:
            print(f"🔥 Error: Could not decode JSON from server. Status: {response.status_code}")
            print(f"   Response Text: {response.text}")
            print("Stopping due to unexpected server response.")
            break

        # --- Smart Error Handling ---

        # 1. Check for the "All Done" success condition
        if response_data.get("message") == "Sync complete. All bills are up-to-date.":
            print(f"   Server Response: {response_data.get('message')}")
            print("\n✅🎉 VICTORY! The entire backlog has been processed.")
            break

        # 2. Check for a non-200 status code (an error)
        if response.status_code != 200:
            error_message = response_data.get('error', '').lower()
            
            # NEW: Check if the error is a quota/limit issue
            if 'quota' in error_message or 'limit' in error_message or 'rate' in error_message:
                pause_duration_hours = 1
                pause_duration_seconds = pause_duration_hours * 3600
                print(f"   ⚠️ API quota limit reached. Pausing for {pause_duration_hours} hour.")
                print(f"   Will resume automatically at {time.strftime('%H:%M:%S', time.localtime(time.time() + pause_duration_seconds))}")
                time.sleep(pause_duration_seconds)
                # After sleeping, continue to the next loop iteration to retry
                continue
            else:
                # For any other type of error, stop the script
                print(f"🔥 An unexpected error occurred (HTTP {response.status_code}). Stopping script.")
                print(f"   Error Details: {response_data.get('error', 'No details provided.')}")
                break
        
        # 3. If it was a success (200), print the message
        print(f"   Server Response: {response_data.get('message', 'No message.')}")

    except requests.exceptions.RequestException as e:
        print(f"🔥 A network error occurred: {e}")
        print("Stopping script. Please check your connection and try again.")
        break

    # Wait a couple of seconds between successful requests to be polite to the API
    time.sleep(2)