import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CornerDownLeft, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerProjection } from "../engine/types";
import { cs, fmt1 } from "../lib/format";
import { analysisQuery } from "../lib/queries";
import { matchScore, norm, searchPlayers } from "../lib/search";
import { Highlight } from "./PlayerSearch";
import { ClubBadge, PlayerPhoto, PosBadge } from "./ui";

export interface PageEntry {
  to: string;
  label: string;
  keywords: string;
  Icon: typeof Search;
  search?: Record<string, string>;
}

type Item = { kind: "page"; page: PageEntry } | { kind: "player"; p: PlayerProjection };

/**
 * Busca global (atalho "/" ou Ctrl+K): atletas, clubes e telas do site,
 * com resultados enquanto digita.
 */
export function GlobalSearch({ pages, open, onClose }: { pages: PageEntry[]; open: boolean; onClose: () => void }) {
  const { data } = useQuery(analysisQuery);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);
  useEffect(() => setActive(0), [q]);

  const items: Item[] = useMemo(() => {
    const a = data?.analysis;
    const nq = norm(q);
    if (!nq) {
      const top = a ? [...a.players].filter((p) => p.posicaoId !== 6 && p.matchId != null).sort((x, y) => y.xP - x.xP).slice(0, 5) : [];
      return [...pages.slice(0, 5).map((page) => ({ kind: "page" as const, page })), ...top.map((p) => ({ kind: "player" as const, p }))];
    }
    const pg = pages
      .map((page) => ({ page, s: Math.max(matchScore(page.label, nq), matchScore(page.keywords, nq)) }))
      .filter((x) => x.s > 0)
      .sort((x, y) => y.s - x.s)
      .slice(0, 3)
      .map(({ page }) => ({ kind: "page" as const, page }));
    const pl = a ? searchPlayers(a.players, a.clubs, q, { limit: 8 }).map((p) => ({ kind: "player" as const, p })) : [];
    return [...pl, ...pg];
  }, [data, q, pages]);

  if (!open) return null;
  const clubs = data?.analysis.clubs ?? {};

  const go = (it: Item) => {
    onClose();
    if (it.kind === "page") navigate({ to: it.page.to, search: it.page.search as never });
    else navigate({ to: "/jogador/$id", params: { id: String(it.p.atletaId) } });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-3 pt-[8vh]" role="dialog" aria-modal="true" aria-label="Buscar">
      <button className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-label="Fechar busca" onClick={onClose} />
      <div className="card relative w-full max-w-xl overflow-hidden p-0 shadow-2xl shadow-black/60">
        <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-3">
          <Search size={18} className="text-[var(--color-ink-3)]" aria-hidden />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Atleta, clube, posição ou página…"
            className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-[var(--color-ink-3)]"
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded="true"
            aria-controls="gs-list"
            aria-activedescendant={items[active] ? `gs-${active}` : undefined}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(items.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter" && items[active]) {
                e.preventDefault();
                go(items[active]);
              } else if (e.key === "Escape") onClose();
            }}
          />
          <button onClick={onClose} className="rounded p-1 text-[var(--color-ink-3)] hover:text-[var(--color-ink)]" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <ul id="gs-list" role="listbox" className="max-h-[60vh] overflow-y-auto p-1.5">
          {!q && <li className="px-2 pt-1 pb-1 text-[10px] font-bold tracking-wider text-[var(--color-ink-3)] uppercase">Atalhos e destaques da rodada</li>}
          {items.map((it, i) => (
            <li key={it.kind === "page" ? `pg-${it.page.to}` : `pl-${it.p.atletaId}`} id={`gs-${i}`} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)}>
              <button className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left ${i === active ? "bg-[var(--color-surface-3)]" : ""}`} onClick={() => go(it)}>
                {it.kind === "page" ? (
                  <>
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-surface-1)] text-[var(--color-brand)]">
                      <it.page.Icon size={17} />
                    </span>
                    <span className="flex-1 text-sm font-semibold">
                      <Highlight text={it.page.label} q={q} />
                    </span>
                    <span className="text-[11px] text-[var(--color-ink-3)]">página</span>
                  </>
                ) : (
                  <>
                    <PlayerPhoto p={it.p} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        <Highlight text={it.p.apelido} q={q} />
                      </span>
                      <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-ink-3)]">
                        <PosBadge pos={it.p.posicaoId} /> <ClubBadge club={clubs[it.p.clubeId]} size={14} /> {clubs[it.p.clubeId]?.nome} · {cs(it.p.preco)}
                      </span>
                    </span>
                    <span className="font-display tabular text-sm font-bold text-[var(--color-gold)]">{fmt1(it.p.xP)}</span>
                  </>
                )}
                {i === active && <CornerDownLeft size={14} className="text-[var(--color-ink-3)]" aria-hidden />}
              </button>
            </li>
          ))}
          {q && !items.length && <li className="px-3 py-6 text-center text-sm text-[var(--color-ink-3)]">Nada encontrado para “{q}”.</li>}
        </ul>
        <div className="hidden items-center gap-3 border-t border-[var(--color-line)] px-3 py-2 text-[11px] text-[var(--color-ink-3)] sm:flex">
          <span>↑↓ navegar</span>
          <span>Enter abrir</span>
          <span>Esc fechar</span>
          <span className="ml-auto">Dica: “ata fla”, “gol pal”, “escalar”</span>
        </div>
      </div>
    </div>
  );
}
