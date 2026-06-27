import { toast } from "sonner";
import {
  Menu, Download, Share2, Settings, Volume2, VolumeX, AudioLines, ChevronDown, LogIn, Loader2,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const VOICES = [
  { id: "nova", name: "Nova", desc: "Energetic" },
  { id: "shimmer", name: "Shimmer", desc: "Bright" },
  { id: "alloy", name: "Alloy", desc: "Neutral" },
  { id: "coral", name: "Coral", desc: "Warm" },
  { id: "onyx", name: "Onyx", desc: "Deep" },
  { id: "sage", name: "Sage", desc: "Calm" },
  { id: "fable", name: "Fable", desc: "Expressive" },
];

export const ChatHeader = ({
  onOpenSidebar, onExport, exporting, onShare, onOpenSettings,
  autoSpeak, onToggleAutoSpeak, voice, onVoiceChange,
}) => {
  const currentVoice = VOICES.find((v) => v.id === voice)?.name || "Nova";

  const handleLogin = () => {
    toast("Inicio de sesión próximamente 🔒", { description: "Las cuentas de cliente estarán disponibles pronto." });
  };

  return (
    <header className="h-14 px-3 sm:px-5 flex items-center justify-between bg-black/20 backdrop-blur-md border-b border-white/5 z-30">
      <div className="flex items-center gap-2">
        <button
          className="md:hidden p-2 rounded-lg hover:bg-white/10 text-white transition-colors"
          onClick={onOpenSidebar}
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
          onClick={onExport}
          disabled={exporting}
          className="hidden sm:inline-flex p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
          aria-label="Export conversation as PDF"
          title="Export as PDF"
          data-testid="export-pdf-button"
        >
          {exporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
        </button>
        <button
          onClick={onShare}
          className="hidden sm:inline-flex p-2 rounded-full text-slate-400 hover:text-cyan-300 hover:bg-white/10 transition-colors"
          aria-label="Share conversation link"
          title="Share read-only link"
          data-testid="share-button"
        >
          <Share2 className="w-5 h-5" />
        </button>
        <button
          onClick={onOpenSettings}
          className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Open settings"
          title="Settings"
          data-testid="settings-button"
        >
          <Settings className="w-5 h-5" />
        </button>
        <button
          onClick={onToggleAutoSpeak}
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
            <DropdownMenuRadioGroup value={voice} onValueChange={onVoiceChange}>
              {VOICES.map((v) => (
                <DropdownMenuRadioItem key={v.id} value={v.id} className="focus:bg-white/10 focus:text-white" data-testid={`voice-option-${v.id}`}>
                  <span className="font-medium">{v.name}</span>
                  <span className="ml-2 text-xs text-slate-400">{v.desc}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="w-px h-6 bg-white/10 mx-1 hidden sm:block" />

        <button
          onClick={handleLogin}
          className="inline-flex items-center gap-2 pl-3.5 pr-4 py-2 rounded-full border border-white/20 bg-white/[0.06] text-white text-sm font-medium transition-all duration-200 hover:bg-white/[0.12] hover:border-cyan-400/40 hover:scale-[1.04] active:scale-95 shadow-sm"
          data-testid="login-button"
        >
          <LogIn className="w-4 h-4 text-cyan-300" />
          <span>Iniciar sesión</span>
        </button>
      </div>
    </header>
  );
};
