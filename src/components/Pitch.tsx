import type { Club, LineupSlot, PlayerProjection } from "../engine/types";
import { cs, fmt1 } from "../lib/format";
import { ClubBadge, PlayerPhoto } from "./ui";

function Token({
  p,
  clubs,
  captain,
  fixed,
  onClick,
  luxo,
}: {
  p: PlayerProjection;
  clubs: Record<number, Club>;
  captain?: boolean;
  fixed?: boolean;
  luxo?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-[76px] flex-col items-center gap-1 rounded-xl p-1 text-center transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-[var(--color-brand)] sm:w-[92px]"
      aria-label={`${p.apelido}, xP ${fmt1(p.xP)}${captain ? ", capitão" : ""}`}
    >
      <div className="relative">
        <div className={`rounded-full ${captain ? "ring-2 ring-[var(--color-gold)]" : "ring-1 ring-white/20"} ring-offset-2 ring-offset-[#0d1f13]`}>
          <PlayerPhoto p={p} size={44} />
        </div>
        {captain && (
          <span className="font-display absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-gold)] text-[11px] font-extrabold text-[#2d2306]" aria-hidden>
            C
          </span>
        )}
        {luxo && (
          <span className="absolute -top-1 -right-2 rounded-full bg-[var(--color-gold)] px-1 text-[8px] font-extrabold text-[#2d2306]" aria-hidden>
            LUXO
          </span>
        )}
        {fixed && <span className="absolute -bottom-1 -left-1 h-3 w-3 rounded-full bg-[var(--color-brand)] ring-2 ring-[#0d1f13]" title="Fixado" aria-hidden />}
        <span className="absolute -bottom-1 -right-1">
          <ClubBadge club={clubs[p.clubeId]} size={16} />
        </span>
      </div>
      <div className="w-full truncate rounded-md bg-black/55 px-1 py-0.5 text-[11px] leading-tight font-semibold text-white">{p.apelido}</div>
      <div className="tabular flex gap-1 text-[10px] leading-none">
        <span className="font-bold text-[var(--color-gold)]">{fmt1(p.xP)}</span>
        <span className="text-white/60">{cs(p.preco).replace("C$ ", "C$")}</span>
      </div>
    </button>
  );
}

export function Pitch({
  slots,
  byId,
  clubs,
  captainId,
  fixed,
  bench,
  onSelect,
}: {
  slots: LineupSlot[];
  byId: Map<number, PlayerProjection>;
  clubs: Record<number, Club>;
  captainId: number;
  fixed: Set<number>;
  bench: Array<{ atletaId: number; luxo?: boolean }>;
  onSelect: (id: number) => void;
}) {
  const of = (pos: number) => slots.filter((s) => s.posicaoId === pos).map((s) => byId.get(s.atletaId)!).filter(Boolean);
  const lats = of(2);
  const rows: PlayerProjection[][] = [of(5), of(4), [lats[0], ...of(3), lats[1]].filter(Boolean) as PlayerProjection[], of(1)];
  const tec = of(6)[0];
  return (
    <div>
      <div className="pitch relative overflow-hidden rounded-2xl px-1 py-4 sm:px-4">
        {/* marcações do campo */}
        <div className="pointer-events-none absolute inset-3 rounded-xl border border-white/10" aria-hidden />
        <div className="pointer-events-none absolute inset-x-3 top-1/2 border-t border-white/10" aria-hidden />
        <div className="pointer-events-none absolute top-1/2 left-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" aria-hidden />
        <div className="pointer-events-none absolute bottom-3 left-1/2 h-14 w-40 -translate-x-1/2 border border-b-0 border-white/10" aria-hidden />
        <div className="relative flex flex-col gap-3 sm:gap-5">
          {rows.map((row, i) => (
            <div key={i} className="flex justify-center gap-0.5 sm:gap-3">
              {row.map((p) => (
                <Token key={p.atletaId} p={p} clubs={clubs} captain={p.atletaId === captainId} fixed={fixed.has(p.atletaId)} onClick={() => onSelect(p.atletaId)} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-start gap-3 overflow-x-auto pb-1 scrollbar-none">
        {tec && (
          <div className="card shrink-0 p-1">
            <div className="px-1 text-[10px] font-semibold text-[var(--color-ink-3)] uppercase">Técnico</div>
            <Token p={tec} clubs={clubs} fixed={fixed.has(tec.atletaId)} onClick={() => onSelect(tec.atletaId)} />
          </div>
        )}
        {bench.length > 0 && (
          <div className="card shrink-0 p-1">
            <div className="px-1 text-[10px] font-semibold text-[var(--color-ink-3)] uppercase">Banco de reservas</div>
            <div className="flex">
              {bench.map((b) => {
                const p = byId.get(b.atletaId);
                return p ? <Token key={b.atletaId} p={p} clubs={clubs} luxo={b.luxo} onClick={() => onSelect(b.atletaId)} /> : null;
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
