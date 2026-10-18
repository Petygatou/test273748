import { AlertTriangle, Ban, CheckCircle2, CircleHelp, Cross, Info, ShieldOff } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { kitFor } from "../lib/kits";
import { Face } from "./Face";
import type { Club, PlayerProjection } from "../engine/types";
import { factorPct, fmt1, posAbbr, statusLabel } from "../lib/format";

export function Card({ children, className = "", as: As = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "article" }) {
  return <As className={`card ${className}`}>{children}</As>;
}

export function SectionTitle({ title, subtitle, right, icon }: { title: string; subtitle?: string; right?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display flex items-center gap-2 text-lg font-bold text-[var(--color-ink)]">
          {icon}
          {title}
        </h2>
        {subtitle && <p className="text-sm text-[var(--color-ink-3)]">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function StatTile({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: ReactNode; accent?: "brand" | "gold" | "good" }) {
  const color =
    accent === "brand" ? "text-[var(--color-brand)]" : accent === "gold" ? "text-[var(--color-gold)]" : accent === "good" ? "text-[var(--color-good-ink)]" : "text-[var(--color-ink)]";
  return (
    <div className="card p-3">
      <div className="text-[11px] font-semibold tracking-wide text-[var(--color-ink-3)] uppercase">{label}</div>
      <div className={`font-display mt-1 truncate text-xl font-bold md:text-2xl ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-[var(--color-ink-3)]">{hint}</div>}
    </div>
  );
}

const POS_COLORS: Record<number, string> = {
  1: "bg-[#3a2f0b] text-[#f5c518] ring-[#f5c518]/30",
  2: "bg-[#0e2a3a] text-[#6cc4ff] ring-[#6cc4ff]/30",
  3: "bg-[#102b1c] text-[#5fe39a] ring-[#5fe39a]/30",
  4: "bg-[#2a1a3a] text-[#c79bff] ring-[#c79bff]/30",
  5: "bg-[#3a1608] text-[#ff8f4d] ring-[#ff8f4d]/30",
  6: "bg-[#24252b] text-[#d8d6cf] ring-white/20",
};

export function PosBadge({ pos }: { pos: number }) {
  return <span className={`inline-flex w-9 justify-center rounded-md px-1 py-0.5 text-[10px] font-bold ring-1 ${POS_COLORS[pos]}`}>{posAbbr(pos)}</span>;
}

export function ClubBadge({ club, size = 20 }: { club?: Club; size?: number }) {
  if (!club) return <span className="inline-block rounded-full bg-[var(--color-surface-4)]" style={{ width: size, height: size }} />;
  if (club.escudo) return <img src={club.escudo} alt={club.nome} width={size} height={size} className="inline-block object-contain" loading="lazy" />;
  // escudo sintético: iniciais do clube nas cores do uniforme
  const kit = kitFor(club.id);
  return (
    <span
      title={club.nome}
      className="inline-flex shrink-0 items-center justify-center rounded-full text-[8px] font-extrabold text-white ring-1 ring-white/15"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${kit.primary} 0 55%, ${kit.secondary} 55% 100%)`, textShadow: "0 1px 2px rgba(0,0,0,.85)", fontSize: Math.max(7, size * 0.32) }}
    >
      {club.abreviacao.slice(0, 3)}
    </span>
  );
}

/**
 * Foto oficial do atleta: tenta o CDN da Globo direto, depois pelo nosso
 * servidor (/api/foto) e, só se as duas falharem, usa o rosto ilustrado.
 */
export function PlayerPhoto({ p, size = 40 }: { p: Pick<PlayerProjection, "foto" | "apelido" | "posicaoId"> & { atletaId?: number; clubeId?: number }; size?: number }) {
  const [attempt, setAttempt] = useState(0);
  useEffect(() => setAttempt(0), [p.foto]);
  const sources = p.foto ? [p.foto, `/api/foto?u=${encodeURIComponent(p.foto)}`] : [];
  const src = sources[attempt];
  if (src)
    return (
      <img
        key={src}
        src={src}
        alt={p.apelido}
        width={size}
        height={size}
        className="shrink-0 rounded-full bg-gradient-to-b from-[var(--color-surface-3)] to-[var(--color-surface-1)] object-cover object-top"
        style={{ width: size, height: size }}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setAttempt((n) => n + 1)}
      />
    );
  return <Face atletaId={p.atletaId} apelido={p.apelido} clubeId={p.clubeId} posicaoId={p.posicaoId} size={size} />;
}

const STATUS_STYLE: Record<number, { cls: string; Icon: typeof Info }> = {
  7: { cls: "text-[var(--color-good-ink)] border-[var(--color-good)]/40", Icon: CheckCircle2 },
  2: { cls: "text-[var(--color-warning)] border-[var(--color-warning)]/40", Icon: CircleHelp },
  3: { cls: "text-[var(--color-serious)] border-[var(--color-serious)]/40", Icon: Ban },
  5: { cls: "text-[var(--color-critical-ink)] border-[var(--color-critical)]/40", Icon: Cross },
  6: { cls: "text-[var(--color-ink-3)] border-[var(--color-line)]", Icon: ShieldOff },
};

export function StatusPill({ status, compact = false }: { status: number; compact?: boolean }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE[6];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border bg-[var(--color-surface-1)] px-1.5 py-0.5 text-[10px] font-semibold ${s.cls}`}>
      <s.Icon size={11} aria-hidden />
      {!compact && statusLabel(status)}
      {compact && <span className="sr-only">{statusLabel(status)}</span>}
    </span>
  );
}

/** Barra horizontal simples para probabilidades 0..1. */
export function ProbBar({ value, label, tone = "brand" }: { value: number; label?: string; tone?: "brand" | "gold" | "good" | "blue" }) {
  const color = tone === "gold" ? "var(--color-gold)" : tone === "good" ? "var(--color-good)" : tone === "blue" ? "var(--color-series-b)" : "var(--color-series-a)";
  return (
    <div className="flex items-center gap-2">
      {label && <span className="w-24 shrink-0 text-xs text-[var(--color-ink-3)]">{label}</span>}
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-1)]" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label={label}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} />
      </div>
      <span className="tabular w-10 text-right text-xs font-semibold text-[var(--color-ink-2)]">{Math.round(value * 100)}%</span>
    </div>
  );
}

/**
 * Faixa de resultados: piso (P15) — mediana — teto (P85), com P95 como traço.
 * Escala comum (min..max) para permitir comparação entre atletas numa lista.
 */
export function RangeBar({ p, min = -4, max = 24, showLabels = true }: { p: Pick<PlayerProjection, "piso" | "mediana" | "teto" | "p95" | "xPJogando">; min?: number; max?: number; showLabels?: boolean }) {
  const x = (v: number) => `${((Math.max(min, Math.min(max, v)) - min) / (max - min)) * 100}%`;
  return (
    <div className="w-full">
      <div className="relative h-3 rounded-full bg-[var(--color-surface-1)]" aria-label={`Piso ${fmt1(p.piso)}, mediana ${fmt1(p.mediana)}, teto ${fmt1(p.teto)}`}>
        <div className="absolute top-1/2 h-px -translate-y-1/2 bg-[var(--color-ink-3)]/50" style={{ left: x(p.teto), width: `calc(${x(p.p95)} - ${x(p.teto)})` }} />
        <div className="absolute top-0 h-3 rounded-full bg-[var(--color-series-a)]/35 ring-1 ring-[var(--color-series-a)]/60" style={{ left: x(p.piso), width: `calc(${x(p.teto)} - ${x(p.piso)})` }} />
        <div className="absolute top-[-2px] h-[16px] w-[2px] rounded bg-[var(--color-ink)]" style={{ left: x(p.mediana) }} />
        <div className="absolute top-[-3px] h-[18px] w-[2px] rounded bg-[var(--color-gold)]" style={{ left: x(p.xPJogando) }} title="Média esperada" />
      </div>
      {showLabels && (
        <div className="tabular mt-1 flex justify-between text-[10px] text-[var(--color-ink-3)]">
          <span>Piso {fmt1(p.piso)}</span>
          <span className="text-[var(--color-gold)]">Média {fmt1(p.xPJogando)}</span>
          <span>Teto {fmt1(p.teto)}</span>
        </div>
      )}
    </div>
  );
}

export function FactorChip({ label, value, invert = false, title }: { label: string; value: number; invert?: boolean; title?: string }) {
  const good = invert ? value < 0.97 : value > 1.03;
  const bad = invert ? value > 1.03 : value < 0.97;
  const cls = good ? "text-[var(--color-good-ink)] border-[var(--color-good)]/35" : bad ? "text-[var(--color-critical-ink)] border-[var(--color-critical)]/35" : "text-[var(--color-ink-2)]";
  return (
    <span className={`chip ${cls}`} title={title}>
      {label} <span className="tabular">{factorPct(value)}</span>
    </span>
  );
}

export function Alert({ children, tone = "warning" }: { children: ReactNode; tone?: "warning" | "info" | "critical" }) {
  const cls =
    tone === "critical"
      ? "border-[var(--color-critical)]/40 text-[var(--color-critical-ink)]"
      : tone === "info"
        ? "border-[var(--color-series-b)]/40 text-[#9cc6f5]"
        : "border-[var(--color-warning)]/40 text-[var(--color-warning)]";
  const Icon = tone === "info" ? Info : AlertTriangle;
  return (
    <div className={`flex items-start gap-2 rounded-xl border bg-[var(--color-surface-1)] px-3 py-2 text-sm ${cls}`} role={tone === "critical" ? "alert" : "status"}>
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 text-[var(--color-ink-2)]">{children}</div>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando análise…</span>
      <Skeleton className="h-24" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error);
  const semDados = /Dados reais do Cartola indisponíveis/i.test(msg);
  return (
    <Alert tone={semDados ? "warning" : "critical"}>
      <div className="font-semibold">{semDados ? "Os dados reais do Cartola ainda não chegaram." : "Não foi possível carregar os dados."}</div>
      <div className="text-xs">
        {semDados
          ? "O site só mostra dados verdadeiros e, por enquanto, o servidor não conseguiu falar com a API da Globo. A equipe já pode resolver pelo Painel ADM, em “Dados reais”."
          : msg}
      </div>
      {retry && (
        <button className="btn btn-ghost mt-2 px-3 py-1 text-xs" onClick={retry}>
          Tentar de novo
        </button>
      )}
    </Alert>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: ReactNode }>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg max-w-full overflow-x-auto scrollbar-none" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
