import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Send, Mic, Square, Camera, Sparkles, Loader2, Volume2, VolumeX,
  Menu, X, ChevronDown, Hand, AudioLines, Paperclip, Globe, FileText, ExternalLink,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sidebar } from "@/components/Sidebar";
import { SignLanguageRecorder } from "@/components/SignLanguageRecorder";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// User-provided futuristic Moroccan riad background (kept as fixed page background).
const BG_IMAGE = "https://customer-assets.emergentagent.com/job_darija-chat-ai/artifacts/iufk1c5m_Gemini_Generated_Image_hjdpn8hjdpn8hjdp.png";

const VOICES = [
  { id: "nova", name: "Nova", desc: "Energetic" },
  { id: "shimmer", name: "Shimmer", desc: "Bright" },
  { id: "alloy", name: "Alloy", desc: "Neutral" },
  { id: "coral", name: "Coral", desc: "Warm" },
  { id: "onyx", name: "Onyx", desc: "Deep" },
  { id: "sage", name: "Sage", desc: "Calm" },
  { id: "fable", name: "Fable", desc: "Expressive" },
];

const SUGGESTIONS = [
  { label: "كيفاش نطيب طاجين؟", sub: "How do I cook a tajine?" },
  { label: "ⵎⴰⵏ ⴰⵢ ⵜⴻⵍⵍⵉⴷ?", sub: "Greet me in Tamazight" },
  { label: "Raconte-moi un proverbe marocain", sub: "A Moroccan proverb" },
  { label: "Plan a 3-day trip to Marrakech", sub: "Travel ideas" },
];

const domainOf = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
};

const getClientId = () => {  let id = localStorage.getItem("chatmaroc_client");
  if (!id) {
    id = `cl_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    localStorage.setItem("chatmaroc_client", id);
  }
  return id;
};

export default function ChatMaroc() {
  const [clientId] = useState(getClientId);
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [languages, setLanguages] = useState([]);
  const [language, setLanguage] = useState("darija");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [recordingAudio, setRecordingAudio] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [sendingSign, setSendingSign] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [voice, setVoice] = useState(() => localStorage.getItem("chatmaroc_voice") || "nova");
  const [speakingId, setSpeakingId] = useState(null);
  const [ttsLoadingId, setTtsLoadingId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [searchMode, setSearchMode] = useState(false);
  const [webSearchAvailable, setWebSearchAvailable] = useState(false);

  const scrollRef = useRef(null);
  const audioRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioStreamRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const ttsAudioRef = useRef(null);
  const ttsUrlRef = useRef(null);
  const activeIdRef = useRef(null);
  const creatingRef = useRef(null);

  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const r = await fetch(`${API}/conversations?client_id=${clientId}`);
      const d = await r.json();
      if (Array.isArray(d)) setConversations(d);
      return d;
    } catch { return []; }
  }, [clientId]);

  useEffect(() => {
    fetch(`${API}/languages`).then((r) => r.json()).then((d) => setLanguages(d.languages || [])).catch(() => {});
    fetch(`${API}/features`).then((r) => r.json()).then((d) => setWebSearchAvailable(!!d.web_search)).catch(() => {});
    loadConversations();
  }, [loadConversations]);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const loadMessages = useCallback(async (id) => {
    try {
      const r = await fetch(`${API}/messages/${id}`);
      const d = await r.json();
      setMessages(Array.isArray(d) ? d : []);
    } catch { setMessages([]); }
  }, []);

  const selectConversation = (id) => {
    setActiveId(id);
    setSidebarOpen(false);
    loadMessages(id);
  };

  const newChat = () => {
    setActiveId(null);
    setMessages([]);
    setSidebarOpen(false);
  };

  const ensureConversation = async () => {
    if (activeIdRef.current) return activeIdRef.current;
    if (creatingRef.current) return creatingRef.current;
    creatingRef.current = (async () => {
      const r = await fetch(`${API}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId }),
      });
      const conv = await r.json();
      setActiveId(conv.id);
      activeIdRef.current = conv.id;
      setConversations((prev) => [conv, ...prev]);
      return conv.id;
    })();
    try {
      return await creatingRef.current;
    } finally {
      creatingRef.current = null;
    }
  };

  const renameConversation = async (id, title) => {
    setConversations((prev) => prev.map((c) => c.id === id ? { ...c, title } : c));
    await fetch(`${API}/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }).catch(() => {});
  };

  const deleteConversation = async (id) => {
    await fetch(`${API}/conversations/${id}`, { method: "DELETE" }).catch(() => {});
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeIdRef.current === id) { newChat(); }
    toast.success("Conversation deleted");
  };

  // ---------- TTS ----------
  const stopSpeaking = useCallback(() => {
    if (ttsAudioRef.current) { ttsAudioRef.current.pause(); ttsAudioRef.current = null; }
    if (ttsUrlRef.current) { URL.revokeObjectURL(ttsUrlRef.current); ttsUrlRef.current = null; }
    setSpeakingId(null);
  }, []);

  const speak = useCallback(async (text, id) => {
    if (!text || !text.trim()) return;
    if (speakingId === id) { stopSpeaking(); return; }
    stopSpeaking();
    setTtsLoadingId(id);
    try {
      const res = await fetch(`${API}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice, language }),
      });
      if (!res.ok) throw new Error("TTS failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      ttsUrlRef.current = url;
      const audio = new Audio(url);
      ttsAudioRef.current = audio;
      audio.onended = () => { setSpeakingId(null); URL.revokeObjectURL(url); ttsUrlRef.current = null; };
      audio.onerror = () => setSpeakingId(null);
      setSpeakingId(id);
      await audio.play();
    } catch {
      toast.error("Voice playback failed.");
    } finally {
      setTtsLoadingId(null);
    }
  }, [speakingId, stopSpeaking, voice, language]);

  // ---------- Chat ----------
  const consumeStream = async (res, aiId) => {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
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
          fullText += payload.delta;
          setMessages((prev) => prev.map((m) => m.id === aiId ? { ...m, content: m.content + payload.delta } : m));
        } else if (payload.sources) {
          setMessages((prev) => prev.map((m) => m.id === aiId ? { ...m, sources: payload.sources } : m));
        } else if (payload.error) {
          toast.error("AI error: " + payload.error);
        }
      }
    }
    return fullText;
  };

  const pushTurnAndStream = async (userMsg, fetchFactory) => {
    setStreaming(true);
    const aiId = `a_${Date.now()}`;
    setMessages((prev) => [...prev, userMsg, { id: aiId, role: "assistant", content: "", kind: "text" }]);
    try {
      const res = await fetchFactory();
      if (!res.ok || !res.body) {
        let detail = "Network error";
        try { detail = (await res.json()).detail || detail; } catch {}
        throw new Error(detail);
      }
      const fullText = await consumeStream(res, aiId);
      loadConversations();
      if (autoSpeak && fullText.trim()) speak(fullText, aiId);
    } catch (e) {
      toast.error(typeof e?.message === "string" ? e.message : "Could not reach ChatMaroc.");
      setMessages((prev) => prev.map((m) => m.id === aiId ? { ...m, content: m.content || "⚠️ Connection error." } : m));
    } finally {
      setStreaming(false);
    }
  };

  const streamChat = (text, kind = "text") => {
    const userMsg = { id: `u_${Date.now()}`, role: "user", content: text, kind };
    return pushTurnAndStream(userMsg, async () => {
      const convId = await ensureConversation();
      return fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: convId, message: text, language, kind }),
      });
    });
  };

  const searchChat = (text) => {
    const userMsg = { id: `u_${Date.now()}`, role: "user", content: text, kind: "search" };
    return pushTurnAndStream(userMsg, async () => {
      const convId = await ensureConversation();
      return fetch(`${API}/web-search-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: convId, message: text, language }),
      });
    });
  };

  const fileChat = (file, text) => {
    const userMsg = { id: `u_${Date.now()}`, role: "user", content: `📎 ${file.name}${text ? "\n" + text : ""}`, kind: "file" };
    return pushTurnAndStream(userMsg, async () => {
      const convId = await ensureConversation();
      const fd = new FormData();
      fd.append("session_id", convId);
      fd.append("language", language);
      fd.append("message", text);
      fd.append("file", file, file.name);
      return fetch(`${API}/chat-with-file`, { method: "POST", body: fd });
    });
  };

  const handleSend = () => {
    if (streaming) return;
    const text = input.trim();
    if (pendingFile) {
      const f = pendingFile;
      setPendingFile(null);
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      fileChat(f, text);
      return;
    }
    if (!text) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    if (searchMode) searchChat(text);
    else streamChat(text, "text");
  };

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) { toast.error("File too large (max 20MB)."); return; }
    setPendingFile(f);
    setSearchMode(false);
  };

  const toggleSearch = () => {
    if (!webSearchAvailable) {
      toast.error("Web search needs a Tavily API key — ask the owner to enable it.");
      return;
    }
    setPendingFile(null);
    setSearchMode((v) => !v);
  };

  // ---------- Voice ----------
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
    } catch {
      toast.error("Microphone access denied.");
    }
  };

  const stopAudio = () => { audioRecorderRef.current?.stop(); setRecordingAudio(false); };

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
    } catch {
      toast.error("Voice transcription failed.");
    } finally {
      setTranscribing(false);
    }
  };

  // ---------- Sign language ----------
  const handleSendSign = async (blob) => {
    setSendingSign(true);
    try {
      const convId = await ensureConversation();
      const fd = new FormData();
      fd.append("session_id", convId);
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
    } catch {
      toast.error("Could not process the sign language video.");
    } finally {
      setSendingSign(false);
    }
  };

  const currentLangLabel = languages.find((l) => l.key === language)?.label || "Darija";
  const currentVoice = VOICES.find((v) => v.id === voice)?.name || "Nova";

  return (
    <div className="fixed inset-0 flex overflow-hidden text-white font-body">
      {/* Background image + overlay */}
      <div className="fixed inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: `url(${BG_IMAGE})` }} aria-hidden="true" data-testid="app-background" />
      <div className="fixed inset-0 -z-10 bg-[#050B14]/70" aria-hidden="true" />

      {/* Sidebar - desktop */}
      <aside className="hidden md:flex w-72 flex-shrink-0 h-full border-r border-white/10 bg-black/30 backdrop-blur-2xl z-40">
        <Sidebar
          conversations={conversations}
          activeId={activeId}
          onSelect={selectConversation}
          onNew={newChat}
          onDelete={deleteConversation}
          onRename={renameConversation}
          languages={languages}
          language={language}
          onLanguageChange={setLanguage}
        />
      </aside>

      {/* Sidebar - mobile drawer */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              className="md:hidden fixed inset-0 bg-black/60 z-40"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              className="md:hidden fixed inset-y-0 left-0 w-72 z-50 bg-black/70 backdrop-blur-2xl border-r border-white/10"
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.25 }}
              data-testid="mobile-sidebar"
            >
              <Sidebar
                conversations={conversations}
                activeId={activeId}
                onSelect={selectConversation}
                onNew={newChat}
                onDelete={deleteConversation}
                onRename={renameConversation}
                languages={languages}
                language={language}
                onLanguageChange={setLanguage}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main */}
      <div className="flex-1 flex flex-col relative h-full overflow-hidden">
        {/* Top bar */}
        <header className="h-14 px-3 sm:px-5 flex items-center justify-between bg-black/20 backdrop-blur-md border-b border-white/5 z-30">
          <div className="flex items-center gap-2">
            <button
              className="md:hidden p-2 rounded-lg hover:bg-white/10 text-white transition-colors"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              data-testid="sidebar-toggle"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="flex items-center gap-2 text-sm text-slate-300">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              Claude Sonnet 4.6
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { if (autoSpeak) stopSpeaking(); setAutoSpeak((v) => !v); }}
              className={`p-2 rounded-full transition-colors ${autoSpeak ? "text-cyan-300 bg-white/5" : "text-slate-400 hover:bg-white/10"}`}
              aria-label={autoSpeak ? "Disable voice replies" : "Enable voice replies"}
              title={autoSpeak ? "Voice replies on" : "Voice replies off"}
              data-testid="auto-speak-toggle"
            >
              {autoSpeak ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-white transition-colors"
                  aria-label="Choose AI voice"
                  data-testid="voice-selector"
                >
                  <AudioLines className="w-4 h-4 text-cyan-300" />
                  <span className="hidden sm:inline">{currentVoice}</span>
                  <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-black/80 backdrop-blur-xl border-white/10 text-white">
                <DropdownMenuLabel>AI voice</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuRadioGroup
                  value={voice}
                  onValueChange={(v) => { stopSpeaking(); setVoice(v); localStorage.setItem("chatmaroc_voice", v); }}
                >
                  {VOICES.map((v) => (
                    <DropdownMenuRadioItem key={v.id} value={v.id} className="focus:bg-white/10 focus:text-white" data-testid={`voice-option-${v.id}`}>
                      <span className="font-medium">{v.name}</span>
                      <span className="ml-2 text-xs text-slate-400">{v.desc}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Chat area */}
        <div ref={scrollRef} className="cm-scroll flex-1 overflow-y-auto scroll-smooth" aria-live="polite" aria-atomic="false" data-testid="messages-container">
          {messages.length === 0 ? (
            <div className="min-h-full flex flex-col items-center justify-center px-6 py-10 text-center">
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl w-full flex flex-col items-center">
                <div className="w-16 h-16 rounded-3xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(34,211,238,0.25)]">
                  <Sparkles className="w-8 h-8 text-cyan-300" />
                </div>
                <h2 className="font-heading text-4xl sm:text-5xl font-light tracking-tight text-white mb-3">How can I help you?</h2>
                <p className="text-slate-300/80 max-w-md mb-10">
                  Your inclusive AI for Moroccan Darija, Tamazight & more. Type, speak, or sign — ChatMaroc understands you.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => streamChat(s.label, "text")}
                      className="p-5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all duration-200 text-left flex flex-col gap-1 hover:-translate-y-0.5"
                      data-testid={`suggestion-${i}`}
                    >
                      <span className="text-white font-medium" dir="auto">{s.label}</span>
                      <span className="text-xs text-slate-400">{s.sub}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 md:px-6 pt-8 pb-44 flex flex-col gap-6">
              <AnimatePresence initial={false}>
                {messages.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, scale: 0.97, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.22 }}
                    className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
                    data-testid={`message-${m.role}`}
                  >
                    {m.role === "user" ? (
                      <div className="self-end max-w-[85%] md:max-w-[75%] bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl rounded-tr-sm px-4 py-3 text-white shadow-lg">
                        {["voice", "sign", "file", "search"].includes(m.kind) && (
                          <span className="inline-flex items-center gap-1 text-xs text-cyan-300 mb-1">
                            {m.kind === "voice" ? <Mic className="w-3 h-3" />
                              : m.kind === "sign" ? <Hand className="w-3 h-3" />
                              : m.kind === "file" ? <Paperclip className="w-3 h-3" />
                              : <Globe className="w-3 h-3" />}
                            {m.kind === "voice" ? "Voice" : m.kind === "sign" ? "Sign" : m.kind === "file" ? "File" : "Web search"}
                          </span>
                        )}
                        <p className="whitespace-pre-wrap break-words" dir="auto">{m.content}</p>
                      </div>
                    ) : (
                      <div className="self-start max-w-[95%] md:max-w-[85%] group">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center shrink-0 mt-0.5">
                            <Sparkles className="w-4 h-4 text-cyan-300" />
                          </div>
                          <div className="flex-1">
                            {m.content ? (
                              <>
                                <p className="whitespace-pre-wrap break-words text-slate-100 leading-relaxed" dir="auto">{m.content}</p>
                                {m.sources && m.sources.length > 0 && (
                                  <div className="mt-3" data-testid="message-sources">
                                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400 mb-2 flex items-center gap-1.5">
                                      <Globe className="w-3 h-3" /> Sources
                                    </p>
                                    <div className="grid sm:grid-cols-2 gap-2">
                                      {m.sources.map((s, si) => (
                                        <a
                                          key={si}
                                          href={s.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="block rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 p-3 transition-colors"
                                          data-testid={`source-link-${si}`}
                                        >
                                          <div className="flex items-center gap-2 mb-1">
                                            <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 text-[11px] flex items-center justify-center font-medium shrink-0">{si + 1}</span>
                                            <span className="truncate text-sm text-white font-medium flex-1">{s.title}</span>
                                            <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                                          </div>
                                          {s.snippet && <p className="text-xs text-slate-400 line-clamp-2 leading-snug">{s.snippet}</p>}
                                          <p className="text-[11px] text-cyan-400/70 mt-1 truncate">{domainOf(s.url)}</p>
                                        </a>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <button
                                  onClick={() => speak(m.content, m.id)}
                                  className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-cyan-300 transition-colors rounded-full px-2 py-1 hover:bg-white/5"
                                  aria-label={speakingId === m.id ? "Stop voice" : "Play voice reply"}
                                  data-testid={`speak-button-${m.id}`}
                                >
                                  {ttsLoadingId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : speakingId === m.id ? <Square className="w-3.5 h-3.5" />
                                    : <Volume2 className="w-3.5 h-3.5" />}
                                  {speakingId === m.id ? "Stop" : "Listen"}
                                </button>
                              </>
                            ) : (
                              <span className="inline-flex gap-1 py-2" data-testid="typing-indicator">
                                <span className="w-2 h-2 rounded-full bg-cyan-300/70 animate-bounce" style={{ animationDelay: "0ms" }} />
                                <span className="w-2 h-2 rounded-full bg-cyan-300/70 animate-bounce" style={{ animationDelay: "150ms" }} />
                                <span className="w-2 h-2 rounded-full bg-cyan-300/70 animate-bounce" style={{ animationDelay: "300ms" }} />
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              {transcribing && (
                <div className="flex items-center gap-2 text-sm text-slate-300 self-end" data-testid="transcribing-indicator">
                  <Loader2 className="w-4 h-4 animate-spin" /> Transcribing your voice…
                </div>
              )}
            </div>
          )}
        </div>

        {/* Floating input bar */}
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-5 pt-10 bg-gradient-to-t from-[#050B14] via-[#050B14]/70 to-transparent pointer-events-none">
          <div className="max-w-3xl mx-auto pointer-events-auto">
            {/* Pending file / search mode banner */}
            <AnimatePresence>
              {(pendingFile || searchMode) && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                  className="mb-2 flex items-center gap-2"
                >
                  {pendingFile && (
                    <div className="inline-flex items-center gap-2 bg-black/50 backdrop-blur-xl border border-white/15 rounded-full pl-3 pr-2 py-1.5 text-sm text-white" data-testid="pending-file-chip">
                      <FileText className="w-4 h-4 text-cyan-300" />
                      <span className="max-w-[200px] truncate">{pendingFile.name}</span>
                      <button onClick={() => setPendingFile(null)} className="p-0.5 rounded-full hover:bg-white/10 text-slate-300" aria-label="Remove file" data-testid="remove-file-btn">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  {searchMode && (
                    <div className="inline-flex items-center gap-1.5 bg-cyan-500/15 border border-cyan-400/30 rounded-full px-3 py-1.5 text-sm text-cyan-200" data-testid="search-mode-chip">
                      <Globe className="w-4 h-4" /> Web search on
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/csv" className="hidden" onChange={onPickFile} data-testid="file-input" />

            <div className="flex items-end gap-1 rounded-[1.75rem] bg-black/40 backdrop-blur-2xl border border-white/15 shadow-2xl px-2 py-2 focus-within:ring-1 focus-within:ring-cyan-400/50 transition-all">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0 p-3 rounded-full text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Attach a file or image"
                title="Attach image / PDF"
                data-testid="attach-file-button"
              >
                <Paperclip className="w-5 h-5" />
              </button>

              <button
                onClick={toggleSearch}
                className={`shrink-0 p-3 rounded-full transition-colors ${searchMode ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/30" : "text-slate-300 hover:text-white hover:bg-white/10"} ${!webSearchAvailable ? "opacity-50" : ""}`}
                aria-label="Toggle live web search"
                title="Live web search"
                data-testid="web-search-toggle"
              >
                <Globe className="w-5 h-5" />
              </button>

              <button
                onClick={() => setShowCamera(true)}
                className="shrink-0 p-3 rounded-full text-purple-300 hover:text-purple-200 hover:bg-white/10 transition-colors"
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
                  e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                rows={1}
                placeholder={pendingFile ? "Ask about this file…" : searchMode ? "Search the web…" : `Message ChatMaroc in ${currentLangLabel}…`}
                className="flex-1 resize-none bg-transparent outline-none py-2.5 px-1 text-white placeholder:text-slate-400 max-h-[160px]"
                data-testid="chat-input"
              />

              <button
                onClick={recordingAudio ? stopAudio : startAudio}
                disabled={transcribing || streaming}
                className={`shrink-0 p-3 rounded-full transition-colors disabled:opacity-50 ${
                  recordingAudio ? "bg-rose-600 text-white cm-recording" : "text-rose-300 hover:text-rose-200 hover:bg-white/10"
                }`}
                aria-label={recordingAudio ? "Stop recording" : "Record voice message"}
                title={recordingAudio ? "Stop" : "Voice message"}
                data-testid="voice-record-button"
              >
                {recordingAudio ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              <button
                onClick={handleSend}
                disabled={(!input.trim() && !pendingFile) || streaming}
                className="shrink-0 p-3 rounded-full bg-cyan-500 hover:bg-cyan-400 text-black transition-all disabled:opacity-40 disabled:bg-white/10 disabled:text-slate-400"
                aria-label="Send message"
                data-testid="send-button"
              >
                {streaming ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-center text-[11px] text-slate-400/80 mt-2">
              Text · voice · sign · files & live web search · made for everyone 🇲🇦
            </p>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showCamera && (
          <SignLanguageRecorder onClose={() => setShowCamera(false)} onSend={handleSendSign} sending={sendingSign} />
        )}
      </AnimatePresence>
    </div>
  );
}
