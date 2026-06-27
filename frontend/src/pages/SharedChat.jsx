import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Sparkles, Hand, Mic, Paperclip, Globe, ExternalLink, ArrowRight, Loader2 } from "lucide-react";
import { CyberBackground } from "@/components/CyberBackground";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const domainOf = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
};

export default function SharedChat() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    fetch(`${API}/shared/${token}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { setData(d); setStatus("ok"); })
      .catch(() => setStatus("error"));
  }, [token]);

  return (
    <div className="min-h-screen relative text-white font-body">
      <CyberBackground />

      <header className="sticky top-0 z-30 bg-black/30 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-cyan-300" />
            </div>
            <div className="min-w-0">
              <h1 className="font-heading text-lg font-semibold leading-none truncate" data-testid="shared-title">
                {status === "ok" ? data.title : "ChatMaroc"}
              </h1>
              <p className="text-[11px] text-slate-400 mt-1">Shared conversation · read-only</p>
            </div>
          </div>
          <Link
            to="/"
            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-cyan-500 hover:bg-cyan-400 text-black text-sm font-medium transition-colors"
            data-testid="open-chatmaroc-button"
          >
            Open ChatMaroc <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {status === "loading" && (
          <div className="flex items-center justify-center py-20 text-slate-300" data-testid="shared-loading">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        )}

        {status === "error" && (
          <div className="text-center py-20" data-testid="shared-error">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
              <Globe className="w-7 h-7 text-slate-400" />
            </div>
            <h2 className="font-heading text-2xl mb-2">Conversation not available</h2>
            <p className="text-slate-400 mb-6">This link is invalid or sharing was turned off.</p>
            <Link to="/" className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-cyan-500 hover:bg-cyan-400 text-black font-medium">
              Go to ChatMaroc <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {status === "ok" && (
          <div className="flex flex-col gap-6" data-testid="shared-messages">
            {data.messages.filter((m) => (m.content || "").trim()).map((m) => (
              <div key={m.id} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                {m.role === "user" ? (
                  <div className="self-end max-w-[85%] bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl rounded-tr-sm px-4 py-3 shadow-lg">
                    {["voice", "sign", "file", "search"].includes(m.kind) && (
                      <span className="inline-flex items-center gap-1 text-xs text-cyan-300 mb-1">
                        {m.kind === "voice" ? <Mic className="w-3 h-3" /> : m.kind === "sign" ? <Hand className="w-3 h-3" /> : m.kind === "file" ? <Paperclip className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                        {m.kind === "voice" ? "Voice" : m.kind === "sign" ? "Sign" : m.kind === "file" ? "File" : "Web search"}
                      </span>
                    )}
                    <p className="whitespace-pre-wrap break-words" dir="auto">{m.content}</p>
                  </div>
                ) : (
                  <div className="self-start max-w-[95%] md:max-w-[85%]">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center shrink-0 mt-0.5">
                        <Sparkles className="w-4 h-4 text-cyan-300" />
                      </div>
                      <div className="flex-1">
                        <p className="whitespace-pre-wrap break-words text-slate-100 leading-relaxed" dir="auto">{m.content}</p>
                        {m.sources && m.sources.length > 0 && (
                          <div className="mt-3 grid sm:grid-cols-2 gap-2">
                            {m.sources.map((s, si) => (
                              <a key={s.url || si} href={s.url} target="_blank" rel="noopener noreferrer" className="block rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 p-3 transition-colors">
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
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
