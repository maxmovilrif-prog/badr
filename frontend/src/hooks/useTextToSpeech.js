import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

// Encapsulates text-to-speech playback (fetch mp3 → play), with single-track
// management so starting a new clip stops the previous one cleanly.
export const useTextToSpeech = (api, voice, language) => {
  const [speakingId, setSpeakingId] = useState(null);
  const [ttsLoadingId, setTtsLoadingId] = useState(null);
  const audioRef = useRef(null);
  const urlRef = useRef(null);

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    setSpeakingId(null);
  }, []);

  const speak = useCallback(async (text, id) => {
    if (!text || !text.trim()) return;
    if (speakingId === id) { stopSpeaking(); return; }
    stopSpeaking();
    setTtsLoadingId(id);
    try {
      const res = await fetch(`${api}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice, language }),
      });
      if (!res.ok) throw new Error("TTS failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setSpeakingId(null); URL.revokeObjectURL(url); urlRef.current = null; };
      audio.onerror = () => setSpeakingId(null);
      setSpeakingId(id);
      await audio.play();
    } catch {
      toast.error("Voice playback failed.");
    } finally {
      setTtsLoadingId(null);
    }
  }, [api, speakingId, stopSpeaking, voice, language]);

  return { speak, stopSpeaking, speakingId, ttsLoadingId };
};
