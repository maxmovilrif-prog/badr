import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Sidebar } from "@/components/Sidebar";
import { SignLanguageRecorder } from "@/components/SignLanguageRecorder";
import { CyberBackground } from "@/components/CyberBackground";
import { SettingsModal } from "@/components/SettingsModal";
import { ShareModal } from "@/components/ShareModal";
import { ChatHeader } from "@/components/ChatHeader";
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { MessageList } from "@/components/MessageList";
import { ChatComposer } from "@/components/ChatComposer";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { exportConversationPdf } from "@/lib/exportPdf";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const getClientId = () => {
  let id = localStorage.getItem("chatmaroc_client");
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [searchMode, setSearchMode] = useState(false);
  const [webSearchAvailable, setWebSearchAvailable] = useState(false);
  const [searchingMsgId, setSearchingMsgId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [exporting, setExporting] = useState(false);

  const scrollRef = useRef(null);
  const audioRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioStreamRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const activeIdRef = useRef(null);
  const creatingRef = useRef(null);

  const { speak, stopSpeaking, speakingId, ttsLoadingId } = useTextToSpeech(API, voice, language);

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
    } catch (e) { console.error("Failed to load conversations:", e); return []; }
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
    } catch (e) { console.error("Failed to load messages:", e); setMessages([]); }
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
        let payload;
        try {
          payload = JSON.parse(line.slice(5).trim());
        } catch {
          // Skip a partial/malformed SSE chunk instead of aborting the whole stream.
          continue;
        }
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

  const pushTurnAndStream = async (userMsg, fetchFactory, opts = {}) => {
    setStreaming(true);
    const aiId = `a_${Date.now()}`;
    if (opts.searching) setSearchingMsgId(aiId);
    setMessages((prev) => [...prev, userMsg, { id: aiId, role: "assistant", content: "", kind: "text" }]);
    try {
      const res = await fetchFactory();
      setSearchingMsgId(null);
      if (!res.ok || !res.body) {
        let detail = "Network error";
        try { detail = (await res.json()).detail || detail; } catch { /* keep default detail */ }
        throw new Error(detail);
      }
      const fullText = await consumeStream(res, aiId);
      loadConversations();
      if (autoSpeak && fullText.trim()) speak(fullText, aiId);
    } catch (e) {
      console.error("Chat stream failed:", e);
      const msg = typeof e?.message === "string" && e.message ? e.message : "Could not reach ChatMaroc.";
      toast.error(msg);
      setMessages((prev) => prev.map((m) => m.id === aiId ? { ...m, content: m.content || `⚠️ ${msg}` } : m));
    } finally {
      setStreaming(false);
      setSearchingMsgId(null);
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
    }, { searching: true });
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
  const activeTitle = conversations.find((c) => c.id === activeId)?.title || "ChatMaroc conversation";
  const hasMessages = messages.some((m) => (m.content || "").trim());

  const handleShare = async () => {
    if (!activeId || !hasMessages) { toast.error("Start a conversation first."); return; }
    try {
      const r = await fetch(`${API}/conversations/${activeId}/share`, { method: "POST" });
      const d = await r.json();
      if (!d.share_token) throw new Error();
      const url = `${window.location.origin}/share/${d.share_token}`;
      setShareUrl(url);
      setShowShare(true);
      try { await navigator.clipboard.writeText(url); toast.success("Share link copied"); }
      catch (e) { console.error("Clipboard copy failed:", e); }
    } catch {
      toast.error("Could not create share link.");
    }
  };

  const handleExport = async () => {
    if (!hasMessages) { toast.error("Nothing to export yet."); return; }
    setExporting(true);
    try {
      await exportConversationPdf(activeTitle, messages);
      toast.success("PDF downloaded");
    } catch {
      toast.error("Could not export PDF.");
    } finally {
      setExporting(false);
    }
  };

  // Sidebar nav wrappers
  const navImage = () => { setSidebarOpen(false); setSearchMode(false); fileInputRef.current?.click(); };
  const navSearch = () => { setSidebarOpen(false); toggleSearch(); };
  const navTools = () => { setSidebarOpen(false); setShowSettings(true); };

  return (
    <div className="fixed inset-0 flex overflow-hidden text-white font-body">
      {/* Dark cyberpunk background with smooth purple/blue gradient waves */}
      <CyberBackground />

      {/* Sidebar - desktop */}
      <aside className="hidden md:flex w-72 flex-shrink-0 h-full border-r border-white/10 bg-black/30 backdrop-blur-2xl z-40">
        <Sidebar
          conversations={conversations}
          activeId={activeId}
          onSelect={selectConversation}
          onNew={newChat}
          onDelete={deleteConversation}
          onRename={renameConversation}
          onImage={navImage}
          onSearch={navSearch}
          searchActive={searchMode}
          onTools={navTools}
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
                onImage={navImage}
                onSearch={navSearch}
                searchActive={searchMode}
                onTools={navTools}
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
        <ChatHeader
          onOpenSidebar={() => setSidebarOpen(true)}
          onExport={handleExport}
          exporting={exporting}
          onShare={handleShare}
          onOpenSettings={() => setShowSettings(true)}
          autoSpeak={autoSpeak}
          onToggleAutoSpeak={() => { if (autoSpeak) stopSpeaking(); setAutoSpeak((v) => !v); }}
          voice={voice}
          onVoiceChange={(v) => { stopSpeaking(); setVoice(v); localStorage.setItem("chatmaroc_voice", v); }}
        />

        {/* Chat area */}
        <div ref={scrollRef} className="cm-scroll flex-1 overflow-y-auto scroll-smooth" aria-live="polite" aria-atomic="false" data-testid="messages-container">
          {messages.length === 0 ? (
            <WelcomeScreen />
          ) : (
            <MessageList
              messages={messages}
              searchingMsgId={searchingMsgId}
              speakingId={speakingId}
              ttsLoadingId={ttsLoadingId}
              onSpeak={speak}
              transcribing={transcribing}
            />
          )}
        </div>

        <ChatComposer
          input={input}
          setInput={setInput}
          onSend={handleSend}
          streaming={streaming}
          pendingFile={pendingFile}
          onRemoveFile={() => setPendingFile(null)}
          searchMode={searchMode}
          onToggleSearch={toggleSearch}
          webSearchAvailable={webSearchAvailable}
          onAttachClick={() => fileInputRef.current?.click()}
          fileInputRef={fileInputRef}
          onPickFile={onPickFile}
          textareaRef={textareaRef}
          recordingAudio={recordingAudio}
          onToggleAudio={recordingAudio ? stopAudio : startAudio}
          transcribing={transcribing}
          onOpenCamera={() => setShowCamera(true)}
          currentLangLabel={currentLangLabel}
        />
      </div>

      <AnimatePresence>
        {showCamera && (
          <SignLanguageRecorder onClose={() => setShowCamera(false)} onSend={handleSendSign} sending={sendingSign} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSettings && (
          <SettingsModal api={API} onClose={() => setShowSettings(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showShare && (
          <ShareModal
            api={API}
            url={shareUrl}
            conversationId={activeId}
            onClose={() => setShowShare(false)}
            onUnshared={() => loadConversations()}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
