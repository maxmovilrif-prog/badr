import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Settings as SettingsIcon, Trash2, Loader2, HardDrive, Globe } from "lucide-react";
import { toast } from "sonner";

const RETENTION_OPTIONS = [
  { hours: 1, label: "1 hour" },
  { hours: 6, label: "6 hours" },
  { hours: 24, label: "1 day" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "7 days" },
  { hours: 720, label: "30 days" },
];

export const SettingsModal = ({ api, onClose }) => {
  const [hours, setHours] = useState(6);
  const [webSearch, setWebSearch] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  useEffect(() => {
    fetch(`${api}/settings`)
      .then((r) => r.json())
      .then((d) => {
        if (d.upload_ttl_hours) setHours(Math.round(d.upload_ttl_hours));
        setWebSearch(!!d.web_search);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [api]);

  const save = async (h) => {
    setHours(h);
    setSaving(true);
    try {
      const r = await fetch(`${api}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upload_ttl_hours: h }),
      });
      if (!r.ok) throw new Error();
      toast.success("Retention period updated");
    } catch {
      toast.error("Could not save settings");
    } finally {
      setSaving(false);
    }
  };

  const cleanNow = async () => {
    setCleaning(true);
    try {
      const r = await fetch(`${api}/admin/cleanup-uploads`, { method: "POST" });
      const d = await r.json();
      toast.success(`Cleaned ${d.removed} old file(s)`);
    } catch {
      toast.error("Cleanup failed");
    } finally {
      setCleaning(false);
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
      aria-label="Settings"
      data-testid="settings-modal"
    >
      <motion.div
        className="w-full max-w-md bg-slate-900/90 backdrop-blur-2xl rounded-3xl shadow-2xl overflow-hidden border border-white/10"
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-cyan-300" />
            <h2 className="font-heading text-xl text-white font-semibold">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 hover:bg-white/10 text-slate-300 hover:text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none transition-colors"
            aria-label="Close settings"
            data-testid="settings-close-button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : (
            <>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <HardDrive className="w-4 h-4 text-cyan-300" />
                  <h3 className="text-white font-medium">File retention period</h3>
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
                </div>
                <p className="text-xs text-slate-400 mb-3">
                  Uploaded videos, images & PDFs are auto-deleted after this period to keep things fast.
                  <span className="block mt-1 text-slate-300">Currently: {hours} {hours === 1 ? "hour" : "hours"}</span>
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {RETENTION_OPTIONS.map((o) => (
                    <button
                      key={o.hours}
                      onClick={() => save(o.hours)}
                      disabled={saving}
                      className={`px-3 py-2.5 rounded-xl text-sm border transition-colors ${
                        hours === o.hours
                          ? "bg-cyan-500/20 border-cyan-400/40 text-cyan-200"
                          : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                      }`}
                      data-testid={`retention-option-${o.hours}`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 p-3">
                <div>
                  <p className="text-sm text-white font-medium">Clean up now</p>
                  <p className="text-xs text-slate-400">Delete files older than the current period</p>
                </div>
                <button
                  onClick={cleanNow}
                  disabled={cleaning}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-400/30 text-rose-200 hover:bg-rose-500/25 transition-colors text-sm disabled:opacity-60"
                  data-testid="cleanup-now-button"
                >
                  {cleaning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Clean
                </button>
              </div>

              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Globe className="w-4 h-4" />
                Live web search:
                <span className={webSearch ? "text-cyan-300" : "text-slate-500"}>
                  {webSearch ? "Enabled" : "Disabled"}
                </span>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
