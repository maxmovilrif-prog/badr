import { motion, AnimatePresence } from "framer-motion";
import { Mic, Hand, Paperclip, Globe, Sparkles, ExternalLink, Volume2, Square, Loader2 } from "lucide-react";

const domainOf = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
};

const KIND_META = {
  voice: { icon: Mic, label: "Voice" },
  sign: { icon: Hand, label: "Sign" },
  file: { icon: Paperclip, label: "File" },
  search: { icon: Globe, label: "Web search" },
};

const ENTER = { opacity: 0, scale: 0.97, y: 10 };
const SHOW = { opacity: 1, scale: 1, y: 0 };

const UserBubble = ({ m }) => {
  const meta = KIND_META[m.kind];
  const Icon = meta?.icon;
  return (
    <div className="self-end max-w-[85%] md:max-w-[75%] bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl rounded-tr-sm px-4 py-3 text-white shadow-lg">
      {meta && (
        <span className="inline-flex items-center gap-1 text-xs text-cyan-300 mb-1">
          <Icon className="w-3 h-3" />
          {meta.label}
        </span>
      )}
      <p className="whitespace-pre-wrap break-words" dir="auto">{m.content}</p>
    </div>
  );
};

const Sources = ({ sources }) => (
  <div className="mt-3" data-testid="message-sources">
    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400 mb-2 flex items-center gap-1.5">
      <Globe className="w-3 h-3" /> Sources
    </p>
    <div className="grid sm:grid-cols-2 gap-2">
      {sources.map((s, si) => (
        <a
          key={s.url || si}
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
);

const SpeakButton = ({ m, speakingId, ttsLoadingId, onSpeak }) => {
  const loading = ttsLoadingId === m.id;
  const active = speakingId === m.id;
  let icon = <Volume2 className="w-3.5 h-3.5" />;
  if (loading) icon = <Loader2 className="w-3.5 h-3.5 animate-spin" />;
  else if (active) icon = <Square className="w-3.5 h-3.5" />;
  return (
    <button
      onClick={() => onSpeak(m.content, m.id)}
      className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-cyan-300 transition-colors rounded-full px-2 py-1 hover:bg-white/5"
      aria-label={active ? "Stop voice" : "Play voice reply"}
      data-testid={`speak-button-${m.id}`}
    >
      {icon}
      {active ? "Stop" : "Listen"}
    </button>
  );
};

const PendingIndicator = ({ searching }) => {
  if (searching) {
    return (
      <span className="inline-flex items-center gap-2 py-2 text-sm" data-testid="web-searching-indicator">
        <Globe className="w-4 h-4 text-cyan-300 animate-spin" style={{ animationDuration: "2s" }} />
        <span className="cm-shimmer font-medium">Searching the web…</span>
      </span>
    );
  }
  return (
    <span className="inline-flex gap-1 py-2" data-testid="typing-indicator">
      <span className="w-2 h-2 rounded-full bg-cyan-300/70 animate-bounce" style={{ animationDelay: "0ms" }} />
      <span className="w-2 h-2 rounded-full bg-cyan-300/70 animate-bounce" style={{ animationDelay: "150ms" }} />
      <span className="w-2 h-2 rounded-full bg-cyan-300/70 animate-bounce" style={{ animationDelay: "300ms" }} />
    </span>
  );
};

const AssistantBubble = ({ m, searchingMsgId, speakingId, ttsLoadingId, onSpeak }) => (
  <div className="self-start max-w-[95%] md:max-w-[85%] group">
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center shrink-0 mt-0.5">
        <Sparkles className="w-4 h-4 text-cyan-300" />
      </div>
      <div className="flex-1">
        {m.content ? (
          <>
            <p className="whitespace-pre-wrap break-words text-slate-100 leading-relaxed" dir="auto">{m.content}</p>
            {m.sources && m.sources.length > 0 && <Sources sources={m.sources} />}
            <SpeakButton m={m} speakingId={speakingId} ttsLoadingId={ttsLoadingId} onSpeak={onSpeak} />
          </>
        ) : (
          <PendingIndicator searching={m.id === searchingMsgId} />
        )}
      </div>
    </div>
  </div>
);

export const MessageList = ({ messages, searchingMsgId, speakingId, ttsLoadingId, onSpeak, transcribing }) => (
  <div className="max-w-3xl mx-auto px-4 md:px-6 pt-8 pb-44 flex flex-col gap-6">
    <AnimatePresence initial={false}>
      {messages.map((m) => (
        <motion.div
          key={m.id}
          initial={ENTER}
          animate={SHOW}
          transition={{ duration: 0.22 }}
          className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
          data-testid={`message-${m.role}`}
        >
          {m.role === "user"
            ? <UserBubble m={m} />
            : <AssistantBubble m={m} searchingMsgId={searchingMsgId} speakingId={speakingId} ttsLoadingId={ttsLoadingId} onSpeak={onSpeak} />}
        </motion.div>
      ))}
    </AnimatePresence>
    {transcribing && (
      <div className="flex items-center gap-2 text-sm text-slate-300 self-end" data-testid="transcribing-indicator">
        <Loader2 className="w-4 h-4 animate-spin" /> Transcribing your voice…
      </div>
    )}
  </div>
);
