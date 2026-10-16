/** 8 avatares ilustrados exclusivos (SVG vetorial, leves e nítidos em qualquer tamanho). */
import type { AvatarKey } from "../lib/storage";

export const AVATAR_LABELS: Record<AvatarKey, string> = {
  aguia: "Águia",
  leao: "Leão",
  astronauta: "Astronauta",
  gladiador: "Gladiador",
  robo: "Robô",
  capitao: "Capitão",
  lobo: "Lobo",
  estrategista: "Estrategista",
};

const BG: Record<AvatarKey, [string, string]> = {
  aguia: ["#3a2a12", "#8a5a12"],
  leao: ["#3d1f08", "#c2650f"],
  astronauta: ["#0f1d3a", "#2f5fb3"],
  gladiador: ["#3a1010", "#9c2323"],
  robo: ["#0d2b2b", "#1c8f87"],
  capitao: ["#2d2306", "#c9a106"],
  lobo: ["#1a1d24", "#5b6577"],
  estrategista: ["#24123a", "#6a3fc0"],
};

function Glyph({ k }: { k: AvatarKey }) {
  switch (k) {
    case "aguia":
      return (
        <g>
          <path d="M14 40c4-14 14-22 28-22 6 0 10 3 12 7-5-1-8 0-10 2 4 1 6 3 6 6-6-3-11-2-15 2-3 3-5 7-6 12-5-1-11-3-15-7z" fill="#f2e2c4" />
          <path d="M44 25c4 0 8 2 10 5l-6 1z" fill="#f5c518" />
          <circle cx="40" cy="24" r="2" fill="#1b1206" />
          <path d="M14 40c6 2 11 5 15 7-1 4-1 7 0 10-7-3-12-9-15-17z" fill="#b98b48" />
        </g>
      );
    case "leao":
      return (
        <g>
          <circle cx="32" cy="34" r="19" fill="#e08a1e" />
          <circle cx="32" cy="35" r="12" fill="#f6c15c" />
          <circle cx="27.5" cy="33" r="1.8" fill="#2a1503" />
          <circle cx="36.5" cy="33" r="1.8" fill="#2a1503" />
          <path d="M29 38h6l-3 3z" fill="#2a1503" />
          <path d="M28 43c2 2 6 2 8 0" stroke="#2a1503" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </g>
      );
    case "astronauta":
      return (
        <g>
          <circle cx="32" cy="32" r="18" fill="#e9eef7" />
          <rect x="19" y="24" width="26" height="16" rx="8" fill="#0d1a33" />
          <path d="M24 29c3-3 8-3 11-1" stroke="#ff6b1a" strokeWidth="2" fill="none" strokeLinecap="round" />
          <rect x="22" y="48" width="20" height="6" rx="3" fill="#c9d2e3" />
          <circle cx="47" cy="20" r="2" fill="#f5c518" />
        </g>
      );
    case "gladiador":
      return (
        <g>
          <path d="M20 30c0-8 5-14 12-14s12 6 12 14v14c0 4-3 6-6 6H26c-3 0-6-2-6-6z" fill="#c9c6bd" />
          <path d="M32 6c6 2 10 6 11 12-4-2-7-3-11-3s-7 1-11 3c1-6 5-10 11-12z" fill="#e23b2e" />
          <rect x="24" y="30" width="16" height="3" rx="1.5" fill="#1b1b1b" />
          <rect x="30.5" y="33" width="3" height="12" rx="1.5" fill="#1b1b1b" />
        </g>
      );
    case "robo":
      return (
        <g>
          <line x1="32" y1="10" x2="32" y2="18" stroke="#c7f5ef" strokeWidth="2" />
          <circle cx="32" cy="9" r="3" fill="#ff6b1a" />
          <rect x="17" y="18" width="30" height="26" rx="7" fill="#c7f5ef" />
          <rect x="22" y="25" width="20" height="9" rx="4.5" fill="#0d2b2b" />
          <circle cx="27" cy="29.5" r="2.4" fill="#5ef2e0" />
          <circle cx="37" cy="29.5" r="2.4" fill="#5ef2e0" />
          <rect x="25" y="37" width="14" height="3" rx="1.5" fill="#0d2b2b" />
          <rect x="22" y="46" width="20" height="8" rx="3" fill="#9fded6" />
        </g>
      );
    case "capitao":
      return (
        <g>
          <rect x="12" y="24" width="40" height="18" rx="4" fill="#f5c518" />
          <rect x="12" y="24" width="40" height="4" fill="#d9a90b" />
          <rect x="12" y="38" width="40" height="4" fill="#d9a90b" />
          <text x="32" y="38.5" textAnchor="middle" fontFamily="Oxanium, sans-serif" fontWeight="800" fontSize="14" fill="#2d2306">
            C
          </text>
          <path d="M32 9l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" fill="#fff4c2" />
        </g>
      );
    case "lobo":
      return (
        <g>
          <path d="M16 18l9 8h14l9-8-2 18c0 9-6 16-14 16s-14-7-14-16z" fill="#c5ccd8" />
          <path d="M25 40c2 4 4 6 7 6s5-2 7-6c-4 1-10 1-14 0z" fill="#eef1f6" />
          <path d="M22 31l6 2-6 2z" fill="#1a1d24" />
          <path d="M42 31l-6 2 6 2z" fill="#1a1d24" />
          <path d="M29 40h6l-3 3z" fill="#1a1d24" />
        </g>
      );
    case "estrategista":
      return (
        <g>
          <rect x="14" y="14" width="36" height="36" rx="4" fill="#efe9fb" />
          <line x1="32" y1="14" x2="32" y2="50" stroke="#6a3fc0" strokeWidth="1.2" />
          <circle cx="32" cy="32" r="6" stroke="#6a3fc0" strokeWidth="1.2" fill="none" />
          <circle cx="22" cy="24" r="2.5" fill="#ff6b1a" />
          <circle cx="24" cy="40" r="2.5" fill="#ff6b1a" />
          <circle cx="40" cy="26" r="2.5" fill="#24123a" />
          <path d="M23 26c4 6 8 8 14 6" stroke="#24123a" strokeWidth="1.6" fill="none" strokeDasharray="2 2" />
          <path d="M36 31l2-3 1 4z" fill="#24123a" />
        </g>
      );
  }
}

export function Avatar({ k, size = 40, ring = false }: { k: AvatarKey; size?: number; ring?: boolean }) {
  const [a, b] = BG[k] ?? BG.aguia;
  const id = `av-${k}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={`Avatar ${AVATAR_LABELS[k]}`}
      className={ring ? "rounded-full ring-2 ring-[var(--color-brand)] ring-offset-2 ring-offset-[var(--color-page)]" : "rounded-full"}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={b} />
          <stop offset="1" stopColor={a} />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill={`url(#${id})`} />
      <Glyph k={k} />
    </svg>
  );
}
