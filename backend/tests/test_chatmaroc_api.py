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



# ---- Conversations CRUD ----
CLIENT_ID = f"TEST_client_{uuid.uuid4().hex[:8]}"


def test_create_conversation(session):
    r = session.post(f"{API}/conversations", json={"client_id": CLIENT_ID}, timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "id" in data
    assert data["client_id"] == CLIENT_ID
    assert data["title"] == "New chat"
    assert "created_at" in data
    assert "updated_at" in data
    pytest.conv_id_a = data["id"]


def test_list_conversations(session):
    # Create another to confirm sorting by updated_at desc
    time.sleep(1)
    r2 = session.post(f"{API}/conversations", json={"client_id": CLIENT_ID}, timeout=10)
    assert r2.status_code == 200
    pytest.conv_id_b = r2.json()["id"]

    r = session.get(f"{API}/conversations", params={"client_id": CLIENT_ID}, timeout=10)
    assert r.status_code == 200
    convs = r.json()
    assert isinstance(convs, list)
    ids = [c["id"] for c in convs]
    assert pytest.conv_id_a in ids
    assert pytest.conv_id_b in ids
    # The most recently created (b) should come before a
    assert ids.index(pytest.conv_id_b) < ids.index(pytest.conv_id_a)


def test_chat_auto_titles_conversation(session):
    conv_id = pytest.conv_id_a
    first_msg = "كيفاش نطيب طاجين د الدجاج؟"
    with session.post(
        f"{API}/chat",
        json={"session_id": conv_id, "message": first_msg, "language": "darija", "kind": "text"},
        stream=True, timeout=60,
    ) as r:
        assert r.status_code == 200
        # consume stream
        for line in r.iter_lines(decode_unicode=True):
            if line and line.startswith("data:") and '"done"' in line:
                break

    time.sleep(0.5)
    r2 = session.get(f"{API}/conversations", params={"client_id": CLIENT_ID}, timeout=10)
    assert r2.status_code == 200
    convs = r2.json()
    target = next((c for c in convs if c["id"] == conv_id), None)
    assert target is not None
    # title should now be derived from the first message (not "New chat")
    assert target["title"] != "New chat"
    assert target["title"].startswith(first_msg[:10])
    # preview should reflect message
    assert first_msg[:20] in target["preview"]
    # conv_id_a should now be at top (more recent updated_at)
    assert convs[0]["id"] == conv_id


def test_rename_conversation(session):
    conv_id = pytest.conv_id_b
    new_title = "My Renamed Chat"
    r = session.patch(f"{API}/conversations/{conv_id}", json={"title": new_title}, timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["title"] == new_title
    # Verify persistence
    r2 = session.get(f"{API}/conversations", params={"client_id": CLIENT_ID}, timeout=10)
    target = next((c for c in r2.json() if c["id"] == conv_id), None)
    assert target is not None
    assert target["title"] == new_title


def test_rename_conversation_truncates(session):
    conv_id = pytest.conv_id_b
    long_title = "x" * 200
    r = session.patch(f"{API}/conversations/{conv_id}", json={"title": long_title}, timeout=10)
    assert r.status_code == 200
    # backend truncates at 60
    assert len(r.json()["title"]) <= 60


def test_delete_conversation_and_messages(session):
    conv_id = pytest.conv_id_a
    # Ensure messages exist for this conversation (from auto-title test)
    r_msgs = session.get(f"{API}/messages/{conv_id}", timeout=10)
    assert r_msgs.status_code == 200
    assert len(r_msgs.json()) >= 1

    r = session.delete(f"{API}/conversations/{conv_id}", timeout=10)
    assert r.status_code == 200
    assert r.json().get("deleted", 0) == 1

    # messages must be wiped
    r2 = session.get(f"{API}/messages/{conv_id}", timeout=10)
    assert r2.status_code == 200
    assert r2.json() == []

    # conversation no longer listed
    r3 = session.get(f"{API}/conversations", params={"client_id": CLIENT_ID}, timeout=10)
    ids = [c["id"] for c in r3.json()]
    assert conv_id not in ids


# ---- Features endpoint ----
def test_features_endpoint(session):
    r = session.get(f"{API}/features", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert "web_search" in data
    assert data["web_search"] is True, "web_search should be enabled (TAVILY_API_KEY is set)"


# ---- Web search chat (live Tavily + Claude) ----
WS_SESSION_ID = f"TEST_ws_{uuid.uuid4().hex[:10]}"


def test_web_search_chat_streams_sources_and_answer(session):
    payload = {
        "session_id": WS_SESSION_ID,
        "message": "What is the latest news about Morocco football in 2026?",
        "language": "english",
        "kind": "search",
    }
    sources = None
    full_text = ""
    deltas = 0
    done = False
    with session.post(f"{API}/web-search-chat", json=payload, stream=True, timeout=90) as r:
        assert r.status_code == 200, r.text
        assert "text/event-stream" in r.headers.get("content-type", "")
        for line in r.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data:"):
                continue
            try:
                ev = json.loads(line[5:].strip())
            except Exception:
                continue
            if "sources" in ev:
                sources = ev["sources"]
            if "delta" in ev:
                full_text += ev["delta"]
                deltas += 1
            if ev.get("error"):
                pytest.fail(f"web-search-chat error: {ev['error']}")
            if ev.get("done"):
                done = True
                break
    assert done, "stream did not finish"
    assert isinstance(sources, list) and len(sources) > 0, f"expected non-empty sources list, got {sources}"
    for s in sources:
        assert "title" in s and "url" in s
        assert isinstance(s["url"], str) and s["url"].startswith("http")
    assert deltas > 0, "no delta tokens"
    assert len(full_text.strip()) > 0, "empty assistant reply"

    # Verify assistant message persisted WITH sources
    time.sleep(1)
    r2 = session.get(f"{API}/messages/{WS_SESSION_ID}", timeout=10)
    assert r2.status_code == 200
    msgs = r2.json()
    assistants = [m for m in msgs if m["role"] == "assistant"]
    assert len(assistants) >= 1
    last_a = assistants[-1]
    assert last_a.get("sources"), "assistant message should have non-empty sources list"
    assert isinstance(last_a["sources"], list) and len(last_a["sources"]) > 0


def test_web_search_chat_empty(session):
    r = session.post(f"{API}/web-search-chat", json={"session_id": WS_SESSION_ID, "message": "   ", "language": "english"}, timeout=10)
    assert r.status_code == 400


# ---- Chat with file (Gemini) ----
CF_SESSION_ID = f"TEST_cf_{uuid.uuid4().hex[:10]}"


def _consume_sse(r, timeout_label="stream"):
    full = ""
    done = False
    deltas = 0
    for line in r.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data:"):
            continue
        try:
            ev = json.loads(line[5:].strip())
        except Exception:
            continue
        if "delta" in ev:
            full += ev["delta"]
            deltas += 1
        if ev.get("error"):
            pytest.fail(f"{timeout_label} error: {ev['error']}")
        if ev.get("done"):
            done = True
            break
    return full, deltas, done


def test_chat_with_file_text(session):
    txt = b"ChatMaroc is a Moroccan AI chat platform. It supports Darija, Tamazight, Arabic, French, English and Spanish. The capital of Morocco is Rabat."
    files = {"file": ("notes.txt", txt, "text/plain")}
    data = {"session_id": CF_SESSION_ID, "message": "Summarize this in one short sentence.", "language": "english"}
    with session.post(f"{API}/chat-with-file", files=files, data=data, stream=True, timeout=90) as r:
        assert r.status_code == 200, r.text
        assert "text/event-stream" in r.headers.get("content-type", "")
        full, deltas, done = _consume_sse(r, "chat-with-file txt")
    assert done
    assert deltas > 0
    assert len(full.strip()) > 0

    # Verify user msg (kind=file) + assistant msg persisted
    time.sleep(1)
    r2 = session.get(f"{API}/messages/{CF_SESSION_ID}", timeout=10)
    msgs = r2.json()
    kinds = [m.get("kind") for m in msgs]
    roles = [m.get("role") for m in msgs]
    assert "file" in kinds, f"expected a user message with kind=file, got kinds={kinds}"
    assert "assistant" in roles


def test_chat_with_file_png(session):
    # Smallest valid PNG (1x1 red pixel)
    png = bytes.fromhex(
        "89504E470D0A1A0A0000000D49484452000000010000000108020000"
        "00907753DE0000000C49444154789C63F8CFC0000000030001"
        "5CCDFF690000000049454E44AE426082"
    )
    files = {"file": ("dot.png", png, "image/png")}
    data = {"session_id": CF_SESSION_ID, "message": "What color is this image?", "language": "english"}
    with session.post(f"{API}/chat-with-file", files=files, data=data, stream=True, timeout=120) as r:
        assert r.status_code == 200, r.text
        full, deltas, done = _consume_sse(r, "chat-with-file png")
    assert done, "png stream did not finish"
    assert deltas > 0, "no delta tokens for png"
    assert len(full.strip()) > 0, "empty vision analysis"


def test_chat_with_file_unsupported_type(session):
    files = {"file": ("archive.zip", b"PK\x03\x04dummyzipbytes", "application/zip")}
    data = {"session_id": CF_SESSION_ID, "message": "what is this?", "language": "english"}
    r = session.post(f"{API}/chat-with-file", files=files, data=data, timeout=15)
    assert r.status_code == 415, f"expected 415, got {r.status_code}: {r.text[:200]}"


def test_chat_with_file_empty(session):
    files = {"file": ("empty.txt", b"", "text/plain")}
    data = {"session_id": CF_SESSION_ID, "message": "?", "language": "english"}
    r = session.post(f"{API}/chat-with-file", files=files, data=data, timeout=15)
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:200]}"


# ---- Settings (new) ----
def test_get_settings_default_shape(session):
    r = session.get(f"{API}/settings", timeout=10)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "upload_ttl_hours" in d
    assert "upload_ttl_seconds" in d
    assert "web_search" in d
    assert isinstance(d["upload_ttl_seconds"], int)
    assert d["upload_ttl_seconds"] > 0
    assert d["web_search"] is True


def test_put_settings_persists_and_clamps(session):
    # set to 24h
    r = session.put(f"{API}/settings", json={"upload_ttl_hours": 24}, timeout=10)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["upload_ttl_hours"] == 24
    assert d["upload_ttl_seconds"] == 24 * 3600

    # GET reflects it
    g = session.get(f"{API}/settings", timeout=10).json()
    assert g["upload_ttl_seconds"] == 24 * 3600
    assert round(g["upload_ttl_hours"]) == 24

    # clamp high (>720 -> 720)
    r2 = session.put(f"{API}/settings", json={"upload_ttl_hours": 9999}, timeout=10)
    assert r2.status_code == 200
    assert r2.json()["upload_ttl_hours"] == 720
    assert r2.json()["upload_ttl_seconds"] == 720 * 3600

    # clamp low (<1 -> 1)
    r3 = session.put(f"{API}/settings", json={"upload_ttl_hours": 0}, timeout=10)
    assert r3.status_code == 200
    assert r3.json()["upload_ttl_hours"] == 1
    assert r3.json()["upload_ttl_seconds"] == 3600

    # negative also clamps to 1
    r4 = session.put(f"{API}/settings", json={"upload_ttl_hours": -5}, timeout=10)
    assert r4.status_code == 200
    assert r4.json()["upload_ttl_hours"] == 1

    # reset to a small value (6h) so auto-cleanup stays active
    rr = session.put(f"{API}/settings", json={"upload_ttl_hours": 6}, timeout=10)
    assert rr.status_code == 200
    assert rr.json()["upload_ttl_hours"] == 6


def test_admin_cleanup_uploads(session):
    r = session.post(f"{API}/admin/cleanup-uploads", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "removed" in d and isinstance(d["removed"], int) and d["removed"] >= 0
    assert "ttl_seconds" in d and isinstance(d["ttl_seconds"], int) and d["ttl_seconds"] > 0


def test_cleanup_new_feature_sessions(session):
    for sid in (WS_SESSION_ID, CF_SESSION_ID):
        try:
            session.delete(f"{API}/messages/{sid}", timeout=10)
        except Exception:
            pass


# ---- Share / Unshare / Shared (NEW) ----
SHARE_CLIENT_ID = f"TEST_share_{uuid.uuid4().hex[:8]}"


def test_share_unshare_shared_flow(session):
    # create conv
    r = session.post(f"{API}/conversations", json={"client_id": SHARE_CLIENT_ID}, timeout=10)
    assert r.status_code == 200
    conv_id = r.json()["id"]

    # send a message so there is content to share
    with session.post(
        f"{API}/chat",
        json={"session_id": conv_id, "message": "Hello, short hi.", "language": "english", "kind": "text"},
        stream=True, timeout=60,
    ) as rr:
        assert rr.status_code == 200
        for line in rr.iter_lines(decode_unicode=True):
            if line and '"done"' in line:
                break

    # share -> returns token, is_shared True
    s1 = session.post(f"{API}/conversations/{conv_id}/share", timeout=10)
    assert s1.status_code == 200, s1.text
    d1 = s1.json()
    assert d1["is_shared"] is True
    assert isinstance(d1["share_token"], str) and len(d1["share_token"]) > 8
    token = d1["share_token"]

    # idempotent — second call returns same token
    s2 = session.post(f"{API}/conversations/{conv_id}/share", timeout=10)
    assert s2.status_code == 200
    assert s2.json()["share_token"] == token

    # GET shared
    g = session.get(f"{API}/shared/{token}", timeout=10)
    assert g.status_code == 200, g.text
    body = g.json()
    assert "title" in body
    assert isinstance(body["messages"], list) and len(body["messages"]) >= 2
    roles = [m["role"] for m in body["messages"]]
    assert "user" in roles and "assistant" in roles

    # unknown token -> 404
    g404 = session.get(f"{API}/shared/{uuid.uuid4().hex}", timeout=10)
    assert g404.status_code == 404

    # unshare
    u = session.post(f"{API}/conversations/{conv_id}/unshare", timeout=10)
    assert u.status_code == 200
    assert u.json()["is_shared"] is False

    # GET shared now 404
    g2 = session.get(f"{API}/shared/{token}", timeout=10)
    assert g2.status_code == 404

    # cleanup
    session.delete(f"{API}/conversations/{conv_id}", timeout=10)


def test_share_nonexistent_conversation(session):
    r = session.post(f"{API}/conversations/{uuid.uuid4().hex}/share", timeout=10)
    assert r.status_code == 404


def test_cleanup_remaining_conversations(session):
    # Final cleanup: delete remaining test conversations
    r = session.get(f"{API}/conversations", params={"client_id": CLIENT_ID}, timeout=10)
    for c in r.json():
        session.delete(f"{API}/conversations/{c['id']}", timeout=10)
    r2 = session.get(f"{API}/conversations", params={"client_id": CLIENT_ID}, timeout=10)
    assert r2.json() == []
