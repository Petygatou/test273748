import { useId } from "react";
import { kitFor } from "../lib/kits";

/**
 * Ícone do atleta: a camisa do clube (com listras quando o uniforme tem),
 * goleiro com camisa própria e técnico de terno e gravata.
 */

const GK = "#16c47f";

function shade(color: string, k: number) {
  if (!color.startsWith("#")) return color;
  const n = parseInt(color.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * k)));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

// camisa de manga curta centralizada no quadro 100×100
const CAMISA = "M36 20 L22 25 L10 40 L19 49 L26 43 L26 82 L74 82 L74 43 L81 49 L90 40 L78 25 L64 20 C61 26 56 29 50 29 C44 29 39 26 36 20 Z";
const GOLA = "M36 20 C39 26 44 29 50 29 C56 29 61 26 64 20 L59 18.5 C57 22.5 54 24.5 50 24.5 C46 24.5 43 22.5 41 18.5 Z";

export function Shirt({ apelido, clubeId, posicaoId, size = 40 }: { apelido: string; clubeId?: number; posicaoId?: number; size?: number }) {
  const uid = useId().replace(/:/g, "");
  const kit = kitFor(clubeId);
  const coach = posicaoId === 6;
  const gk = posicaoId === 1;
  const cor = coach ? "#2a2f3a" : gk ? GK : kit.primary;
  const detalhe = coach ? "#f4f4f4" : gk ? "#141414" : kit.secondary;
  const listras = !coach && !gk && kit.stripes;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={apelido} className="shrink-0 rounded-full">
      <defs>
        <radialGradient id={`bg${uid}`} cx="50%" cy="25%" r="80%">
          <stop offset="0" stopColor="#262a33" />
          <stop offset="1" stopColor="#0f1115" />
        </radialGradient>
        <clipPath id={`cm${uid}`}>
          <path d={CAMISA} />
        </clipPath>
        <linearGradient id={`lz${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.18" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.22" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#bg${uid})`} />
      <g transform="translate(0 4)">
        <path d={CAMISA} fill={cor} />
        <g clipPath={`url(#cm${uid})`}>
          {listras && [30, 44, 58, 72].map((x) => <rect key={x} x={x - 4} y="0" width="7" height="100" fill={detalhe} />)}
          {coach ? (
            <>
              {/* camisa branca, lapelas e gravata */}
              <path d="M41 19 L50 52 L59 19 Z" fill="#f4f4f4" />
              <path d="M47.5 27 L52.5 27 L54 50 L50 56 L46 50 Z" fill="#c8102e" />
              <path d="M36 20 L50 52 L42 56 L34 30 Z M64 20 L50 52 L58 56 L66 30 Z" fill={shade(cor, 0.75)} />
            </>
          ) : (
            <>
              {/* barra das mangas */}
              <path d="M10 40 L19 49 L21.5 46.8 L12.6 37.6 Z M90 40 L81 49 L78.5 46.8 L87.4 37.6 Z" fill={detalhe} opacity={listras ? 0 : 0.9} />
            </>
          )}
          <rect width="100" height="100" fill={`url(#lz${uid})`} />
        </g>
        {!coach && <path d={GOLA} fill={detalhe} />}
        <path d={CAMISA} fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="1.5" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
