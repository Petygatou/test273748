import { Link } from "@tanstack/react-router";
import type { Club, PlayerProjection } from "../engine/types";
import { cs, fmt1, pct } from "../lib/format";
import { ClubBadge, PlayerPhoto, PosBadge } from "./ui";

/**
 * Cartão vertical de atleta: rosto grande, clube, adversário e o número que
 * importa (pontos previstos), com a chance de jogar numa barrinha.
 */
export function PlayerCard({ p, clubs, metric, metricLabel, delay = 0, className = "" }: { p: PlayerProjection; clubs: Record<number, Club>; metric?: string; metricLabel?: string; delay?: number; className?: string }) {
  const opp = p.adversarioId != null ? clubs[p.adversarioId] : undefined;
  const joga = Math.max(0, Math.min(1, p.pJogar));
  const cor = joga >= 0.7 ? "var(--color-good)" : joga >= 0.45 ? "var(--color-warning)" : "var(--color-critical)";
  return (
    <Link
      to="/jogador/$id"
      params={{ id: String(p.atletaId) }}
      className={`card lift animate-rise group relative flex w-[150px] flex-col items-center overflow-hidden p-3 text-center sm:w-auto ${className}`}
      style={{ ["--d" as string]: `${delay}ms` }}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[var(--color-brand)]/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
      <span className="relative">
        <PlayerPhoto p={p} size={72} />
        <span className="absolute -right-1 -bottom-1">
          <ClubBadge club={clubs[p.clubeId]} size={22} />
        </span>
      </span>
      <span className="mt-2 w-full truncate text-sm font-bold">{p.apelido}</span>
      <span className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--color-ink-3)]">
        <PosBadge pos={p.posicaoId} />
        {opp ? `${p.mando === "casa" ? "vs" : "@"} ${opp.abreviacao}` : "sem jogo"}
      </span>
      <span className="font-display tabular mt-2 text-2xl leading-none font-extrabold text-[var(--color-gold)]">{metric ?? fmt1(p.xP)}</span>
      <span className="mt-0.5 text-[10px] font-semibold tracking-wide text-[var(--color-ink-3)] uppercase">{metricLabel ?? "pts previstos"}</span>
      <span className="mt-2.5 w-full">
        <span className="flex justify-between text-[10px] text-[var(--color-ink-3)]">
          <span>joga</span>
          <span className="tabular font-semibold text-[var(--color-ink-2)]">{pct(joga)}</span>
        </span>
        <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-1)]">
          <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${joga * 100}%`, background: cor }} />
        </span>
      </span>
      <span className="tabular mt-2 text-[11px] text-[var(--color-ink-3)]">{cs(p.preco)}</span>
    </Link>
  );
}
