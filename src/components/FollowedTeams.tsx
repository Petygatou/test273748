import { useQueries, useQuery } from "@tanstack/react-query";
import { useDebounced } from "../lib/search";
import { Crown, Plus, Radio, Search, X } from "lucide-react";
import { useState } from "react";
import { CAPTAIN_MULTIPLIER } from "../engine/rules";
import { fmt1 } from "../lib/format";
import { KEYS, useLocal } from "../lib/storage";
import { fetchTeamLiveFn, searchTeamsFn } from "../server/fnsCartola";
import type { TeamSummary } from "../server/cartolaConta";
import { Alert, Card, PosBadge, SectionTitle } from "./ui";

/** Busca e acompanha times do Cartola (de amigos, rivais da liga, etc.) com parciais ao vivo. */
export function FollowedTeams() {
  const [followed, setFollowed] = useLocal<TeamSummary[]>(KEYS.followed, []);
  const [q, setQ] = useState("");
  const term = useDebounced(q.trim(), 350);
  const search = useQuery({ queryKey: ["times", term], queryFn: () => searchTeamsFn({ data: { q: term } }), enabled: term.length >= 2, retry: false });
  const lives = useQueries({
    queries: followed.map((t) => ({ queryKey: ["team-live", t.timeId], queryFn: () => fetchTeamLiveFn({ data: { id: t.timeId } }), refetchInterval: 60_000, retry: false })),
  });
  const [open, setOpen] = useState<number | null>(null);

  return (
    <Card className="p-4">
      <SectionTitle title="Times acompanhados" subtitle="Parciais ao vivo de qualquer time do Cartola (atualiza a cada minuto)" icon={<Radio size={18} className="text-[var(--color-critical-ink)]" />} />
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-ink-3)]" aria-hidden />
          <input className="input pl-9" placeholder="Digite o nome do time ou do cartoleiro" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar time" />
        </div>
        </div>
      {search.error && (
        <div className="mt-2">
          <Alert tone="warning">{search.error instanceof Error ? search.error.message : "Busca indisponível"}</Alert>
        </div>
      )}
      {search.data && search.data.length > 0 && (
        <ul className="mt-2 max-h-64 divide-y divide-[var(--color-line)] overflow-y-auto rounded-xl border border-[var(--color-line)]">
          {search.data.map((t) => (
            <li key={t.timeId} className="flex items-center gap-2 px-2 py-1.5">
              {t.escudo && <img src={t.escudo} alt="" width={24} height={24} className="rounded" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{t.nome}</div>
                <div className="truncate text-[11px] text-[var(--color-ink-3)]">{t.cartoleiro}</div>
              </div>
              <button
                className="btn btn-ghost px-2 py-1 text-[11px]"
                disabled={followed.some((f) => f.timeId === t.timeId)}
                onClick={() => setFollowed([...followed, t].slice(0, 30))}
              >
                <Plus size={13} /> Acompanhar
              </button>
            </li>
          ))}
        </ul>
      )}
      {search.data && search.data.length === 0 && <p className="mt-2 text-sm text-[var(--color-ink-3)]">Nenhum time encontrado.</p>}

      <ul className="mt-3 space-y-2">
        {followed.map((t, i) => {
          const live = lives[i]?.data;
          const err = lives[i]?.error;
          return (
            <li key={t.timeId} className="rounded-xl border border-[var(--color-line)]">
              <div className="flex items-center gap-2 p-2">
                <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen(open === t.timeId ? null : t.timeId)} aria-expanded={open === t.timeId}>
                  {t.escudo && <img src={t.escudo} alt="" width={28} height={28} className="rounded" />}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{t.nome}</div>
                    <div className="truncate text-[11px] text-[var(--color-ink-3)]">{err ? "parciais indisponíveis" : live ? `${live.atletas.length} atletas escalados` : "carregando…"}</div>
                  </div>
                </button>
                <div className="font-display tabular text-lg font-bold text-[var(--color-gold)]">{live ? fmt1(live.parcial) : "—"}</div>
                <button className="text-[var(--color-ink-3)]" onClick={() => setFollowed(followed.filter((f) => f.timeId !== t.timeId))} aria-label={`Parar de acompanhar ${t.nome}`}>
                  <X size={16} />
                </button>
              </div>
              {open === t.timeId && live && (
                <ul className="border-t border-[var(--color-line)] px-2 py-1">
                  {live.atletas.map((a) => (
                    <li key={a.atletaId} className="flex items-center gap-2 py-1 text-sm">
                      <PosBadge pos={a.posicaoId} />
                      <span className="flex-1 truncate">
                        {a.apelido} {a.atletaId === live.time.capitaoId && <Crown size={12} className="inline text-[var(--color-gold)]" aria-label="capitão" />}
                      </span>
                      <span className="tabular font-semibold">{a.parcial == null ? "—" : fmt1(a.parcial * (a.atletaId === live.time.capitaoId ? CAPTAIN_MULTIPLIER : 1))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
        {!followed.length && <li className="text-sm text-[var(--color-ink-3)]">Busque um time acima para acompanhar as parciais.</li>}
      </ul>
    </Card>
  );
}
