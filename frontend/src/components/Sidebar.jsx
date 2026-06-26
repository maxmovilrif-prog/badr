import { motion } from "framer-motion";
import { Plus, MessageSquare, Trash2, Pencil, Check, X, Sparkles, Globe } from "lucide-react";
import { useState } from "react";

export const Sidebar = ({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  languages,
  language,
  onLanguageChange,
}) => {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");

  const startEdit = (c) => { setEditingId(c.id); setDraft(c.title); };
  const commitEdit = (id) => { if (draft.trim()) onRename(id, draft.trim()); setEditingId(null); };

  return (
    <div className="h-full flex flex-col p-3 gap-3" data-testid="sidebar">
      {/* Brand */}
      <div className="flex items-center gap-3 px-2 py-3">
        <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-cyan-300" />
        </div>
        <div>
          <h1 className="font-heading text-lg font-semibold text-white leading-none">ChatMaroc</h1>
          <p className="text-[11px] text-slate-400 mt-1">Darija · Tamazight AI</p>
        </div>
      </div>

      {/* New chat */}
      <button
        onClick={onNew}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition-all duration-200 border border-white/10 text-white font-medium"
        data-testid="new-chat-btn"
      >
        <Plus className="w-4 h-4" /> New chat
      </button>

      {/* History */}
      <div className="flex-1 overflow-y-auto scrollbar-hide -mr-1 pr-1 mt-1 space-y-1">
        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 px-3 py-2">Recent</p>
        {conversations.length === 0 && (
          <p className="text-sm text-slate-500 px-3 py-2">No conversations yet</p>
        )}
        {conversations.map((c) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className={`group flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
              activeId === c.id ? "bg-white/15 text-white" : "hover:bg-white/5 text-slate-300 hover:text-white"
            }`}
            onClick={() => editingId !== c.id && onSelect(c.id)}
            data-testid="history-item"
          >
            {editingId === c.id ? (
              <div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") commitEdit(c.id); if (e.key === "Escape") setEditingId(null); }}
                  className="flex-1 bg-black/40 border border-white/15 rounded-md px-2 py-1 text-sm text-white outline-none focus:ring-1 focus:ring-cyan-400"
                  data-testid="rename-input"
                />
                <button onClick={() => commitEdit(c.id)} className="p-1 text-cyan-300 hover:text-cyan-200" data-testid="rename-confirm"><Check className="w-4 h-4" /></button>
                <button onClick={() => setEditingId(null)} className="p-1 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 min-w-0">
                  <MessageSquare className="w-4 h-4 shrink-0 opacity-60" />
                  <span className="truncate text-sm">{c.title}</span>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); startEdit(c); }}
                    className="p-1 text-slate-400 hover:text-white"
                    aria-label="Rename conversation"
                    data-testid="rename-conversation-btn"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
                    className="p-1 text-slate-400 hover:text-rose-400"
                    aria-label="Delete conversation"
                    data-testid="delete-conversation-btn"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            )}
          </motion.div>
        ))}
      </div>

      {/* Language selector */}
      <div className="mt-auto pt-3 border-t border-white/10">
        <label className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-500 px-1 mb-2">
          <Globe className="w-3.5 h-3.5" /> Language
        </label>
        <div className="relative">
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
            className="w-full appearance-none bg-black/50 backdrop-blur-xl border border-white/15 rounded-xl text-white text-sm px-4 py-3 outline-none focus:ring-1 focus:ring-cyan-400 cursor-pointer"
            data-testid="language-selector"
          >
            {languages.map((l) => (
              <option key={l.key} value={l.key} className="bg-[#0a1420] text-white">{l.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};
