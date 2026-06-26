# ChatMaroc — PRD

## Original Problem Statement
Build a full-stack AI assistant "ChatMaroc": React chat UI with text + voice messages, global language support focused on Moroccan Darija and Tamazight (Tarifit/Atlas), plus a dedicated webcam button for deaf/mute users to record short sign-language videos (.webm) sent to the backend. FastAPI backend with secure endpoints for text/audio/video, a POST /api/process-sign-language that saves the video and returns a simulated placeholder gesture recognition, and clean CORS.

## Architecture
- Frontend: React (CRA/craco) + Tailwind + shadcn/ui + framer-motion + sonner. Single page `pages/ChatMaroc.jsx`, modal `components/SignLanguageRecorder.jsx`.
- Backend: FastAPI + Motor/MongoDB. All routes under `/api`.
- AI: Claude Sonnet 4.6 (text chat, SSE streaming) + OpenAI Whisper (STT) via emergentintegrations + EMERGENT_LLM_KEY.
- No auth. Session id generated client-side (localStorage).

## User Personas
- Moroccan users wanting an assistant fluent in Darija/Tamazight.
- Deaf/mute users communicating via sign-language video.
- Multilingual users (Arabic, French, English, Spanish).

## Core Requirements (static)
- Text chat (streaming), voice messages (record→transcribe→chat), sign-language video recording + placeholder recognition, language selector, accessible UI.

## Implemented (2026-06)
- GET /api/, /api/languages (8 langs incl. Tashelhit/tamazight-souss), /api/messages/{session_id}, DELETE /api/messages/{session_id}
- POST /api/chat (SSE streaming, persists turns), /api/transcribe (Whisper), /api/process-sign-language (saves .webm, simulated gesture + confidence), /api/tts (OpenAI tts-1 → mp3)
- Full chat UI: empty state + suggestions, streaming bubbles + typing indicator, mic voice recording with transcription, webcam sign-language modal (record/preview/retake/send), language dropdown, clear chat.
- Voice replies (TTS): per-message "Listen" button + header auto-speak toggle; assistant replies auto-play as audio. Works for Darija & Tamazight variants (Tarifit, Central Atlas, Tashelhit).
- TTS voice selection (Nova/Shimmer/Alloy/Coral/Onyx/Sage/Fable, persisted) + automatic Tifinagh→Latin transliteration before TTS for natural Tamazight pronunciation.
- Custom full-screen background (user-provided futuristic Moroccan riad image) with cover/centered styling + dark overlay + glass header/composer for full readability.
- PREMIUM REDESIGN (ChatDay-style, dark glassmorphism over Moroccan bg): collapsible left sidebar (New Chat + conversation history with rename/delete + language selector), top bar (model badge, voice picker, auto-speak toggle), centered "How can I help you?" empty state with suggestion chips, glass message thread, floating pill input bar (sign-language camera + text + mic + send). Fully responsive (mobile drawer). Fonts: Outfit (headings) + Figtree (body).
- Multi-conversation backend: conversations CRUD (create/list/rename/delete) scoped by client_id; chat auto-titles a conversation from its first message; delete cascades to messages.
- Verified: iteration 1 (9/9) + iteration 2 (12/12) + iteration 3 (19/19) backend tests pass; all critical frontend flows pass each iteration.

## Backlog / Remaining
- P1: Real sign-language gesture model (currently SIMULATED placeholder per spec).
- P2: TTS spoken AI replies; per-message timestamps display; conversation list/sidebar; cleanup of stored upload files; pagination for long sessions.
- P2: Reorder logger init above routes (cosmetic).

## Next Tasks
- Await user feedback; consider TTS voice replies and persisting/labeling multiple conversations.
