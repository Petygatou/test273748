import type { ReactNode } from "react";
import { NOME_POSICAO, POSICOES_CAMPINHO, type Campinho as Dados, type PosCampinho } from "../engine/campinhos";
import type { Club } from "../engine/types";
import { ClubBadge } from "./ui";

/** Onde cada posição fica no campinho (centro do par gol/assistência, em % do campo). */
const LUGAR: Record<PosCampinho, { x: number; y: number }> = {
  CENTRO: { x: 50, y: 12 },
  PONTE: { x: 22, y: 30 },
  PONTD: { x: 78, y: 30 },
  MEI: { x: 50, y: 44 },
  VOL: { x: 50, y: 61 },
  LATE: { x: 17, y: 64 },
  LATD: { x: 83, y: 64 },
  ZAG: { x: 50, y: 80 },
};

const ROTULO: Record<PosCampinho, string> = { CENTRO: "CENTRO", PONTE: "PONTE", PONTD: "PONTD", MEI: "MEI", VOL: "VOL", LATE: "LATE", LATD: "LATD", ZAG: "ZAG" };

type Props = {
  titulo?: ReactNode;
  clube?: Club;
  /** ver: mostra as contagens; escolher: toca para marcar gol (G) e assistência (A) */
  modo: "ver" | "escolher";
  dados?: Dados;
  gol?: PosCampinho | null;
  assist?: PosCampinho | null;
  onGol?: (p: PosCampinho) => void;
  onAssist?: (p: PosCampinho | null) => void;
  rodape?: ReactNode;
};

/** Campinho com um par (gols · assistências) em cada posição. */
export function Campinho({ titulo, clube, modo, dados, gol, assist, onGol, onAssist, rodape }: Props) {
  const maxG = Math.max(1, ...POSICOES_CAMPINHO.map((p) => dados?.gols[p] ?? 0));
  const maxA = Math.max(1, ...POSICOES_CAMPINHO.map((p) => dados?.assist[p] ?? 0));
  return (
    <div className="mx-auto w-full max-w-[460px]">
      {(titulo || clube) && (
        <div className="relative z-10 mb-[-14px] flex items-center gap-2 px-2">
          {clube && (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white shadow-md sm:h-14 sm:w-14">
              <ClubBadge club={clube} size={34} />
            </span>
          )}
          <span className="font-display min-w-0 flex-1 truncate rounded-full bg-[#0b1230] px-4 py-1.5 text-center text-base font-extrabold text-white uppercase sm:text-lg">
            {titulo ?? clube?.nome}
          </span>
        </div>
      )}
      <div className="relative aspect-[1/1.02] w-full select-none">
        <svg viewBox="0 0 100 102" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
          <polygon points="16,2 84,2 99,100 1,100" fill="#118a2c" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <polygon
              key={i}
              points={`${16 - i * 2.5},${2 + i * 16.3} ${84 + i * 2.5},${2 + i * 16.3} ${84 + (i + 0.5) * 2.5},${2 + (i + 0.5) * 16.3} ${16 - (i + 0.5) * 2.5},${2 + (i + 0.5) * 16.3}`}
              fill="#0f7f28"
            />
          ))}
          <g fill="none" stroke="#e8f5e9" strokeWidth="0.6" opacity="0.85">
            <polygon points="19,5 81,5 95,96 5,96" />
            <line x1="11.5" y1="52" x2="88.5" y2="52" />
            <ellipse cx="50" cy="52" rx="10" ry="7" />
            <polygon points="34,5 66,5 66.5,15 33.5,15" />
            <polygon points="27,96 73,96 71.5,80 28.5,80" />
            <polygon points="38,96 62,96 61.5,89 38.5,89" />
          </g>
        </svg>
        {POSICOES_CAMPINHO.map((p) => {
          const { x, y } = LUGAR[p];
          return (
            <div key={p} className="absolute flex -translate-x-1/2 -translate-y-1/2 gap-[3px]" style={{ left: `${x}%`, top: `${y}%`, width: "27%" }}>
              <Caixa
                tipo="gol"
                pos={p}
                valor={modo === "ver" ? (dados?.gols[p] ?? 0) : null}
                forte={modo === "ver" ? (dados?.gols[p] ?? 0) / maxG : 0}
                marcado={modo === "escolher" && gol === p}
                onClick={modo === "escolher" ? () => onGol?.(p) : undefined}
              />
              <Caixa
                tipo="assist"
                pos={p}
                valor={modo === "ver" ? (dados?.assist[p] ?? 0) : null}
                forte={modo === "ver" ? (dados?.assist[p] ?? 0) / maxA : 0}
                marcado={modo === "escolher" && assist === p}
                onClick={modo === "escolher" ? () => onAssist?.(assist === p ? null : p) : undefined}
              />
            </div>
          );
        })}
      </div>
      {rodape}
    </div>
  );
}

function Caixa({ tipo, pos, valor, forte, marcado, onClick }: { tipo: "gol" | "assist"; pos: PosCampinho; valor: number | null; forte: number; marcado: boolean; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  const nome = `${tipo === "gol" ? "Gol" : "Assistência"} · ${NOME_POSICAO[pos]}`;
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={onClick ? marcado : undefined}
      aria-label={valor == null ? nome : `${nome}: ${valor}`}
      title={nome}
      className={`flex min-w-0 flex-1 flex-col items-stretch overflow-hidden rounded-t-[10px] rounded-b-sm text-center shadow-md transition-transform ${onClick ? "cursor-pointer active:scale-95" : ""} ${
        marcado ? "ring-2 ring-[var(--color-gold)] ring-offset-1 ring-offset-[#118a2c]" : ""
      }`}
      style={{ background: marcado ? "#1f6b36" : valor ? `rgb(10 ${Math.round(40 + 40 * forte)} 22)` : "#0b2a15" }}
    >
      <span className={`font-display leading-none font-extrabold tabular ${valor == null ? (marcado ? "text-[var(--color-gold)]" : "text-white/35") : "text-white"} py-1 text-[clamp(18px,6vw,30px)]`}>
        {valor == null ? (tipo === "gol" ? "G" : "A") : valor}
      </span>
      <span className="flex items-center justify-center gap-0.5 bg-[#2340d6] px-0.5 text-[clamp(7px,2vw,10px)] leading-tight font-bold text-white">
        <span aria-hidden>{tipo === "gol" ? "⚽" : "👟"}</span>
        {tipo === "gol" ? "gols" : "assis."}
      </span>
      <span className="bg-[#0b1230] px-0.5 text-[clamp(7px,2vw,10px)] leading-tight font-bold text-white">{ROTULO[pos]}</span>
    </Tag>
  );
}
