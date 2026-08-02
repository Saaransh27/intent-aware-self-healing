import json
import os
import ssl
import urllib.request

GEMINI_MODEL = "gemini-flash-latest"
GEMINI_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"


def _ssl_context():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def call_gemini(system_prompt, user_prompt):
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set in the environment")

    payload = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
    }
    request = urllib.request.Request(
        f"{GEMINI_API_URL}?key={api_key}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=60, context=_ssl_context()) as response:
        body = json.loads(response.read().decode("utf-8"))
    parts = body["candidates"][0]["content"]["parts"]
    return "".join(part["text"] for part in parts if "text" in part)
