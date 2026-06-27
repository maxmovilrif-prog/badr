// Dark cyberpunk backdrop with smooth purple/blue gradient waves.
// Pure SVG (vector) → infinitely crisp / HD at any resolution, no photo.
export const CyberBackground = () => (
  <div className="fixed inset-0 -z-10 cm-bg overflow-hidden" aria-hidden="true" data-testid="app-background">
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="cmWaveA" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#4f46e5" stopOpacity="0.40" />
          <stop offset="100%" stopColor="#2563eb" stopOpacity="0.30" />
        </linearGradient>
        <linearGradient id="cmWaveB" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2563eb" stopOpacity="0.45" />
          <stop offset="60%" stopColor="#3b82f6" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.28" />
        </linearGradient>
        <linearGradient id="cmWaveC" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#4c1d95" stopOpacity="0.50" />
          <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0.30" />
        </linearGradient>
        <filter id="cmSoft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="46" />
        </filter>
      </defs>
      <g filter="url(#cmSoft)">
        <path
          d="M-120,260 C260,120 540,360 860,250 C1140,150 1340,300 1560,230 L1560,560 C1300,500 1100,640 820,560 C520,470 240,600 -120,520 Z"
          fill="url(#cmWaveA)"
        />
        <path
          d="M-120,480 C300,360 640,600 1000,490 C1240,420 1380,540 1560,470 L1560,820 C1280,740 1040,860 720,780 C420,700 200,820 -120,760 Z"
          fill="url(#cmWaveB)"
        />
        <path
          d="M-120,700 C260,620 700,840 1080,720 C1320,650 1440,740 1560,700 L1560,980 L-120,980 Z"
          fill="url(#cmWaveC)"
        />
      </g>
    </svg>
  </div>
);
