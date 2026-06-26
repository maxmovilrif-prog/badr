import { useState } from "react";
import { motion } from "framer-motion";
import { X, Link2, Copy, Check, Globe, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const ShareModal = ({ api, url, conversationId, onClose, onUnshared }) => {
  const [copied, setCopied] = useState(false);
  const [unsharing, setUnsharing] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy link");
    }
  };

  const stopSharing = async () => {
    setUnsharing(true);
    try {
      await fetch(`${api}/conversations/${conversationId}/unshare`, { method: "POST" });
      toast.success("Sharing stopped");
      onUnshared?.();
      onClose();
    } catch {
      toast.error("Could not stop sharing");
    } finally {
      setUnsharing(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Share conversation"
      data-testid="share-modal"
    >
      <motion.div
        className="w-full max-w-md bg-slate-900/90 backdrop-blur-2xl rounded-3xl shadow-2xl overflow-hidden border border-white/10"
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-cyan-300" />
            <h2 className="font-heading text-xl text-white font-semibold">Share chat</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 hover:bg-white/10 text-slate-300 hover:text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none transition-colors"
            aria-label="Close share dialog"
            data-testid="share-close-button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-300 flex items-center gap-2">
            <Globe className="w-4 h-4 text-cyan-300" />
            Anyone with this link can view this conversation (read-only).
          </p>

          <div className="flex items-center gap-2 bg-black/40 border border-white/15 rounded-xl px-3 py-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.target.select()}
              className="flex-1 bg-transparent outline-none text-sm text-white truncate"
              data-testid="share-url-input"
            />
            <button
              onClick={copy}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black text-sm font-medium transition-colors"
              data-testid="copy-link-button"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <button
            onClick={stopSharing}
            disabled={unsharing}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors text-sm disabled:opacity-60"
            data-testid="stop-sharing-button"
          >
            {unsharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <EyeOff className="w-4 h-4" />}
            Stop sharing
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
