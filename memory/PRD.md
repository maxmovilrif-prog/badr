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
- LIVE WEB SEARCH (Tavily + Claude): /api/web-search-chat streams an answer with inline [n] citations and premium source CARDS (title + text snippet + domain) under the reply; globe toggle gated by /api/features; sources persisted with the assistant message.
- FILE UPLOAD + ANALYSIS (Gemini gemini-2.5-flash via Emergent key): /api/chat-with-file accepts images (png/jpg/webp/gif) and docs (pdf/txt/csv, ≤20MB); paperclip attach button + pending-file chip in the UI.
- AUTO UPLOAD CLEANUP: background task deletes uploads (sign videos/audio/files) older than a configurable retention period (default 6h) every 30min + on startup; manual POST /api/admin/cleanup-uploads; retention persisted in db.settings via GET/PUT /api/settings (clamped 1h..30d).
- UX polish: animated shimmering "Searching the web…" indicator during live web searches; Settings modal (gear icon) to pick file-retention period + clean now; premium source cards (title + snippet + domain).
- EXPORT PDF: client-side (jsPDF + html2canvas) download of the full conversation (multilingual/RTL-safe), download button in top bar.
- SHARE read-only public link: POST /api/conversations/{id}/share|unshare + GET /api/shared/{token}; ShareModal (copy link / stop sharing) + public /share/:token page (read-only, branded, with sources).
- Verified: iter 1-6 backend tests pass (32/32 latest); all critical frontend flows pass each iteration. Deployment readiness: PASS (no blockers).

## Deployment Notes
- Deploy-ready. CORS=*, all secrets in env. Add TAVILY_API_KEY in production env too.
- Uploads use local/ephemeral disk; safe because files are processed within the same request and auto-cleaned. Not a blocker.

## Integrations / Keys
- EMERGENT_LLM_KEY (Claude text, Gemini files, Whisper STT, OpenAI TTS).
- TAVILY_API_KEY (live web search) — set in backend/.env.

## Backlog / Remaining
- P1: Real sign-language gesture model (currently SIMULATED placeholder per spec).
- P2: TTS spoken AI replies; per-message timestamps display; conversation list/sidebar; cleanup of stored upload files; pagination for long sessions.
- P2: Reorder logger init above routes (cosmetic).

## Next Tasks
- Await user feedback; consider TTS voice replies and persisting/labeling multiple conversations.

## 2026-06-27
- HD LOGO CRISPNESS: central "chatmaroc.ai" emblem now uses the high-res transparent asset (1364×874) downscaled to ~384px with GPU-layer crisp rendering (`.cm-emblem`/`.cm-emblem-img` in index.css: translateZ(0), backface-visibility, -webkit-optimize-contrast, antialiased, drop-shadow glow on its own layer). Verified via screenshot — pixel-sharp, no halo. (Preview only.)
- CHAT "CONNECTION ERROR" HARDENING: backend/routing/CORS/env all verified healthy (5/5 curl + browser streams OK). Root cause of the intermittent generic error was an unguarded `JSON.parse` per SSE chunk in `consumeStream` (a partial/malformed chunk aborted the whole stream). Wrapped parse in try/catch (skip bad chunks) and surfaced the real error message instead of "Connection error." Verified chat streams with 0 console errors. (Preview only.)
- BACKGROUND REDESIGN: removed the photographic background from both ChatMaroc and SharedChat. New `<CyberBackground/>` component = dark cyberpunk base (CSS `.cm-bg` radial+linear gradients) + smooth purple/blue gradient waves drawn as crisp SVG (vector, HD at any resolution, blurred for softness). Central HD logo unchanged. Verified via screenshot, 0 console errors. (Preview only.)
- CODE-REVIEW REFACTOR: split the 860-line `ChatMaroc.jsx` into `ChatHeader`, `WelcomeScreen`, `MessageList`, `ChatComposer` + a `useTextToSpeech` hook (orchestrator now ~470 lines, all data-testids preserved). Hardened `exportPdf.js` `esc()` to also escape quotes (XSS defense-in-depth). Backend DRY: added `build_system_message()` helper used by /api/chat, /api/chat-with-file, /api/web-search-chat; moved logger init above routes. Note: backend `is None`/`is not None` left as-is (correct PEP8 idiom — the review's `is`→`==` finding was a false positive). Verified: 32/32 backend pytest + 100% frontend regression (iteration_9.json), 0 console errors, no regressions. (Preview only.)
