import { useId } from "react";
import { kitFor } from "../lib/kits";

/**
 * Rosto ilustrado e estável por atleta: tom de pele, cabelo, barba e
 * sobrancelhas sorteados a partir do id; camisa nas cores do clube
 * (goleiro com camisa própria, técnico de terno).
 */

const SKIN = ["#f3cfb1", "#e7b48e", "#d29a6f", "#b47a50", "#8f5a36", "#6a4026", "#4e2e1b"];
const HAIR = ["#16100d", "#1f140e", "#2f1d12", "#4a2c18", "#6b4423", "#9a6a35", "#d4ad66", "#2b2b2b"];
const GK = ["#16c47f", "#f2c200", "#ff7a1a", "#2e8bff", "#e5408f"];

function rng(seed: number) {
  let t = (seed * 2654435761) >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(id: number | undefined, nome: string) {
  if (id != null) return id;
  let h = 7;
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * k)));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

export interface FaceProps {
  atletaId?: number;
  apelido: string;
  clubeId?: number;
  posicaoId?: number;
  size?: number;
}

export function Face({ atletaId, apelido, clubeId, posicaoId, size = 40 }: FaceProps) {
  const uid = useId().replace(/:/g, "");
  const r = rng(seedOf(atletaId, apelido));
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)];
  const skin = pick(SKIN);
  const skinDark = shade(skin, 0.82);
  const hair = r() < 0.12 ? pick(HAIR.slice(5)) : pick(HAIR.slice(0, 5));
  const hairStyle = Math.floor(r() * 8);
  const beard = r() < 0.45 ? 0 : 1 + Math.floor(r() * 4);
  const brow = 1.5 + r() * 0.9;
  const eyeY = 47 + r() * 1.5;
  const coach = posicaoId === 6;
  const kit = kitFor(clubeId);
  const shirt = posicaoId === 1 ? pick(GK) : kit.primary;
  const trim = posicaoId === 1 ? "#141414" : kit.secondary;
  const stripes = posicaoId !== 1 && !coach && kit.stripes;

  const cap = "M32.5 47 C 31 29, 40 22.5, 50 22.5 C 60.5 22.5, 69 29, 67.5 47 C 65.5 37.5, 60 32.5, 50 32.5 C 40.5 32.5, 34.5 37.5, 32.5 47 Z";

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={apelido} className="shrink-0 rounded-full">
      <defs>
        <radialGradient id={`bg${uid}`} cx="50%" cy="30%" r="75%">
          <stop offset="0" stopColor={shade(coach ? "#3a3f4a" : kit.primary.startsWith("#") ? kit.primary : "#3a3f4a", 0.75)} />
          <stop offset="1" stopColor="#0d0f13" />
        </radialGradient>
        <clipPath id={`c${uid}`}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
        <clipPath id={`s${uid}`}>
          <path d="M8 100 C 10 83, 29 75, 50 75 C 71 75, 90 83, 92 100 Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#c${uid})`}>
        <rect width="100" height="100" fill={`url(#bg${uid})`} />
        <g transform="translate(-12 -9) scale(1.24)">

        {/* cabelo atrás da cabeça */}
        {hairStyle === 2 && <circle cx="50" cy="37" r="23.5" fill={hair} />}
        {hairStyle === 5 && <path d="M30.5 46 C 28.5 25, 40 19.5, 50 19.5 C 60 19.5, 71.5 25, 69.5 46 L 71 70 C 67 74, 62.5 68, 62 61 L 38 61 C 37.5 68, 33 74, 29 70 Z" fill={hair} />}

        {/* pescoço */}
        <path d="M42.5 60 L 57.5 60 L 58.5 77 L 41.5 77 Z" fill={skinDark} />

        {/* tronco */}
        {coach ? (
          <g>
            <path d="M8 100 C 10 83, 29 75, 50 75 C 71 75, 90 83, 92 100 Z" fill="#20242c" />
            <path d="M42 75 L 50 92 L 58 75 Z" fill="#f2f2f2" />
            <path d="M48.3 78 L 51.7 78 L 52.6 90 L 50 94 L 47.4 90 Z" fill={kit.primary} />
            <path d="M42 75 L 50 92 L 38 100 L 30 79 Z M58 75 L 50 92 L 62 100 L 70 79 Z" fill="#2b313b" />
          </g>
        ) : (
          <g>
            <path d="M8 100 C 10 83, 29 75, 50 75 C 71 75, 90 83, 92 100 Z" fill={shirt} />
            {stripes && (
              <g clipPath={`url(#s${uid})`} fill={trim} opacity="0.95">
                {[16, 30, 44, 58, 72, 86].map((x) => (
                  <rect key={x} x={x - 3.5} y="70" width="7" height="32" />
                ))}
              </g>
            )}
            <path d="M41 75.5 C 44 81, 56 81, 59 75.5" fill="none" stroke={stripes ? "#f4f4f4" : trim} strokeWidth="3" strokeLinecap="round" />
            <path d="M8 100 C 10 83, 29 75, 50 75 C 71 75, 90 83, 92 100" fill="none" stroke="#000" strokeOpacity="0.25" strokeWidth="1" />
          </g>
        )}

        {/* orelhas e cabeça */}
        <ellipse cx="32.6" cy="49" rx="3.6" ry="5" fill={skinDark} />
        <ellipse cx="67.4" cy="49" rx="3.6" ry="5" fill={skinDark} />
        <ellipse cx="50" cy="46.5" rx="17.5" ry="21.5" fill={skin} />
        <path d="M33 52 C 35 64, 42 68.5, 50 68.5 C 58 68.5, 65 64, 67 52 C 64 62, 58 66, 50 66 C 42 66, 36 62, 33 52 Z" fill={skinDark} opacity="0.45" />

        {/* barba */}
        {beard === 1 && <path d="M33 50 C 33 66, 41 69.5, 50 69.5 C 59 69.5, 67 66, 67 50 C 64.5 60, 58.5 64.5, 50 64.5 C 41.5 64.5, 35.5 60, 33 50 Z" fill={hair} opacity="0.32" />}
        {beard === 2 && <path d="M32.8 49 C 32.5 66, 41 70.5, 50 70.5 C 59 70.5, 67.5 66, 67.2 49 C 65 59.5, 60 62, 55.5 59.8 C 52 58.5, 48 58.5, 44.5 59.8 C 40 62, 35 59.5, 32.8 49 Z" fill={hair} />}
        {beard === 3 && <path d="M44.5 61.5 C 45.5 69.5, 54.5 69.5, 55.5 61.5 C 53 64.8, 47 64.8, 44.5 61.5 Z" fill={hair} />}
        {(beard === 3 || beard === 4) && <path d="M44 58.6 C 46.5 56, 53.5 56, 56 58.6 C 53 57.7, 47 57.7, 44 58.6 Z" fill={hair} stroke={hair} strokeWidth="1.2" />}

        {/* cabelo por cima */}
        {hairStyle === 0 && <path d={cap} fill={hair} opacity="0.55" />}
        {(hairStyle === 1 || hairStyle === 5) && <path d={cap} fill={hair} />}
        {hairStyle === 2 && <path d={cap} fill={hair} />}
        {hairStyle === 3 && (
          <g fill={hair}>
            <path d={cap} />
            {[-70, -45, -20, 0, 20, 45, 70].map((ang) => {
              const rad = ((ang - 90) * Math.PI) / 180;
              return <circle key={ang} cx={50 + Math.cos(rad) * 15.5} cy={41 + Math.sin(rad) * 16} r="5.4" />;
            })}
          </g>
        )}
        {hairStyle === 4 && <ellipse cx="44" cy="31" rx="5" ry="2.6" fill="#fff" opacity="0.18" />}
        {hairStyle === 6 && (
          <g fill={hair}>
            <path d={cap} opacity="0.35" />
            <path d="M44.5 33 L 44 23.5 C 46 18.5, 54 18.5, 56 23.5 L 55.5 33 Z" />
          </g>
        )}
        {hairStyle === 7 && (
          <g fill={hair}>
            <path d={cap} />
            <path d="M32.5 42 C 37 27, 57 21, 68 37 C 61 30.5, 47 30, 39 37.5 Z" />
          </g>
        )}

        {/* olhos, sobrancelhas, nariz, boca */}
        <g>
          <ellipse cx="43" cy={eyeY} rx="2.7" ry="1.9" fill="#fff" />
          <ellipse cx="57" cy={eyeY} rx="2.7" ry="1.9" fill="#fff" />
          <circle cx="43.4" cy={eyeY} r="1.45" fill="#20140e" />
          <circle cx="57.4" cy={eyeY} r="1.45" fill="#20140e" />
          <path d={`M39 ${eyeY - 4.6} Q 43 ${eyeY - 6.4} 46.8 ${eyeY - 4.8}`} stroke={hair} strokeWidth={brow} fill="none" strokeLinecap="round" />
          <path d={`M53.2 ${eyeY - 4.8} Q 57 ${eyeY - 6.4} 61 ${eyeY - 4.6}`} stroke={hair} strokeWidth={brow} fill="none" strokeLinecap="round" />
          <path d="M50.2 49.5 Q 48 55.2 50.8 55.8" stroke={skinDark} strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <path d="M45.6 60.3 Q 50 62.8 54.4 60.3" stroke="#6b3a2e" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </g>
        </g>
      </g>
    </svg>
  );
}
