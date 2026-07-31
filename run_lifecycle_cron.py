from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


BACKEND_URL = (
    os.getenv("LIFECYCLE_BACKEND_URL")
    or "https://updated-adgen-1.onrender.com"
).rstrip("/")

SCHEDULER_SECRET = os.getenv("EMAIL_SCHEDULER_SECRET")

if not SCHEDULER_SECRET:
    print("ERROR: EMAIL_SCHEDULER_SECRET is not configured.")
    sys.exit(1)

url = f"{BACKEND_URL}/email-engine/lifecycle/run"

payload = json.dumps({
    "limit": 500
}).encode("utf-8")

request = urllib.request.Request(
    url=url,
    data=payload,
    method="POST",
    headers={
        "Content-Type": "application/json",
        "X-Email-Scheduler-Secret": SCHEDULER_SECRET,
    },
)

print(f"Running lifecycle scheduler against {url}")

try:
    with urllib.request.urlopen(request, timeout=300) as response:
        body = response.read().decode("utf-8")
        print("Lifecycle scheduler completed successfully.")
        print(body)

except urllib.error.HTTPError as error:
    print(f"HTTP {error.code}")
    print(error.read().decode("utf-8"))
    sys.exit(1)

except Exception as error:
    print(f"Lifecycle scheduler failed: {error}")
    sys.exit(1)