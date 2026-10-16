import type { Club, FixtureOdds } from "../engine/types";
import { confrontoFor, type Confronto } from "../lib/derive";
import { dateTime, fmt2, pct } from "../lib/format";
import { ClubBadge } from "./ui";

const CONF_CLS: Record<Confronto, string> = {
  Fácil: "text-[var(--color-good-ink)] border-[var(--color-good)]/40",
  Neutro: "text-[var(--color-ink-2)]",
  "Alto risco": "text-[var(--color-critical-ink)] border-[var(--color-critical)]/40",
};

/** Barra 1X2 empilhada (casa / empate / fora) com respiro de 2px entre segmentos. */
export function OutcomeBar({ f }: { f: FixtureOdds }) {
  const segs = [
    { v: f.pCasa, color: "var(--color-series-a)", label: "Casa" },
    { v: f.pEmpate, color: "#4a4a46", label: "Empate" },
    { v: f.pFora, color: "var(--color-series-b)", label: "Fora" },
  ];
  return (
    <div>
      <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={`Vitória mandante ${pct(f.pCasa)}, empate ${pct(f.pEmpate)}, vitória visitante ${pct(f.pFora)}`}>
        {segs.map((s) => (
          <div key={s.label} style={{ width: `${s.v * 100}%`, background: s.color }} title={`${s.label}: ${pct(s.v)}`} />
        ))}
      </div>
      <div className="tabular mt-1 flex justify-between text-[11px] text-[var(--color-ink-3)]">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[var(--color-series-a)]" aria-hidden />
          {pct(f.pCasa)}
        </span>
        <span>Empate {pct(f.pEmpate)}</span>
        <span>
          {pct(f.pFora)}
          <span className="ml-1 inline-block h-2 w-2 rounded-sm bg-[var(--color-series-b)]" aria-hidden />
        </span>
      </div>
    </div>
  );
}

export function FixtureCard({ f, clubs, compact = false }: { f: FixtureOdds; clubs: Record<number, Club>; compact?: boolean }) {
  const casa = clubs[f.casaId];
  const fora = clubs[f.foraId];
  const cc = confrontoFor(f, true);
  const cf = confrontoFor(f, false);
  return (
    <div className="card p-3">
      <div className="flex items-center justify-between text-[11px] text-[var(--color-ink-3)]">
        <span>{dateTime(f.data)}</span>
        <span className="tabular">
          Placar mais provável {f.placarProvavel[0]}–{f.placarProvavel[1]}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ClubBadge club={casa} size={28} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{casa?.nome}</div>
            <div className="tabular text-[11px] text-[var(--color-ink-3)]">xG {fmt2(f.lambdaCasa)}</div>
          </div>
        </div>
        <span className="font-display text-xs font-bold text-[var(--color-ink-3)]">VS</span>
        <div className="flex min-w-0 items-center justify-end gap-2 text-right">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{fora?.nome}</div>
            <div className="tabular text-[11px] text-[var(--color-ink-3)]">xG {fmt2(f.lambdaFora)}</div>
          </div>
          <ClubBadge club={fora} size={28} />
        </div>
      </div>
      <div className="mt-3">
        <OutcomeBar f={f} />
      </div>
      {!compact && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-1">
            <span className={`chip ${CONF_CLS[cc.label]}`}>{cc.label}</span>
            <span className="chip">SG {pct(f.sgCasa)}</span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1">
            <span className="chip">SG {pct(f.sgFora)}</span>
            <span className={`chip ${CONF_CLS[cf.label]}`}>{cf.label}</span>
          </div>
        </div>
      )}
    </div>
  );
}
