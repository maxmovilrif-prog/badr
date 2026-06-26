from fastapi import FastAPI, APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import logging
import random
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone

from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone
from emergentintegrations.llm.openai import OpenAISpeechToText, OpenAITextToSpeech

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')

# Secure upload directories
UPLOAD_DIR = ROOT_DIR / 'uploads'
SIGN_DIR = UPLOAD_DIR / 'sign_language'
AUDIO_DIR = UPLOAD_DIR / 'audio'
for d in (SIGN_DIR, AUDIO_DIR):
    d.mkdir(parents=True, exist_ok=True)

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
    kind: str = "text"  # 'text' | 'voice' | 'sign'
    language: Optional[str] = None
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


# ---------- Helpers ----------
async def save_message(session_id: str, role: str, content: str, kind: str = "text", language: Optional[str] = None) -> Message:
    msg = Message(session_id=session_id, role=role, content=content, kind=kind, language=language)
    await db.messages.insert_one(msg.model_dump())
    return msg


async def build_history_context(session_id: str, limit: int = 16) -> str:
    cursor = db.messages.find({"session_id": session_id}, {"_id": 0}).sort("timestamp", -1).limit(limit)
    docs = await cursor.to_list(limit)
    docs.reverse()
    if not docs:
        return ""
    lines = [("User: " + d["content"]) if d["role"] == "user" else ("Assistant: " + d["content"]) for d in docs]
    return "\n\nRecent conversation so far:\n" + "\n".join(lines)


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


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
