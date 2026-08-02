import json
import ssl
import os
import urllib.request

SHAKTI_BASE_URL = "https://http.prod-llm.shaktistudio.shakticloud.ai"
SHAKTI_MODEL = "openai/gpt-oss-120b"


def _ssl_context():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def call_shakti(system_prompt, user_prompt):
    api_key = os.environ.get("SHAKTI_API_KEY")
    if not api_key:
        raise RuntimeError("SHAKTI_API_KEY is not set in the environment")

    payload = {
        "model": SHAKTI_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "max_tokens": 4096,
        "stream": False,
    }
    request = urllib.request.Request(
        f"{SHAKTI_BASE_URL}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "content-type": "application/json",
            "authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=120, context=_ssl_context()) as response:
        body = json.loads(response.read().decode("utf-8"))
    return body["choices"][0]["message"]["content"]
