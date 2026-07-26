# -*- coding: utf-8 -*-
"""
NAZAR Backend Groq Conversational AI Service (Python Implementation)
Model: llama-3.1-8b-instant

Provides persistent quota tracking, automatic API key rotation at 14,000 requests,
daily UTC reset, and 429 failover without exposing API keys or crashing.
"""
import os
import json
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone

SINGLETON_ID = "groq_usage"
ROTATION_LIMIT = 14000
LOCAL_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../data/groq_usage.json")

def get_today_utc():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")

def discover_keys():
    keys = {}
    k1 = os.environ.get("GROQ_API_KEY_1", "").strip()
    k2 = os.environ.get("GROQ_API_KEY_2", "").strip()
    if k1: keys[1] = k1
    if k2: keys[2] = k2
    return keys

in_memory_state = {
    "activeKey": 1,
    "key1Requests": 0,
    "key2Requests": 0,
    "lastReset": get_today_utc()
}

def sync_state():
    today = get_today_utc()
    if in_memory_state["lastReset"] != today:
        print(f"[GroqService.py] Daily UTC midnight reset triggered. Date: {today}")
        in_memory_state["key1Requests"] = 0
        in_memory_state["key2Requests"] = 0
        in_memory_state["activeKey"] = 1
        in_memory_state["lastReset"] = today

    try:
        if os.path.exists(LOCAL_FILE):
            with open(LOCAL_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
            if saved.get("lastReset") != today:
                saved["key1Requests"] = 0
                saved["key2Requests"] = 0
                saved["activeKey"] = 1
                saved["lastReset"] = today
            in_memory_state["activeKey"] = saved.get("activeKey", 1)
            in_memory_state["key1Requests"] = saved.get("key1Requests", 0)
            in_memory_state["key2Requests"] = saved.get("key2Requests", 0)
            in_memory_state["lastReset"] = saved.get("lastReset", today)
    except Exception:
        pass

def save_state(reason=""):
    try:
        dir_path = os.path.dirname(LOCAL_FILE)
        if not os.path.exists(dir_path):
            os.makedirs(dir_path, exist_ok=True)
        with open(LOCAL_FILE, "w", encoding="utf-8") as f:
            json.dump(in_memory_state, f, indent=2)
    except Exception as e:
        print("[GroqService.py] Failed to save state:", e)

def get_active_key_number():
    sync_state()
    k_num = in_memory_state["activeKey"]
    current_reqs = in_memory_state["key1Requests"] if k_num == 1 else in_memory_state["key2Requests"]
    if current_reqs >= ROTATION_LIMIT:
        print(f"[GroqService.py] Quota limit ({ROTATION_LIMIT}) reached on Key #{k_num}. Rotating...")
        k_num = 2 if k_num == 1 else 1
        in_memory_state["activeKey"] = k_num
        save_state(f"Quota reached on Key #{2 if k_num == 2 else 1}")
    return k_num

def record_success(key_num):
    if key_num == 1:
        in_memory_state["key1Requests"] += 1
    else:
        in_memory_state["key2Requests"] += 1
    save_state("Request success")
    print(f"[GroqService.py] Recorded success on Key #{key_num}. Total -> Key #1: {in_memory_state['key1Requests']}, Key #2: {in_memory_state['key2Requests']}")

def rotate_key(reason="Manual rotation"):
    old_key = in_memory_state["activeKey"]
    in_memory_state["activeKey"] = 2 if old_key == 1 else 1
    print(f"[GroqService.py] Rotating API Key: #{old_key} -> #{in_memory_state['activeKey']}. Reason: {reason}")
    save_state(reason)
    return in_memory_state["activeKey"]

def execute_call(key_num, messages, tools=None, tool_choice="auto", temperature=0.1):
    keys_map = discover_keys()
    api_key = keys_map.get(key_num) or keys_map.get(1) or keys_map.get(2)
    if not api_key:
        raise Exception(f"Missing API Key #{key_num}")
    
    model = os.environ.get("GROQ_MODEL", "llama-3.1-8b-instant")
    url = "https://api.groq.com/openai/v1/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature
    }
    if tools and len(tools) > 0:
        payload["tools"] = tools
        payload["tool_choice"] = tool_choice

    data_bytes = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data_bytes, headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err = Exception(f"HTTP {e.code}: {e.read().decode('utf-8', errors='ignore')}")
        err.status = e.code
        raise err

def generate_response(options=None, **kwargs):
    if options is None:
        options = kwargs
    messages = options.get("messages", [])
    tools = options.get("tools", None)
    tool_choice = options.get("tool_choice", "auto")
    temperature = options.get("temperature", 0.1)

    keys_map = discover_keys()
    if not keys_map:
        print("[GroqService.py] No GROQ_API_KEY configured.")
        return {
            "success": False,
            "error": True,
            "message": "The assistant is temporarily busy. Please try again in a few minutes.",
            "friendlyResponse": True
        }

    current_key_num = get_active_key_number()
    try:
        data = execute_call(current_key_num, messages, tools, tool_choice, temperature)
        record_success(current_key_num)
        return {
            "success": True,
            "data": data,
            "keyUsed": current_key_num
        }
    except Exception as err:
        status = getattr(err, "status", None)
        print(f"[GroqService.py] Error on Key #{current_key_num}: HTTP {status or 'unknown'}")
        if status == 429 or (status and status >= 500) or not status:
            print(f"[GroqService.py] Triggering failover rotation due to error ({status or err})...")
            next_key_num = rotate_key(f"Failover from Key #{current_key_num} due to HTTP {status or 'error'}")
            try:
                print(f"[GroqService.py] Retrying request once on Key #{next_key_num}...")
                retry_data = execute_call(next_key_num, messages, tools, tool_choice, temperature)
                record_success(next_key_num)
                return {
                    "success": True,
                    "data": retry_data,
                    "keyUsed": next_key_num
                }
            except Exception as retry_err:
                r_status = getattr(retry_err, "status", None)
                print(f"[GroqService.py] Retry failed on Key #{next_key_num}: HTTP {r_status or 'unknown'}")
        
        return {
            "success": False,
            "error": True,
            "message": "The assistant is temporarily busy. Please try again in a few minutes.",
            "friendlyResponse": True
        }

def get_usage():
    return {
        "activeKey": in_memory_state["activeKey"],
        "key1Requests": in_memory_state["key1Requests"],
        "key2Requests": in_memory_state["key2Requests"],
        "lastReset": in_memory_state["lastReset"],
        "model": os.environ.get("GROQ_MODEL", "llama-3.1-8b-instant")
    }
