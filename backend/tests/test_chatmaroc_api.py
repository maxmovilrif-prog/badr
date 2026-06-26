"""Backend tests for ChatMaroc API."""
import os
import io
import json
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://darija-chat-ai.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

SESSION_ID = f"TEST_{uuid.uuid4().hex[:10]}"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    yield s
    # cleanup
    try:
        s.delete(f"{API}/messages/{SESSION_ID}", timeout=10)
    except Exception:
        pass


# ---- Health ----
def test_root(session):
    r = session.get(f"{API}/", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert "message" in data
    assert "ChatMaroc" in data["message"] or data.get("service") == "chatmaroc"


# ---- Languages ----
def test_languages(session):
    r = session.get(f"{API}/languages", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert "languages" in data
    keys = {l["key"] for l in data["languages"]}
    for required in ["darija", "tamazight-rif", "tamazight-atlas", "tamazight-souss", "arabic", "french", "english", "spanish"]:
        assert required in keys, f"missing language: {required}"
    # Verify tamazight-souss has Tashelhit label
    souss = next((l for l in data["languages"] if l["key"] == "tamazight-souss"), None)
    assert souss is not None
    assert "Tashelhit" in souss["label"] or "ⵜⴰⵛⵍⵃⵉⵜ" in souss["label"]
    assert len(data["languages"]) == 8


# ---- Chat SSE ----
def test_chat_sse_stream(session):
    payload = {"session_id": SESSION_ID, "message": "سلام، كيف داير؟ جاوب بشي جملة قصيرة.", "language": "darija", "kind": "text"}
    with session.post(f"{API}/chat", json=payload, stream=True, timeout=60) as r:
        assert r.status_code == 200
        assert "text/event-stream" in r.headers.get("content-type", "")
        full_text = ""
        done = False
        deltas = 0
        for line in r.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data:"):
                continue
            try:
                payload_data = json.loads(line[5:].strip())
            except Exception:
                continue
            if "delta" in payload_data:
                full_text += payload_data["delta"]
                deltas += 1
            if payload_data.get("done"):
                done = True
                break
            if payload_data.get("error"):
                pytest.fail(f"Chat returned error: {payload_data['error']}")
        assert done, "Stream did not finish with done:true"
        assert deltas > 0, "No delta chunks received"
        assert len(full_text.strip()) > 0, "Empty assistant reply"


def test_chat_empty_message(session):
    r = session.post(f"{API}/chat", json={"session_id": SESSION_ID, "message": "   ", "language": "darija"}, timeout=10)
    assert r.status_code == 400


# ---- Messages list ----
def test_get_messages_after_chat(session):
    # ensure prior chat persisted
    time.sleep(1)
    r = session.get(f"{API}/messages/{SESSION_ID}", timeout=10)
    assert r.status_code == 200
    msgs = r.json()
    assert isinstance(msgs, list)
    assert len(msgs) >= 2, f"expected at least 2 messages, got {len(msgs)}"
    roles = [m["role"] for m in msgs]
    assert "user" in roles
    assert "assistant" in roles
    # order: user before assistant
    user_idx = roles.index("user")
    assist_idx = roles.index("assistant")
    assert user_idx < assist_idx


# ---- Sign language ----
def test_process_sign_language(session):
    fake_webm = b"\x1a\x45\xdf\xa3" + b"\x00" * 1024  # minimal webm-ish bytes
    files = {"video": ("sign.webm", fake_webm, "video/webm")}
    data = {"session_id": SESSION_ID, "language": "darija"}
    r = session.post(f"{API}/process-sign-language", files=files, data=data, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "recognized_gesture" in body
    assert "confidence" in body
    assert "note" in body
    assert 0 < body["confidence"] <= 1

    # verify sign message persisted
    r2 = session.get(f"{API}/messages/{SESSION_ID}", timeout=10)
    msgs = r2.json()
    kinds = [m.get("kind") for m in msgs]
    assert "sign" in kinds


def test_process_sign_language_empty(session):
    files = {"video": ("sign.webm", b"", "video/webm")}
    data = {"session_id": SESSION_ID, "language": "darija"}
    r = session.post(f"{API}/process-sign-language", files=files, data=data, timeout=20)
    assert r.status_code == 400


# ---- Transcribe (real Whisper) ----
def test_transcribe_endpoint_reachable(session):
    # Send tiny dummy bytes; Whisper will likely 500; we just verify endpoint doesn't crash
    files = {"audio": ("voice.webm", b"\x1a\x45\xdf\xa3" + b"\x00" * 512, "audio/webm")}
    data = {"language": "english"}
    r = session.post(f"{API}/transcribe", files=files, data=data, timeout=60)
    assert r.status_code in (200, 400, 500), f"unexpected status {r.status_code}"
    # Should always return valid JSON
    try:
        body = r.json()
    except Exception:
        pytest.fail(f"transcribe returned non-JSON: {r.text[:200]}")
    if r.status_code == 200:
        assert "text" in body
    else:
        assert "detail" in body


# ---- TTS ----
def test_tts_basic(session):
    r = session.post(f"{API}/tts", json={"text": "السلام عليكم"}, timeout=60)
    assert r.status_code == 200, r.text
    assert "audio/mpeg" in r.headers.get("content-type", "")
    assert len(r.content) > 100, f"audio too small: {len(r.content)} bytes"
    # MP3 files start with ID3 tag or MPEG sync (0xFF 0xFB / 0xFF 0xF3 / 0xFF 0xF2)
    head = r.content[:3]
    assert head[:3] == b"ID3" or head[0] == 0xFF, f"unexpected mp3 header: {head.hex()}"


def test_tts_empty(session):
    r = session.post(f"{API}/tts", json={"text": "   "}, timeout=10)
    assert r.status_code == 400


def test_tts_custom_voice(session):
    r = session.post(f"{API}/tts", json={"text": "Hello world", "voice": "alloy"}, timeout=60)
    assert r.status_code == 200
    assert "audio/mpeg" in r.headers.get("content-type", "")
    assert len(r.content) > 100


# ---- Clear ----
def test_clear_messages(session):
    r = session.delete(f"{API}/messages/{SESSION_ID}", timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert "deleted" in body
    assert body["deleted"] >= 0
    # verify cleared
    r2 = session.get(f"{API}/messages/{SESSION_ID}", timeout=10)
    assert r2.status_code == 200
    assert r2.json() == []
