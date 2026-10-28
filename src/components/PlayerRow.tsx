import { Link } from "@tanstack/react-router";
import type { Club, PlayerProjection } from "../engine/types";
import { cs, fmt1, pct } from "../lib/format";
import { ClubBadge, PlayerPhoto, PosBadge, StatusPill } from "./ui";

/** Linha compacta de atleta: foto, nome, clube, adversário e a métrica em destaque. */
export function PlayerRow({
  p,
  clubs,
  metric,
  metricLabel,
  sub,
}: {
  p: PlayerProjection;
  clubs: Record<number, Club>;
  metric?: string;
  metricLabel?: string;
  sub?: string;
}) {
  const opp = p.adversarioId != null ? clubs[p.adversarioId] : undefined;
  return (
    <Link
      to="/jogador/$id"
      params={{ id: String(p.atletaId) }}
      className="group flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-[var(--color-surface-3)]"
    >
      <PlayerPhoto p={p} size={42} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{p.apelido}</span>
          {p.statusId !== 7 && <StatusPill status={p.statusId} compact />}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-ink-3)]">
          <PosBadge pos={p.posicaoId} lado={p.lado} />
          <ClubBadge club={clubs[p.clubeId]} size={14} />
          <span className="truncate">
            {opp ? `${p.mando === "casa" ? "vs" : "@"} ${opp.abreviacao}` : "sem jogo"} · {cs(p.preco)}
            {sub ? ` · ${sub}` : ""}
          </span>
        </div>
      </div>
      <div className="text-right">
        <div className="font-display tabular text-lg leading-tight font-bold text-[var(--color-gold)]">{metric ?? fmt1(p.xP)}</div>
        <div className="text-[10px] text-[var(--color-ink-3)]">{metricLabel ?? `pts · joga ${pct(p.pJogar)}`}</div>
      </div>
    </Link>
  );
}
