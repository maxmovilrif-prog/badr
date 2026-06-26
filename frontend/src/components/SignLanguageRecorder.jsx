import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X, Video, Square, RotateCcw, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
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
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";
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

  const stopRecording = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  const retake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setRecordedBlob(null);
    setPreviewUrl(null);
    setSeconds(0);
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  };

  const handleSend = () => {
    if (recordedBlob) onSend(recordedBlob);
  };

  const fmt = (s) => `0:${String(s).padStart(2, "0")}`;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#2C2E33]/50 backdrop-blur-sm p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Record sign language video"
      data-testid="sign-language-modal"
    >
      <motion.div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-[#E5E1D8]"
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E1D8]">
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-[#E76F51]" />
            <h2 className="font-heading text-xl text-[#2C2E33]">Sign Language</h2>
          </div>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            className="rounded-full p-2 hover:bg-[#F0EDE5] focus:ring-2 focus:ring-[#2A9D8F] focus:outline-none"
            aria-label="Close recorder"
            data-testid="sign-language-close-button"
          >
            <X className="w-5 h-5 text-[#6B6A3A]" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-sm text-[#6B6A3A] mb-4">
            Record a short clip of your gesture and send it. We'll interpret it for you.
          </p>

          {error ? (
            <div className="rounded-2xl bg-[#F8E9E4] text-[#8C3F2D] p-4 text-sm" data-testid="sign-language-error">
              {error}
            </div>
          ) : (
            <div className="relative rounded-2xl overflow-hidden border border-[#E5E1D8] shadow-lg bg-black aspect-video">
              {previewUrl ? (
                <video src={previewUrl} controls className="w-full h-full object-cover" data-testid="sign-language-preview" />
              ) : (
                <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover -scale-x-100" data-testid="sign-language-live" />
              )}
              {recording && (
                <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#E76F51] animate-pulse" />
                  REC {fmt(seconds)}
                </div>
              )}
            </div>
          )}

          {!error && (
            <div className="flex items-center justify-center gap-3 mt-6">
              {!recordedBlob && !recording && (
                <Button
                  onClick={startRecording}
                  className="rounded-full bg-[#E76F51] hover:bg-[#d85f43] text-white px-6 py-6 gap-2"
                  data-testid="sign-language-start-button"
                >
                  <Video className="w-5 h-5" /> Start recording
                </Button>
              )}
              {recording && (
                <Button
                  onClick={stopRecording}
                  className="rounded-full bg-[#8C3F2D] hover:bg-[#73331f] text-white px-6 py-6 gap-2 cm-recording"
                  data-testid="sign-language-stop-button"
                >
                  <Square className="w-5 h-5" /> Stop
                </Button>
              )}
              {recordedBlob && !recording && (
                <>
                  <Button
                    onClick={retake}
                    variant="outline"
                    className="rounded-full border-[#E5E1D8] text-[#2C2E33] px-6 py-6 gap-2 hover:bg-[#F0EDE5]"
                    data-testid="sign-language-retake-button"
                  >
                    <RotateCcw className="w-5 h-5" /> Retake
                  </Button>
                  <Button
                    onClick={handleSend}
                    disabled={sending}
                    className="rounded-full bg-[#264653] hover:bg-[#1d3742] text-white px-6 py-6 gap-2"
                    data-testid="sign-language-send-button"
                  >
                    {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    Send gesture
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
