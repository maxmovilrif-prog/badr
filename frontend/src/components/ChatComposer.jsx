import { motion, AnimatePresence } from "framer-motion";
import { Paperclip, Globe, Camera, Mic, Square, Send, Loader2, FileText, X } from "lucide-react";

const BANNER_HIDDEN = { opacity: 0, y: 8 };
const BANNER_SHOWN = { opacity: 1, y: 0 };

export const ChatComposer = ({
  input, setInput, onSend, streaming,
  pendingFile, onRemoveFile,
  searchMode, onToggleSearch, webSearchAvailable,
  onAttachClick, fileInputRef, onPickFile, textareaRef,
  recordingAudio, onToggleAudio, transcribing,
  onOpenCamera, currentLangLabel,
}) => {
  let placeholder = `Message ChatMaroc in ${currentLangLabel}…`;
  if (pendingFile) placeholder = "Ask about this file…";
  else if (searchMode) placeholder = "Search the web…";

  return (
    <div className="absolute bottom-0 left-0 right-0 px-4 pb-5 pt-10 bg-gradient-to-t from-[#050B14] via-[#050B14]/70 to-transparent pointer-events-none">
      <div className="max-w-3xl mx-auto pointer-events-auto">
        <AnimatePresence>
          {(pendingFile || searchMode) && (
            <motion.div
              initial={BANNER_HIDDEN}
              animate={BANNER_SHOWN}
              exit={BANNER_HIDDEN}
              className="mb-2 flex items-center gap-2"
            >
              {pendingFile && (
                <div className="inline-flex items-center gap-2 bg-black/50 backdrop-blur-xl border border-white/15 rounded-full pl-3 pr-2 py-1.5 text-sm text-white" data-testid="pending-file-chip">
                  <FileText className="w-4 h-4 text-cyan-300" />
                  <span className="max-w-[200px] truncate">{pendingFile.name}</span>
                  <button onClick={onRemoveFile} className="p-0.5 rounded-full hover:bg-white/10 text-slate-300" aria-label="Remove file" data-testid="remove-file-btn">
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

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/csv"
          className="hidden"
          onChange={onPickFile}
          data-testid="file-input"
        />

        <div className="flex items-end gap-1 rounded-[1.75rem] bg-black/40 backdrop-blur-2xl border border-white/15 shadow-2xl px-2 py-2 focus-within:ring-1 focus-within:ring-cyan-400/50 transition-all">
          <button
            onClick={onAttachClick}
            className="shrink-0 p-3 rounded-full text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Attach a file or image"
            title="Attach image / PDF"
            data-testid="attach-file-button"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          <button
            onClick={onToggleSearch}
            className={`shrink-0 p-3 rounded-full transition-colors ${searchMode ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/30" : "text-slate-300 hover:text-white hover:bg-white/10"} ${!webSearchAvailable ? "opacity-50" : ""}`}
            aria-label="Toggle live web search"
            title="Live web search"
            data-testid="web-search-toggle"
          >
            <Globe className="w-5 h-5" />
          </button>

          <button
            onClick={onOpenCamera}
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
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
            rows={1}
            placeholder={placeholder}
            className="flex-1 resize-none bg-transparent outline-none py-2.5 px-1 text-white placeholder:text-slate-400 max-h-[160px]"
            data-testid="chat-input"
          />

          <button
            onClick={onToggleAudio}
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
            onClick={onSend}
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
  );
};
