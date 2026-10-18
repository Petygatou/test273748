import { Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { Club, PlayerProjection } from "../engine/types";
import { cs, fmt1 } from "../lib/format";
import { norm, searchPlayers } from "../lib/search";
import { ClubBadge, PlayerPhoto, PosBadge } from "./ui";

/** Destaca o trecho digitado dentro do nome. */
export function Highlight({ text, q }: { text: string; q: string }) {
  const nq = norm(q).split(/\s+/)[0];
  if (!nq) return <>{text}</>;
  const i = norm(text).indexOf(nq);
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-[var(--color-brand)]/25 text-inherit">{text.slice(i, i + nq.length)}</mark>
      {text.slice(i + nq.length)}
    </>
  );
}

export interface PlayerSearchProps {
  players: PlayerProjection[];
  clubs: Record<number, Club>;
  onSelect: (p: PlayerProjection) => void;
  placeholder?: string;
  label?: string;
  filter?: (p: PlayerProjection) => boolean;
  /** sugestões mostradas ao focar com o campo vazio */
  suggestions?: PlayerProjection[];
  suggestionsLabel?: string;
  /** ações extras por linha (ex.: fixar/banir); Enter usa onSelect */
  actions?: (p: PlayerProjection) => ReactNode;
  autoFocus?: boolean;
  /** mantém o texto após escolher (ex.: busca global fecha e limpa) */
  keepOpen?: boolean;
  className?: string;
  inputClassName?: string;
}

/**
 * Campo de busca com preenchimento automático: resultados a cada letra,
 * navegação por setas, Enter escolhe, Esc fecha. Aceita nome, clube e
 * posição ("ata fla").
 */
export function PlayerSearch({
  players,
  clubs,
  onSelect,
  placeholder = "Buscar atleta, clube ou posição",
  label = "Buscar atleta",
  filter,
  suggestions,
  suggestionsLabel = "Sugestões",
  actions,
  autoFocus,
  keepOpen,
  className = "",
  inputClassName = "",
}: PlayerSearchProps) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const results = useMemo(() => (q.trim() ? searchPlayers(players, clubs, q, { filter, limit: 8 }) : (suggestions ?? []).slice(0, 8)), [players, clubs, q, filter, suggestions]);
  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const choose = (p: PlayerProjection) => {
    onSelect(p);
    if (!keepOpen) {
      setQ("");
      setOpen(false);
      input.current?.blur();
    }
  };
  const show = open && (results.length > 0 || q.trim().length > 0);

  return (
    <div ref={box} className={`relative ${className}`}>
      <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-ink-3)]" aria-hidden />
      <input
        ref={input}
        className={`input pr-9 pl-9 ${inputClassName}`}
        placeholder={placeholder}
        value={q}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-label={label}
        aria-expanded={show}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={show && results[active] ? `${id}-${results[active].atletaId}` : undefined}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(results.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter" && show && results[active]) {
            e.preventDefault();
            choose(results[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {q && (
        <button type="button" className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-0.5 text-[var(--color-ink-3)] hover:text-[var(--color-ink)]" aria-label="Limpar busca" onClick={() => { setQ(""); input.current?.focus(); }}>
          <X size={15} />
        </button>
      )}
      {show && (
        <div className="card absolute inset-x-0 top-full z-50 mt-1.5 overflow-hidden p-1 shadow-2xl shadow-black/50">
          {!q.trim() && suggestions?.length ? <div className="px-2 pt-1 pb-1.5 text-[10px] font-bold tracking-wider text-[var(--color-ink-3)] uppercase">{suggestionsLabel}</div> : null}
          <ul id={`${id}-list`} role="listbox" className="max-h-[min(60vh,420px)] overflow-y-auto">
            {results.map((p, i) => (
              <li
                key={p.atletaId}
                id={`${id}-${p.atletaId}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 ${i === active ? "bg-[var(--color-surface-3)]" : ""}`}
              >
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(p)}>
                  <PlayerPhoto p={p} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      <Highlight text={p.apelido} q={q} />
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-ink-3)]">
                      <PosBadge pos={p.posicaoId} />
                      <ClubBadge club={clubs[p.clubeId]} size={14} />
                      <span className="truncate">{clubs[p.clubeId]?.nome}</span>
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="font-display tabular block text-sm font-bold text-[var(--color-gold)]">{fmt1(p.xP)}</span>
                    <span className="tabular block text-[10px] text-[var(--color-ink-3)]">{cs(p.preco)}</span>
                  </span>
                </button>
                {actions && <span className="flex shrink-0 gap-1">{actions(p)}</span>}
              </li>
            ))}
            {q.trim() && !results.length && <li className="px-3 py-3 text-sm text-[var(--color-ink-3)]">Nada encontrado para “{q}”. Tente o clube ou a posição (ex.: “ata fla”).</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
