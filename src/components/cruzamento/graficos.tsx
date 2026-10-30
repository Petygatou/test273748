import { useState } from "react";
import { fmt1, fmt2 } from "../../lib/format";
import { SERIES_A, SERIES_B } from "../charts";

const INK3 = "#8f8e88";
const GRADE = "rgb(255 255 255 / 0.07)";

/**
 * Histórico por partida de um scout: uma barra por jogo (mais antigo à esquerda), linha
 * tracejada na média da amostra. Toque/passe o mouse numa barra para ver o jogo.
 */
export function BarrasPartidas({ jogos, media, nome }: { jogos: Array<{ rodada: number; valor: number; adversario: string; casa: boolean; destaque?: boolean }>; media: number; nome: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!jogos.length) return <p className="py-6 text-center text-sm text-[var(--color-ink-3)]">Sem jogos na amostra.</p>;
  const W = 640;
  const H = 180;
  const pad = { l: 28, r: 8, t: 10, b: 30 };
  const max = Math.max(1, ...jogos.map((j) => j.valor), Math.ceil(media));
  const passo = (W - pad.l - pad.r) / jogos.length;
  const largura = Math.max(4, Math.min(28, passo - 2));
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, Math.round(max / 2), max];
  const sel = hover != null ? jogos[hover] : null;
  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${nome} por jogo: ${jogos.map((j) => `rodada ${j.rodada} ${j.valor}`).join(", ")}. Média ${fmt2(media)}.`}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={GRADE} />
            <text x={pad.l - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize="10" fill={INK3}>
              {t}
            </text>
          </g>
        ))}
        {jogos.map((j, i) => {
          const cx = pad.l + passo * i + passo / 2;
          const h = Math.max(j.valor > 0 ? 3 : 0, y(0) - y(j.valor));
          return (
            <g key={j.rodada}>
              {j.valor > 0 && <rect x={cx - largura / 2} y={y(0) - h} width={largura} height={h} rx={Math.min(4, largura / 2)} fill={SERIES_A} opacity={hover == null || hover === i ? 1 : 0.45} />}
              {j.valor === 0 && <rect x={cx - largura / 2} y={y(0) - 1.5} width={largura} height={1.5} fill={INK3} opacity={0.6} />}
              {(jogos.length <= 14 || i % Math.ceil(jogos.length / 14) === 0 || i === jogos.length - 1) && (
                <text x={cx} y={H - 16} textAnchor="middle" fontSize="9.5" fill={INK3}>
                  {j.adversario}
                </text>
              )}
              {(jogos.length <= 14 || i % Math.ceil(jogos.length / 14) === 0 || i === jogos.length - 1) && (
                <text x={cx} y={H - 4} textAnchor="middle" fontSize="9" fill={INK3}>
                  {j.casa ? "C" : "F"}·R{j.rodada}
                </text>
              )}
              <rect x={cx - passo / 2} y={0} width={passo} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={y(media)} y2={y(media)} stroke="#d8d6cf" strokeDasharray="4 4" strokeWidth={1.5} />
        <text x={W - pad.r} y={y(media) - 5} textAnchor="end" fontSize="10" fill="#d8d6cf">
          média {fmt2(media)}
        </text>
      </svg>
      <div className="mt-1 min-h-5 text-xs text-[var(--color-ink-2)]" aria-live="polite">
        {sel ? (
          <span>
            <b className="text-[var(--color-ink)]">Rodada {sel.rodada}</b> · {sel.casa ? "em casa" : "fora"} contra {sel.adversario} · <b className="tabular text-[var(--color-ink)]">{sel.valor}</b>{" "}
            {nome.toLowerCase()}
          </span>
        ) : (
          <span className="text-[var(--color-ink-3)]">Toque numa barra para ver o jogo. C = em casa, F = fora.</span>
        )}
      </div>
    </div>
  );
}

export interface LinhaIndice {
  codigo: string;
  nome: string;
  jogador: number;
  adversario: number | null;
  posicao: number;
}

/**
 * Jogador × adversário, na mesma escala: cada valor dividido pela média da posição
 * (1,0× = média). Laranja = o que o jogador faz por jogo; azul = o que o adversário cede,
 * por atleta da posição. Toque numa linha para ver os números crus.
 */
export function IndiceComparativo({ linhas }: { linhas: LinhaIndice[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const validas = linhas.filter((l) => l.posicao > 0);
  if (!validas.length) return <p className="py-6 text-center text-sm text-[var(--color-ink-3)]">Sem médias da posição para comparar.</p>;
  const idx = (v: number, l: LinhaIndice) => v / l.posicao;
  const max = Math.max(2, ...validas.flatMap((l) => [idx(l.jogador, l), l.adversario != null ? idx(l.adversario, l) : 0]));
  const teto = Math.ceil(max * 2) / 2;
  const sel = validas.find((l) => l.codigo === hover) ?? null;
  const pctX = (v: number) => `${Math.min(100, (v / teto) * 100)}%`;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-ink-2)]">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES_A }} aria-hidden /> Jogador: média por jogo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES_B }} aria-hidden /> Adversário cede, por atleta da posição
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-0 border-l-2 border-dashed border-[#d8d6cf]" aria-hidden /> média da posição (1,0×)
        </span>
      </div>
      <ul className="space-y-2.5" role="list">
        {validas.map((l) => (
          <li key={l.codigo} className="grid grid-cols-[88px_1fr] items-center gap-2 sm:grid-cols-[150px_1fr]" onMouseEnter={() => setHover(l.codigo)} onClick={() => setHover(l.codigo)}>
            <span className="truncate text-xs font-semibold text-[var(--color-ink-2)]" title={l.nome}>
              {l.nome}
            </span>
            <div className="relative space-y-[2px] py-0.5">
              <span className="pointer-events-none absolute inset-y-0 border-l-2 border-dashed border-[#d8d6cf]/70" style={{ left: pctX(1) }} aria-hidden />
              {(
                [
                  ["jogador", l.jogador, SERIES_A],
                  ["adversario", l.adversario, SERIES_B],
                ] as const
              ).map(([k, v, cor]) =>
                v == null ? (
                  <div key={k} className="h-2.5 text-[10px] leading-[10px] text-[var(--color-ink-3)]">
                    sem dado
                  </div>
                ) : (
                  <div key={k} className="flex h-2.5 items-center gap-1.5">
                    <div className="h-2.5 rounded-r-[4px]" style={{ width: pctX(idx(v, l)), minWidth: 2, background: cor }} />
                    <span className="tabular text-[10px] leading-none text-[var(--color-ink-2)]">{fmt1(idx(v, l))}×</span>
                  </div>
                ),
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-2 min-h-5 text-xs text-[var(--color-ink-2)]" aria-live="polite">
        {sel ? (
          <span>
            <b className="text-[var(--color-ink)]">{sel.nome}</b>: jogador {fmt2(sel.jogador)} por jogo · adversário cede {sel.adversario != null ? fmt2(sel.adversario) : "—"} · média da posição{" "}
            {fmt2(sel.posicao)}
          </span>
        ) : (
          <span className="text-[var(--color-ink-3)]">Toque numa linha para ver os números por jogo.</span>
        )}
      </div>
    </div>
  );
}

/** Cenários de pontuação numa régua: conservador (20%), central (50%), favorável (80%) e a média. */
export function FaixaCenarios({ p20, p50, p80, esperado }: { p20: number; p50: number; p80: number; esperado: number }) {
  const lo = Math.min(-2, Math.floor(p20 - 1));
  const hi = Math.max(12, Math.ceil(p80 + 1));
  const x = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  return (
    <div className="pt-6 pb-5" role="img" aria-label={`Cenários: conservador ${fmt1(p20)}, central ${fmt1(p50)}, favorável ${fmt1(p80)}; média ${fmt1(esperado)} pontos.`}>
      <div className="relative h-2 rounded-full bg-[var(--color-surface-1)]">
        <div className="absolute inset-y-0 rounded-full" style={{ left: x(p20), width: `calc(${x(p80)} - ${x(p20)})`, background: `${SERIES_A}66` }} />
        <div className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: x(p50), background: SERIES_A }} />
        <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-[var(--color-surface-2)] bg-[#d8d6cf]" style={{ left: x(esperado) }} />
        {[
          [p20, "20%"],
          [p50, "50%"],
          [p80, "80%"],
        ].map(([v, r]) => (
          <span key={r} className="absolute -top-5 -translate-x-1/2 text-[10px] text-[var(--color-ink-3)] tabular" style={{ left: x(v as number) }}>
            {fmt1(v as number)}
          </span>
        ))}
        <span className="absolute top-3 left-0 text-[10px] text-[var(--color-ink-3)]">{lo}</span>
        <span className="absolute top-3 right-0 text-[10px] text-[var(--color-ink-3)]">{hi}</span>
        {lo < 0 && <span className="absolute top-3 h-2 border-l border-[var(--color-line-strong)]" style={{ left: x(0) }} aria-hidden />}
      </div>
    </div>
  );
}
