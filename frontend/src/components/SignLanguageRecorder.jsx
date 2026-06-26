import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X, Video, Square, RotateCcw, Send, Loader2 } from "lucide-react";

export const SignLanguageRecorder = ({ onClose, onSend, sending }) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const closeBtnRef = useRef(null);

  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        if (!active) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (e) {
        setError("Camera access denied. Please allow webcam permissions to record sign language.");
      }
    })();
    closeBtnRef.current?.focus();
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    setRecordedBlob(null);
    setPreviewUrl(null);
    setSeconds(0);
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
    const rec = new MediaRecorder(streamRef.current, { mimeType: mime });
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      setRecordedBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
    };
    recorderRef.current = rec;
    rec.start();
    setRecording(true);
  };

  const stopRecording = () => { recorderRef.current?.stop(); setRecording(false); };

  const retake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setRecordedBlob(null);
    setPreviewUrl(null);
    setSeconds(0);
    if (videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
  };

  const handleSend = () => { if (recordedBlob) onSend(recordedBlob); };
  const fmt = (s) => `0:${String(s).padStart(2, "0")}`;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Record sign language video"
      data-testid="sign-language-modal"
    >
      <motion.div
        className="w-full max-w-lg bg-black/60 backdrop-blur-2xl rounded-3xl shadow-2xl overflow-hidden border border-white/10"
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-purple-400" />
            <h2 className="font-heading text-xl text-white font-semibold">Sign Language</h2>
          </div>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            className="rounded-full p-2 hover:bg-white/10 text-slate-300 hover:text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none transition-colors"
            aria-label="Close recorder"
            data-testid="sign-language-close-button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-sm text-slate-400 mb-4">
            Record a short clip of your gesture and send it. We'll interpret it for you.
          </p>

          {error ? (
            <div className="rounded-2xl bg-rose-500/15 border border-rose-400/20 text-rose-200 p-4 text-sm" data-testid="sign-language-error">
              {error}
            </div>
          ) : (
            <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-lg bg-black aspect-video">
              {previewUrl ? (
                <video src={previewUrl} controls className="w-full h-full object-cover" data-testid="sign-language-preview" />
              ) : (
                <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover -scale-x-100" data-testid="sign-language-live" />
              )}
              {recording && (
                <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 text-white px-3 py-1 rounded-full text-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                  REC {fmt(seconds)}
                </div>
              )}
            </div>
          )}

          {!error && (
            <div className="flex items-center justify-center gap-3 mt-6">
              {!recordedBlob && !recording && (
                <button onClick={startRecording} className="rounded-full bg-purple-500 hover:bg-purple-400 text-white px-6 py-3 gap-2 flex items-center font-medium transition-colors" data-testid="sign-language-start-button">
                  <Video className="w-5 h-5" /> Start recording
                </button>
              )}
              {recording && (
                <button onClick={stopRecording} className="rounded-full bg-rose-600 hover:bg-rose-500 text-white px-6 py-3 gap-2 flex items-center font-medium cm-recording transition-colors" data-testid="sign-language-stop-button">
                  <Square className="w-5 h-5" /> Stop
                </button>
              )}
              {recordedBlob && !recording && (
                <>
                  <button onClick={retake} className="rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-white px-6 py-3 gap-2 flex items-center font-medium transition-colors" data-testid="sign-language-retake-button">
                    <RotateCcw className="w-5 h-5" /> Retake
                  </button>
                  <button onClick={handleSend} disabled={sending} className="rounded-full bg-cyan-500 hover:bg-cyan-400 text-black px-6 py-3 gap-2 flex items-center font-medium transition-colors disabled:opacity-60" data-testid="sign-language-send-button">
                    {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    Send gesture
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
