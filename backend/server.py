from fastapi import FastAPI, APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import time
import logging
import random
import asyncio
import mimetypes
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone

from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone, FileContentWithMimeType
from emergentintegrations.llm.openai import OpenAISpeechToText, OpenAITextToSpeech

try:
    from tavily import TavilyClient
except Exception:
    TavilyClient = None

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')
TAVILY_API_KEY = os.environ.get('TAVILY_API_KEY')

# Secure upload directories
UPLOAD_DIR = ROOT_DIR / 'uploads'
SIGN_DIR = UPLOAD_DIR / 'sign_language'
AUDIO_DIR = UPLOAD_DIR / 'audio'
FILES_DIR = UPLOAD_DIR / 'files'
for d in (SIGN_DIR, AUDIO_DIR, FILES_DIR):
    d.mkdir(parents=True, exist_ok=True)

# Periodic upload cleanup config
UPLOAD_TTL_SECONDS = int(os.environ.get('UPLOAD_TTL_SECONDS', str(6 * 3600)))  # delete files older than 6h
CLEANUP_INTERVAL_SECONDS = int(os.environ.get('CLEANUP_INTERVAL_SECONDS', str(30 * 60)))  # every 30 min

app = FastAPI(title="ChatMaroc API")
api_router = APIRouter(prefix="/api")

# ---------- Language config ----------
LANGUAGES = {
    "darija": {"label": "الدارجة المغربية (Darija)", "iso": "ar"},
    "tamazight-rif": {"label": "ⵜⴰⵔⵉⴼⵉⵜ (Tamazight - Tarifit)", "iso": "ar"},
    "tamazight-atlas": {"label": "ⵜⴰⵎⴰⵣⵉⵖⵜ (Tamazight - Central Atlas)", "iso": "ar"},
    "tamazight-souss": {"label": "ⵜⴰⵛⵍⵃⵉⵜ (Tamazight - Tashelhit/Souss)", "iso": "ar"},
    "arabic": {"label": "العربية الفصحى (Arabic)", "iso": "ar"},
    "french": {"label": "Français (French)", "iso": "fr"},
    "english": {"label": "English", "iso": "en"},
    "spanish": {"label": "Español (Spanish)", "iso": "es"},
}

SYSTEM_PROMPT = (
    "You are ChatMaroc, a warm, intelligent and culturally-aware AI assistant built for Morocco. "
    "You are fluent in Moroccan Darija (الدارجة المغربية), Amazigh/Tamazight in all Moroccan variants — Tarifit/ⵜⴰⵔⵉⴼⵉⵜ (Rif), Central Atlas Tamazight/ⵜⴰⵎⴰⵣⵉⵖⵜ, and Tashelhit/ⵜⴰⵛⵍⵃⵉⵜ (Souss) — "
    "MSA, French, English and Spanish. You understand Moroccan culture, dialects, food, geography and daily life. "
    "Always answer in the language the user selected. When the language is Darija, reply in natural Moroccan Arabic (Arabic script), "
    "and you may mix in common French/Latin words the way Moroccans naturally do. When the language is Tamazight, prefer Tifinagh script (ⵜⵉⴼⵉⵏⴰⵖ) "
    "with a short transliteration in parentheses when helpful. Be friendly, concise, and inclusive. "
    "This app is also used by deaf and mute users who communicate via sign-language video, so be patient, clear and supportive."
)


# ---------- Models ----------
class Message(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    role: str  # 'user' | 'assistant'
    content: str
    kind: str = "text"  # 'text' | 'voice' | 'sign' | 'file' | 'search'
    language: Optional[str] = None
    sources: Optional[List[dict]] = None
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ChatRequest(BaseModel):
    session_id: str
    message: str
    language: str = "darija"
    kind: str = "text"


class TtsRequest(BaseModel):
    text: str
    voice: str = "nova"
    language: str = "darija"


class Conversation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_id: str
    title: str = "New chat"
    preview: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ConversationCreate(BaseModel):
    client_id: str
    title: Optional[str] = None


class ConversationUpdate(BaseModel):
    title: str


# ---------- Helpers ----------
async def save_message(session_id: str, role: str, content: str, kind: str = "text", language: Optional[str] = None, sources: Optional[List[dict]] = None) -> Message:
    msg = Message(session_id=session_id, role=role, content=content, kind=kind, language=language, sources=sources)
    await db.messages.insert_one(msg.model_dump())
    return msg


async def tavily_search(query: str, max_results: int = 5):
    if not TAVILY_API_KEY or TavilyClient is None:
        raise RuntimeError("Web search is not configured (missing TAVILY_API_KEY).")
    def _run():
        client = TavilyClient(api_key=TAVILY_API_KEY)
        return client.search(query=query, max_results=max_results, search_depth="advanced")
    return await asyncio.to_thread(_run)


async def build_history_context(session_id: str, limit: int = 16) -> str:
    cursor = db.messages.find({"session_id": session_id}, {"_id": 0}).sort("timestamp", -1).limit(limit)
    docs = await cursor.to_list(limit)
    docs.reverse()
    if not docs:
        return ""
    lines = [("User: " + d["content"]) if d["role"] == "user" else ("Assistant: " + d["content"]) for d in docs]
    return "\n\nRecent conversation so far:\n" + "\n".join(lines)


async def touch_conversation(conversation_id: str, last_user_message: Optional[str] = None):
    """Update a conversation's updated_at, preview, and auto-title (from first message)."""
    conv = await db.conversations.find_one({"id": conversation_id}, {"_id": 0})
    if not conv:
        return
    update = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if last_user_message:
        update["preview"] = last_user_message[:80]
        if conv.get("title") in (None, "", "New chat"):
            title = last_user_message.strip().split("\n")[0][:42]
            update["title"] = title or "New chat"
    await db.conversations.update_one({"id": conversation_id}, {"$set": update})


def make_chat(session_id: str, language: str, history: str) -> LlmChat:
    lang_label = LANGUAGES.get(language, LANGUAGES["english"])["label"]
    system = SYSTEM_PROMPT + f"\n\nThe user's selected language is: {lang_label}. Reply in this language." + history
    return LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system,
    ).with_model("anthropic", "claude-sonnet-4-6")


def _has_tifinagh(text: str) -> bool:
    return any(0x2D30 <= ord(c) <= 0x2D7F for c in text)


async def transliterate_for_tts(text: str) -> str:
    """Tifinagh script is not pronounceable by TTS engines. Convert Amazigh/Tamazight
    text written in Tifinagh into a phonetic Latin transliteration so the TTS sounds natural."""
    if not _has_tifinagh(text):
        return text
    try:
        translit = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"translit-{uuid.uuid4()}",
            system_message=(
                "You are a strict transliteration engine for Amazigh/Tamazight. "
                "Convert any Tifinagh (ⵜⵉⴼⵉⵏⴰⵖ) text into a natural phonetic LATIN-script transliteration "
                "that a French/Spanish text-to-speech voice can pronounce well. "
                "Keep words already in Latin/Arabic/French as they are. "
                "Output ONLY the transliterated text, with no quotes, labels or explanations."
            ),
        ).with_model("anthropic", "claude-sonnet-4-6")
        result = await translit.send_message(UserMessage(text=text))
        return (result or text).strip() if isinstance(result, str) else text
    except Exception as e:
        logger.error(f"Transliteration failed: {e}")
        return text


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"message": "ChatMaroc API is running", "service": "chatmaroc"}


@api_router.get("/languages")
async def get_languages():
    return {"languages": [{"key": k, "label": v["label"]} for k, v in LANGUAGES.items()]}


@api_router.post("/conversations", response_model=Conversation)
async def create_conversation(req: ConversationCreate):
    conv = Conversation(client_id=req.client_id, title=req.title or "New chat")
    await db.conversations.insert_one(conv.model_dump())
    return conv


@api_router.get("/conversations", response_model=List[Conversation])
async def list_conversations(client_id: str):
    docs = await db.conversations.find({"client_id": client_id}, {"_id": 0}).sort("updated_at", -1).to_list(200)
    return docs


@api_router.patch("/conversations/{conversation_id}", response_model=Conversation)
async def rename_conversation(conversation_id: str, req: ConversationUpdate):
    await db.conversations.update_one(
        {"id": conversation_id},
        {"$set": {"title": req.title[:60], "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    conv = await db.conversations.find_one({"id": conversation_id}, {"_id": 0})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


@api_router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    await db.messages.delete_many({"session_id": conversation_id})
    res = await db.conversations.delete_one({"id": conversation_id})
    return {"deleted": res.deleted_count}


@api_router.get("/messages/{session_id}", response_model=List[Message])
async def get_messages(session_id: str):
    docs = await db.messages.find({"session_id": session_id}, {"_id": 0}).sort("timestamp", 1).to_list(1000)
    return docs


@api_router.delete("/messages/{session_id}")
async def clear_messages(session_id: str):
    res = await db.messages.delete_many({"session_id": session_id})
    return {"deleted": res.deleted_count}


@api_router.post("/chat")
async def chat(req: ChatRequest):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Empty message")
    await save_message(req.session_id, "user", req.message, kind=req.kind, language=req.language)
    await touch_conversation(req.session_id, req.message)
    history = await build_history_context(req.session_id)
    chat_client = make_chat(req.session_id, req.language, history)

    async def event_generator():
        full = ""
        try:
            async for ev in chat_client.stream_message(UserMessage(text=req.message)):
                if isinstance(ev, TextDelta):
                    full += ev.content
                    yield f"data: {json.dumps({'delta': ev.content})}\n\n"
                elif isinstance(ev, StreamDone):
                    break
        except Exception as e:
            logger.error(f"Chat stream error: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        if full.strip():
            await save_message(req.session_id, "assistant", full, kind="text", language=req.language)
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@api_router.post("/chat-with-file")
async def chat_with_file(
    session_id: str = Form(...),
    message: str = Form(""),
    language: str = Form("darija"),
    file: UploadFile = File(...),
):
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 20MB)")

    filename = file.filename or "file"
    ext = Path(filename).suffix
    mime = file.content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"
    allowed = {
        "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif",
        "application/pdf", "text/plain", "text/csv",
    }
    if mime not in allowed:
        raise HTTPException(status_code=415, detail=f"Unsupported file type: {mime}")

    file_id = str(uuid.uuid4())
    file_path = FILES_DIR / f"{file_id}{ext}"
    with open(file_path, "wb") as f:
        f.write(content)

    user_note = message.strip() or "Please analyze this file and summarize the key points."
    display = f"📎 {filename}" + (f"\n{message.strip()}" if message.strip() else "")
    await save_message(session_id, "user", display, kind="file", language=language)
    await touch_conversation(session_id, f"📎 {filename}")
    history = await build_history_context(session_id)

    lang_label = LANGUAGES.get(language, LANGUAGES["english"])["label"]
    system = SYSTEM_PROMPT + f"\n\nThe user's selected language is: {lang_label}. Reply in this language." + history
    file_chat = LlmChat(
        api_key=EMERGENT_LLM_KEY, session_id=session_id, system_message=system,
    ).with_model("gemini", "gemini-2.5-flash")
    file_content = FileContentWithMimeType(file_path=str(file_path), mime_type=mime)

    async def event_generator():
        full = ""
        try:
            async for ev in file_chat.stream_message(UserMessage(text=user_note, file_contents=[file_content])):
                if isinstance(ev, TextDelta):
                    full += ev.content
                    yield f"data: {json.dumps({'delta': ev.content})}\n\n"
                elif isinstance(ev, StreamDone):
                    break
        except Exception as e:
            logger.error(f"File chat error: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        if full.strip():
            await save_message(session_id, "assistant", full, kind="text", language=language)
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        event_generator(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@api_router.post("/web-search-chat")
async def web_search_chat(req: ChatRequest):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Empty message")
    await save_message(req.session_id, "user", req.message, kind="search", language=req.language)
    await touch_conversation(req.session_id, req.message)

    try:
        search = await asyncio.wait_for(tavily_search(req.message, 6), timeout=20)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Web search timed out. Please try again.")
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

    results = search.get("results", []) if isinstance(search, dict) else []
    sources = [
        {
            "title": r.get("title") or r.get("url"),
            "url": r.get("url"),
            "snippet": (r.get("content") or "").strip()[:220],
        }
        for r in results if r.get("url")
    ]
    context = "\n\n".join(
        f"[{i + 1}] {r.get('title', '')}\nURL: {r.get('url', '')}\n{(r.get('content') or '')[:1200]}"
        for i, r in enumerate(results)
    ) or "No web results found."

    history = await build_history_context(req.session_id)
    lang_label = LANGUAGES.get(req.language, LANGUAGES["english"])["label"]
    system = (
        SYSTEM_PROMPT
        + f"\n\nThe user's selected language is: {lang_label}. Reply in this language."
        + "\n\nYou are given LIVE web search results. Answer the user's question accurately using them, "
        "synthesize a clear response, and cite sources inline using bracket numbers like [1], [2] that match "
        "the numbered results. Prefer recent, reliable information."
        + history
    )
    chat_client = LlmChat(
        api_key=EMERGENT_LLM_KEY, session_id=req.session_id, system_message=system,
    ).with_model("anthropic", "claude-sonnet-4-6")
    prompt = f"Question: {req.message}\n\nLive web search results:\n{context}\n\nAnswer in {lang_label} with inline [n] citations."

    async def event_generator():
        full = ""
        yield f"data: {json.dumps({'sources': sources})}\n\n"
        try:
            async for ev in chat_client.stream_message(UserMessage(text=prompt)):
                if isinstance(ev, TextDelta):
                    full += ev.content
                    yield f"data: {json.dumps({'delta': ev.content})}\n\n"
                elif isinstance(ev, StreamDone):
                    break
        except Exception as e:
            logger.error(f"Web search chat error: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        if full.strip():
            await save_message(req.session_id, "assistant", full, kind="text", language=req.language, sources=sources)
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        event_generator(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@api_router.get("/features")
async def get_features():
    return {"web_search": bool(TAVILY_API_KEY and TavilyClient is not None)}


def cleanup_old_uploads(ttl_seconds: int = UPLOAD_TTL_SECONDS) -> int:
    """Delete uploaded files (sign videos, audio, attachments) older than ttl_seconds."""
    now = time.time()
    removed = 0
    for d in (SIGN_DIR, AUDIO_DIR, FILES_DIR):
        for p in d.glob("*"):
            try:
                if p.is_file() and (now - p.stat().st_mtime) > ttl_seconds:
                    p.unlink()
                    removed += 1
            except Exception as e:
                logger.error(f"Cleanup error for {p}: {e}")
    if removed:
        logger.info(f"Upload cleanup removed {removed} old file(s)")
    return removed


@api_router.post("/admin/cleanup-uploads")
async def admin_cleanup_uploads(ttl_seconds: Optional[int] = None):
    removed = cleanup_old_uploads(ttl_seconds if ttl_seconds is not None else UPLOAD_TTL_SECONDS)
    return {"removed": removed, "ttl_seconds": ttl_seconds if ttl_seconds is not None else UPLOAD_TTL_SECONDS}


@api_router.post("/transcribe")
async def transcribe(audio: UploadFile = File(...), language: str = Form("darija")):
    iso = LANGUAGES.get(language, LANGUAGES["english"])["iso"]
    ext = Path(audio.filename or "audio.webm").suffix or ".webm"
    file_path = AUDIO_DIR / f"{uuid.uuid4()}{ext}"
    content = await audio.read()
    with open(file_path, "wb") as f:
        f.write(content)
    try:
        stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
        with open(file_path, "rb") as af:
            response = await stt.transcribe(
                file=af,
                model="whisper-1",
                response_format="json",
                language=iso,
            )
        text = response.text if hasattr(response, "text") else str(response)
        return {"text": text.strip()}
    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")


@api_router.post("/tts")
async def tts(req: TtsRequest):
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty text")
    voice = req.voice if req.voice in {"alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"} else "nova"
    speak_text = await transliterate_for_tts(text)
    speak_text = speak_text[:4000]
    try:
        engine = OpenAITextToSpeech(api_key=EMERGENT_LLM_KEY)
        audio_bytes = await engine.generate_speech(text=speak_text, model="tts-1", voice=voice, response_format="mp3")
        return StreamingResponse(iter([audio_bytes]), media_type="audio/mpeg")
    except Exception as e:
        logger.error(f"TTS failed: {e}")
        raise HTTPException(status_code=500, detail=f"TTS failed: {e}")


@api_router.post("/process-sign-language")
async def process_sign_language(session_id: str = Form(...), video: UploadFile = File(...), language: str = Form("darija")):
    if not (video.content_type and "video" in video.content_type) and not (video.filename or "").endswith(".webm"):
        raise HTTPException(status_code=400, detail="A video file is required")

    file_id = str(uuid.uuid4())
    file_path = SIGN_DIR / f"{file_id}.webm"
    content = await video.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty video file")
    with open(file_path, "wb") as f:
        f.write(content)

    # ---- PLACEHOLDER: simulated AI sign-language gesture recognition ----
    sample_gestures = [
        "Hello / السلام", "Thank you / شكرا", "How are you? / كي داير؟",
        "Yes / واخا", "Help / عافاك عاوني", "I am happy / أنا فرحان",
    ]
    recognized = random.choice(sample_gestures)
    confidence = round(random.uniform(0.72, 0.97), 2)

    await db.sign_uploads.insert_one({
        "id": file_id,
        "session_id": session_id,
        "path": str(file_path),
        "size_bytes": len(content),
        "recognized_gesture": recognized,
        "confidence": confidence,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    note = f"[Sign language video] Recognized gesture (simulated): {recognized}"
    await save_message(session_id, "user", note, kind="sign", language=language)
    await touch_conversation(session_id, note)

    return {
        "id": file_id,
        "recognized_gesture": recognized,
        "confidence": confidence,
        "note": "This is a simulated placeholder response. Real sign-language gesture recognition can be plugged in here.",
    }


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def _cleanup_loop():
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
        try:
            cleanup_old_uploads()
        except Exception as e:
            logger.error(f"Cleanup loop error: {e}")


@app.on_event("startup")
async def start_cleanup_task():
    try:
        cleanup_old_uploads()
    except Exception as e:
        logger.error(f"Initial cleanup error: {e}")
    app.state.cleanup_task = asyncio.create_task(_cleanup_loop())


@app.on_event("shutdown")
async def shutdown_db_client():
    task = getattr(app.state, "cleanup_task", None)
    if task:
        task.cancel()
    client.close()
