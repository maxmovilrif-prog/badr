import { motion } from "framer-motion";
import {
  Plus, Image as ImageIcon, Search, SlidersHorizontal, History,
  MessageSquare, Trash2, Pencil, Check, X, Globe,
} from "lucide-react";
import { useState } from "react";

const EMBLEM = "https://static.prod-images.emergentagent.com/jobs/7ad4c5b7-5b00-45f8-aa74-69995dcd7d52/images/ec31c171d8908bc38d52ca4c16a8f485d19b97ecfe7cd4542a4d2f4e34a22521.png";

const NavItem = ({ icon: Icon, label, onClick, active, testid }) => (
  <button
    onClick={onClick}
    data-testid={testid}
    className={`group relative w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
      active
        ? "bg-cyan-500/15 border border-cyan-400/30 text-white shadow-[0_0_22px_rgba(34,211,238,0.18)]"
        : "text-slate-300 border border-transparent hover:text-white hover:bg-white/[0.06] hover:border-white/10"
    }`}
  >
    <Icon className={`w-[18px] h-[18px] transition-colors ${active ? "text-cyan-300" : "text-slate-400 group-hover:text-cyan-300"}`} />
    <span>{label}</span>
    {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-cyan-400" />}
  </button>
);

export const Sidebar = ({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onImage,
  onSearch,
  searchActive,
  onTools,
  languages,
  language,
  onLanguageChange,
}) => {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");

  const startEdit = (c) => { setEditingId(c.id); setDraft(c.title); };
  const commitEdit = (id) => { if (draft.trim()) onRename(id, draft.trim()); setEditingId(null); };

  return (
    <div className="h-full flex flex-col p-3 gap-2" data-testid="sidebar">
      {/* Brand */}
      <div className="flex items-center gap-3 px-2 py-3">
        <div className="w-9 h-9 rounded-full overflow-hidden ring-1 ring-white/10 shadow-[0_0_16px_rgba(34,211,238,0.25)] shrink-0">
          <img src={EMBLEM} alt="" className="w-full h-full object-cover scale-[1.22]" draggable="false" />
        </div>
        <div>
          <h1 className="font-heading text-lg font-semibold text-white leading-none">ChatMaroc</h1>
          <p className="text-[11px] text-slate-400 mt-1">Darija · Tamazight AI</p>
        </div>
      </div>

      {/* Primary nav */}
      <nav className="flex flex-col gap-1">
        <NavItem icon={Plus} label="Nuevo Chat" onClick={onNew} testid="nav-new-chat" />
        <NavItem icon={ImageIcon} label="Imagen" onClick={onImage} testid="nav-image" />
        <NavItem icon={Search} label="Búsquedas" onClick={onSearch} active={searchActive} testid="nav-search" />
        <NavItem icon={SlidersHorizontal} label="Herramientas" onClick={onTools} testid="nav-tools" />
      </nav>

      {/* Historial */}
      <div className="flex items-center gap-2 px-3.5 pt-4 pb-1.5">
        <History className="w-3.5 h-3.5 text-slate-500" />
        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Historial</p>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide -mr-1 pr-1 space-y-1">
        {conversations.length === 0 && (
          <p className="text-sm text-slate-500 px-3.5 py-2">Aún no hay conversaciones</p>
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
                  <button onClick={(e) => { e.stopPropagation(); startEdit(c); }} className="p-1 text-slate-400 hover:text-white" aria-label="Rename conversation" data-testid="rename-conversation-btn">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onDelete(c.id); }} className="p-1 text-slate-400 hover:text-rose-400" aria-label="Delete conversation" data-testid="delete-conversation-btn">
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
          <Globe className="w-3.5 h-3.5" /> Idioma
        </label>
        <div className="relative">
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
            className="w-full appearance-none bg-black/50 backdrop-blur-xl border border-white/15 rounded-xl text-white text-sm px-4 py-3 outline-none focus:ring-1 focus:ring-cyan-400 cursor-pointer hover:border-white/25 transition-colors"
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
