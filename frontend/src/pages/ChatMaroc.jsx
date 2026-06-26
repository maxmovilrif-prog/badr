import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Send, Mic, Square, Camera, Sparkles, Trash2, Loader2, Hand, Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SignLanguageRecorder } from "@/components/SignLanguageRecorder";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const getSessionId = () => {
  let id = localStorage.getItem("chatmaroc_session");
  if (!id) {
    id = `cm_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    localStorage.setItem("chatmaroc_session", id);
  }
  return id;
};

const SUGGESTIONS = [
  { label: "كيفاش نطيب طاجين؟", sub: "How do I cook a tajine?" },
  { label: "ⵎⴰⵏ ⴰⵢ ⵜⴻⵍⵍⵉⴷ?", sub: "Where are you? (Tamazight)" },
  { label: "Raconte-moi un proverbe marocain", sub: "A Moroccan proverb" },
];

export default function ChatMaroc() {
  const [sessionId] = useState(getSessionId);
  const [languages, setLanguages] = useState([]);
  const [language, setLanguage] = useState("darija");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [recordingAudio, setRecordingAudio] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [sendingSign, setSendingSign] = useState(false);

  const scrollRef = useRef(null);
  const audioRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioStreamRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, []);

  useEffect(() => {
    fetch(`${API}/languages`).then((r) => r.json()).then((d) => setLanguages(d.languages || [])).catch(() => {});
    fetch(`${API}/messages/${sessionId}`).then((r) => r.json()).then((d) => Array.isArray(d) && setMessages(d)).catch(() => {});
  }, [sessionId]);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const streamChat = async (text, kind = "text") => {
    setStreaming(true);
    const userMsg = { id: `u_${Date.now()}`, role: "user", content: text, kind };
    const aiId = `a_${Date.now()}`;
    setMessages((prev) => [...prev, userMsg, { id: aiId, role: "assistant", content: "", kind: "text" }]);

    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: text, language, kind }),
      });
      if (!res.ok || !res.body) throw new Error("Network error");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const payload = JSON.parse(line.slice(5).trim());
          if (payload.delta) {
            setMessages((prev) => prev.map((m) => m.id === aiId ? { ...m, content: m.content + payload.delta } : m));
          } else if (payload.error) {
            toast.error("AI error: " + payload.error);
          }
        }
      }
    } catch (e) {
      toast.error("Could not reach ChatMaroc. Please try again.");
      setMessages((prev) => prev.map((m) => m.id === aiId ? { ...m, content: m.content || "⚠️ Connection error." } : m));
    } finally {
      setStreaming(false);
    }
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    streamChat(text, "text");
  };

  // ---- Audio voice message ----
  const startAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      audioChunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      rec.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await transcribeAndSend(blob);
      };
      audioRecorderRef.current = rec;
      rec.start();
      setRecordingAudio(true);
    } catch (e) {
      toast.error("Microphone access denied.");
    }
  };

  const stopAudio = () => {
    audioRecorderRef.current?.stop();
    setRecordingAudio(false);
  };

  const transcribeAndSend = async (blob) => {
    setTranscribing(true);
    try {
      const fd = new FormData();
      fd.append("audio", blob, "voice.webm");
      fd.append("language", language);
      const res = await fetch(`${API}/transcribe`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Transcription failed");
      const text = (data.text || "").trim();
      if (!text) { toast.error("Couldn't hear anything. Try again."); return; }
      await streamChat(text, "voice");
    } catch (e) {
      toast.error("Voice transcription failed.");
    } finally {
      setTranscribing(false);
    }
  };

  // ---- Sign language video ----
  const handleSendSign = async (blob) => {
    setSendingSign(true);
    try {
      const fd = new FormData();
      fd.append("session_id", sessionId);
      fd.append("video", blob, "sign.webm");
      fd.append("language", language);
      const res = await fetch(`${API}/process-sign-language`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed");
      setShowCamera(false);
      toast.success(`Recognized: ${data.recognized_gesture} (${Math.round(data.confidence * 100)}%)`);
      const signNote = `🤟 Sign gesture recognized: "${data.recognized_gesture}" — ${Math.round(data.confidence * 100)}% confidence`;
      setMessages((prev) => [...prev, { id: `s_${Date.now()}`, role: "user", content: signNote, kind: "sign" }]);
      await streamChat(`The user signed: "${data.recognized_gesture}". Respond helpfully.`, "sign-hidden");
    } catch (e) {
      toast.error("Could not process the sign language video.");
    } finally {
      setSendingSign(false);
    }
  };

  const clearChat = async () => {
    await fetch(`${API}/messages/${sessionId}`, { method: "DELETE" }).catch(() => {});
    setMessages([]);
    toast.success("Conversation cleared");
  };

  const currentLangLabel = languages.find((l) => l.key === language)?.label || "Darija";

  return (
    <div className="min-h-screen bg-[#F9F7F3] flex flex-col">
      {/* Header */}
      <header
        className="sticky top-0 z-30 backdrop-blur-xl bg-white/70 border-b border-white/40"
        data-testid="app-header"
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#264653] flex items-center justify-center shadow-md">
              <Sparkles className="w-5 h-5 text-[#E9C46A]" />
            </div>
            <div>
              <h1 className="font-heading text-2xl leading-none text-[#2C2E33]" data-testid="app-title">ChatMaroc</h1>
              <p className="text-xs text-[#6B6A3A] mt-0.5">Darija · Tamazight · & more</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger
                className="w-[170px] rounded-full border-[#E5E1D8] bg-white/80 focus:ring-2 focus:ring-[#2A9D8F]"
                data-testid="language-selector"
              >
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent>
                {languages.map((l) => (
                  <SelectItem key={l.key} value={l.key} data-testid={`language-option-${l.key}`}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              onClick={clearChat}
              className="rounded-full text-[#6B6A3A] hover:bg-[#F0EDE5] hover:text-[#8C3F2D]"
              aria-label="Clear conversation"
              data-testid="clear-chat-button"
            >
              <Trash2 className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          className="cm-scroll h-[calc(100vh-180px)] overflow-y-auto"
          aria-live="polite"
          aria-atomic="false"
          data-testid="messages-container"
        >
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center text-center pt-10" data-testid="empty-state">
                <div className="w-16 h-16 rounded-3xl bg-[#264653] flex items-center justify-center shadow-lg mb-5">
                  <Hand className="w-8 h-8 text-[#E9C46A]" />
                </div>
                <h2 className="font-heading text-3xl sm:text-4xl text-[#2C2E33] mb-2">Salam! 👋 مرحبا بيك</h2>
                <p className="text-[#6B6A3A] max-w-md mb-8">
                  Your inclusive AI assistant for Moroccan Darija, Tamazight and beyond. Type, speak, or sign — ChatMaroc understands you.
                </p>
                <div className="grid sm:grid-cols-3 gap-3 w-full">
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => streamChat(s.label, "text")}
                      className="text-left rounded-2xl border border-[#E5E1D8] bg-white p-4 hover:-translate-y-0.5 hover:shadow-md transition-all focus:ring-2 focus:ring-[#2A9D8F] focus:outline-none"
                      data-testid={`suggestion-${i}`}
                    >
                      <p className="text-[#2C2E33] font-medium">{s.label}</p>
                      <p className="text-xs text-[#6B6A3A] mt-1">{s.sub}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {messages.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
                    data-testid={`message-${m.role}`}
                  >
                    {m.role === "user" ? (
                      <div className="bg-[#264653] text-white rounded-2xl rounded-tr-sm py-3 px-5 max-w-[85%] shadow-sm">
                        {(m.kind === "voice" || m.kind === "sign") && (
                          <span className="inline-flex items-center gap-1 text-xs text-[#E9C46A] mb-1">
                            {m.kind === "voice" ? <Volume2 className="w-3 h-3" /> : <Hand className="w-3 h-3" />}
                            {m.kind === "voice" ? "Voice" : "Sign"}
                          </span>
                        )}
                        <p className="whitespace-pre-wrap break-words">{m.content}</p>
                      </div>
                    ) : (
                      <div className="bg-[#F0EDE5] text-[#2C2E33] rounded-2xl rounded-tl-sm py-3 px-5 max-w-[85%] shadow-sm">
                        {m.content ? (
                          <p className="whitespace-pre-wrap break-words">{m.content}</p>
                        ) : (
                          <span className="inline-flex gap-1 py-1" data-testid="typing-indicator">
                            <span className="w-2 h-2 rounded-full bg-[#6B6A3A] animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="w-2 h-2 rounded-full bg-[#6B6A3A] animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="w-2 h-2 rounded-full bg-[#6B6A3A] animate-bounce" style={{ animationDelay: "300ms" }} />
                          </span>
                        )}
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
            {transcribing && (
              <div className="flex items-center gap-2 text-sm text-[#6B6A3A] self-end" data-testid="transcribing-indicator">
                <Loader2 className="w-4 h-4 animate-spin" /> Transcribing your voice…
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Composer */}
      <footer className="sticky bottom-0 bg-[#F9F7F3]/90 backdrop-blur-md border-t border-[#E5E1D8]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-end gap-2 bg-white rounded-3xl border border-[#E5E1D8] shadow-[0_8px_32px_rgba(44,46,51,0.05)] px-3 py-2 focus-within:ring-2 focus-within:ring-[#2A9D8F] transition">
            <button
              onClick={() => setShowCamera(true)}
              className="shrink-0 rounded-full p-3 bg-[#E76F51] text-white shadow-lg hover:-translate-y-0.5 transition-transform focus:ring-2 focus:ring-offset-2 focus:ring-[#E76F51] focus:outline-none"
              aria-label="Record sign language video"
              title="Record sign language"
              data-testid="sign-language-record-button"
            >
              <Camera className="w-5 h-5" />
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              rows={1}
              placeholder={`Write in ${currentLangLabel}…`}
              className="flex-1 resize-none bg-transparent outline-none py-2 text-[#2C2E33] placeholder:text-[#9b9a83] max-h-[140px]"
              data-testid="chat-input"
            />

            <button
              onClick={recordingAudio ? stopAudio : startAudio}
              disabled={transcribing || streaming}
              className={`shrink-0 rounded-full p-3 transition-transform focus:ring-2 focus:ring-[#2A9D8F] focus:outline-none disabled:opacity-50 ${
                recordingAudio ? "bg-[#8C3F2D] text-white cm-recording" : "bg-[#F0EDE5] text-[#264653] hover:-translate-y-0.5"
              }`}
              aria-label={recordingAudio ? "Stop recording" : "Record voice message"}
              title={recordingAudio ? "Stop" : "Voice message"}
              data-testid="voice-record-button"
            >
              {recordingAudio ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            <button
              onClick={handleSend}
              disabled={!input.trim() || streaming}
              className="shrink-0 rounded-full p-3 bg-[#264653] text-white hover:-translate-y-0.5 transition-transform focus:ring-2 focus:ring-offset-2 focus:ring-[#264653] focus:outline-none disabled:opacity-40 disabled:translate-y-0"
              aria-label="Send message"
              data-testid="send-button"
            >
              {streaming ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
          <p className="text-center text-xs text-[#9b9a83] mt-2">
            ChatMaroc supports text, voice & sign language · made for everyone 🇲🇦
          </p>
        </div>
      </footer>

      <AnimatePresence>
        {showCamera && (
          <SignLanguageRecorder
            onClose={() => setShowCamera(false)}
            onSend={handleSendSign}
            sending={sendingSign}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
