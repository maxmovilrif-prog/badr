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
      {/* Ambient glow on its own layer so the logo is never rasterized through a filter (stays pixel-sharp). */}
      <div className="absolute inset-0 -z-10 blur-3xl bg-cyan-400/20 rounded-full scale-110" aria-hidden="true" />
      <img
        src={LOGO}
        alt="ChatMaroc"
        width={1078}
        height={763}
        className="w-80 sm:w-[30rem] h-auto object-contain select-none cm-emblem-img"
        draggable="false"
      />
    </motion.div>
  </div>
);
