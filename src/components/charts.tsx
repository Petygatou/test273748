/**
 * Gráficos em SVG puro (leves, acessíveis e coerentes com o tema).
 * Paleta validada para daltonismo no fundo escuro: série A laranja, série B azul.
 */
import { useState } from "react";
import { fmt1 } from "../lib/format";

export const SERIES_A = "#e8641f";
export const SERIES_B = "#3987e5";

interface RadarSeries {
  label: string;
  values: number[]; // 0..100
  raw: string[]; // valor real exibido no tooltip
  color: string;
}

export function Radar({ axes, series, size = 300 }: { axes: string[]; series: RadarSeries[]; size?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const c = size / 2;
  const r = size / 2 - 48;
  const n = axes.length;
  const pt = (i: number, v: number) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [c + Math.cos(ang) * r * (v / 100), c + Math.sin(ang) * r * (v / 100)] as const;
  };
  return (
    <div className="w-full">
      <svg viewBox={`-56 -6 ${size + 112} ${size + 12}`} className="mx-auto block w-full max-w-[420px]" role="img" aria-label={`Radar comparando ${series.map((s) => s.label).join(" e ")}`}>
        {[25, 50, 75, 100].map((g) => (
          <polygon
            key={g}
            points={axes.map((_, i) => pt(i, g).join(",")).join(" ")}
            fill="none"
            stroke="rgb(255 255 255 / 0.08)"
            strokeWidth={1}
          />
        ))}
        {axes.map((a, i) => {
          const [x, y] = pt(i, 100);
          const [lx, ly] = pt(i, 122);
          return (
            <g key={a}>
              <line x1={c} y1={c} x2={x} y2={y} stroke="rgb(255 255 255 / 0.08)" />
              <text
                x={lx}
                y={ly}
                textAnchor={Math.abs(lx - c) < 8 ? "middle" : lx > c ? "start" : "end"}
                dominantBaseline="middle"
                fontSize="11"
                fill={hover === i ? "#f2f1ee" : "#8f8e88"}
                fontWeight={hover === i ? 700 : 500}
              >
                {a}
              </text>
              {/* alvo de hover maior que a marca */}
              <circle cx={x} cy={y} r={22} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${a}: ${series.map((s) => `${s.label} ${s.raw[i]}`).join(", ")}`} />
            </g>
          );
        })}
        {series.map((s) => (
          <g key={s.label}>
            <polygon points={s.values.map((v, i) => pt(i, Math.max(4, v)).join(",")).join(" ")} fill={s.color} fillOpacity={0.14} stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
            {s.values.map((v, i) => {
              const [x, y] = pt(i, Math.max(4, v));
              return <circle key={i} cx={x} cy={y} r={4} fill={s.color} stroke="#17181c" strokeWidth={2} />;
            })}
          </g>
        ))}
      </svg>
      <div className="mt-1 flex min-h-5 flex-wrap items-center justify-center gap-3 text-xs" aria-live="polite">
        {hover == null
          ? series.map((s) => (
              <span key={s.label} className="flex items-center gap-1.5 text-[var(--color-ink-2)]">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
                {s.label}
              </span>
            ))
          : (
            <span className="text-[var(--color-ink-2)]">
              <b className="text-[var(--color-ink)]">{axes[hover]}</b>:{" "}
              {series.map((s, k) => (
                <span key={s.label}>
                  {k > 0 && " · "}
                  <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} aria-hidden />
                  {s.label} {s.raw[hover]}
                </span>
              ))}
            </span>
          )}
      </div>
    </div>
  );
}

/** Cor divergente para fatores relativos (1 = média da liga). */
export function divergingColor(f: number, spread = 0.35): { bg: string; fg: string } {
  const t = Math.max(-1, Math.min(1, (f - 1) / spread));
  const neutral = [56, 56, 53];
  const warm = [232, 100, 31];
  const cool = [57, 135, 229];
  const pole = t >= 0 ? warm : cool;
  const k = Math.abs(t) * 0.9;
  const mix = neutral.map((n, i) => Math.round(n + (pole[i] - n) * k));
  return { bg: `rgb(${mix.join(" ")})`, fg: k > 0.55 ? "#140700" : "#f2f1ee" };
}

/** Barras das últimas rodadas (nulo = não jogou). */
export function RoundBars({ data, height = 64 }: { data: Array<{ rodada: number; pontos: number | null }>; height?: number }) {
  const max = Math.max(10, ...data.map((d) => Math.abs(d.pontos ?? 0)));
  const min = Math.min(0, ...data.map((d) => d.pontos ?? 0));
  const span = max - min;
  const zeroY = (max / span) * height;
  return (
    <div className="flex items-end gap-1.5" role="img" aria-label={`Pontuações recentes: ${data.map((d) => `rodada ${d.rodada} ${d.pontos == null ? "não jogou" : fmt1(d.pontos)}`).join(", ")}`}>
      {data.map((d) => {
        const v = d.pontos;
        const h = v == null ? 0 : (Math.abs(v) / span) * height;
        return (
          <div key={d.rodada} className="flex flex-1 flex-col items-center gap-1" title={`R${d.rodada}: ${v == null ? "não jogou" : fmt1(v)}`}>
            <div className="tabular text-[10px] text-[var(--color-ink-2)]">{v == null ? "—" : fmt1(v)}</div>
            <div className="relative w-full" style={{ height }}>
              <div className="absolute inset-x-0 border-t border-[var(--color-line-strong)]" style={{ top: zeroY }} />
              {v != null && (
                <div
                  className="absolute inset-x-1 rounded-[4px]"
                  style={{
                    top: v >= 0 ? zeroY - h : zeroY,
                    height: Math.max(2, h),
                    background: v >= 0 ? SERIES_A : "#d03b3b",
                    borderRadius: v >= 0 ? "4px 4px 0 0" : "0 0 4px 4px",
                  }}
                />
              )}
            </div>
            <div className="text-[10px] text-[var(--color-ink-3)]">R{d.rodada}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Linhas (até 2 séries) com crosshair + tooltip; uma escala, um eixo. */
export function LineChart({
  x,
  series,
  height = 220,
  format = (v: number) => fmt1(v),
  xLabel = (v: number) => `R${v}`,
}: {
  x: number[];
  series: Array<{ label: string; color: string; values: number[] }>;
  height?: number;
  format?: (v: number) => string;
  xLabel?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const pad = { l: 36, r: 12, t: 12, b: 26 };
  const all = series.flatMap((s) => s.values);
  const lo = Math.floor(Math.min(...all) / 10) * 10;
  const hi = Math.ceil(Math.max(...all) / 10) * 10;
  const sx = (i: number) => pad.l + (x.length <= 1 ? 0 : (i / (x.length - 1)) * (W - pad.l - pad.r));
  const sy = (v: number) => pad.t + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - pad.t - pad.b);
  const ticks = [lo, lo + (hi - lo) / 2, hi];
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Gráfico de linhas: ${series.map((s) => s.label).join(" vs ")}`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="rgb(255 255 255 / 0.07)" />
            <text x={pad.l - 6} y={sy(t)} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#8f8e88">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {x.map((v, i) =>
          i % Math.ceil(x.length / 8) === 0 || i === x.length - 1 ? (
            <text key={v} x={sx(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#8f8e88">
              {xLabel(v)}
            </text>
          ) : null,
        )}
        {hover != null && <line x1={sx(hover)} x2={sx(hover)} y1={pad.t} y2={H - pad.b} stroke="rgb(255 255 255 / 0.25)" />}
        {series.map((s) => (
          <g key={s.label}>
            <polyline points={s.values.map((v, i) => `${sx(i)},${sy(v)}`).join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {hover != null && <circle cx={sx(hover)} cy={sy(s.values[hover])} r={4.5} fill={s.color} stroke="#17181c" strokeWidth={2} />}
          </g>
        ))}
        {x.map((v, i) => (
          <rect
            key={v}
            x={sx(i) - (W - pad.l - pad.r) / Math.max(1, x.length - 1) / 2}
            y={0}
            width={(W - pad.l - pad.r) / Math.max(1, x.length - 1)}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onTouchStart={() => setHover(i)}
          />
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--color-ink-2)]" aria-live="polite">
        {hover == null ? (
          series.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded" style={{ background: s.color }} aria-hidden /> {s.label}
            </span>
          ))
        ) : (
          <span>
            <b className="text-[var(--color-ink)]">{xLabel(x[hover])}</b>
            {series.map((s) => (
              <span key={s.label} className="ml-3">
                <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} aria-hidden />
                {s.label}: <b className="tabular text-[var(--color-ink)]">{format(s.values[hover])}</b>
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
