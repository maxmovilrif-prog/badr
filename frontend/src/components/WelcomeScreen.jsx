import { motion } from "framer-motion";

const LOGO = "/chatmaroc-lego.png";

const ENTER = { opacity: 0, scale: 0.85 };
const SHOW = { opacity: 1, scale: 1 };

export const WelcomeScreen = () => (
  <div className="min-h-full flex flex-col items-center justify-center px-6 py-10 text-center">
    <motion.div
      initial={ENTER}
      animate={SHOW}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="relative cm-emblem"
      data-testid="welcome-emblem"
    >
      {/* Ambient glow behind the framed LEGO hero. */}
      <div className="absolute -inset-6 -z-10 blur-3xl bg-cyan-400/20 rounded-[2rem]" aria-hidden="true" />
      <img
        src={LOGO}
        alt="ChatMaroc"
        width={1264}
        height={848}
        className="w-80 sm:w-[32rem] h-auto object-contain select-none cm-emblem-img rounded-3xl border border-white/10 shadow-2xl shadow-cyan-500/10"
        draggable="false"
      />
    </motion.div>
  </div>
);
