import { Search, X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
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
  const lista = useRef<HTMLDivElement>(null);

  const results = useMemo(() => (q.trim() ? searchPlayers(players, clubs, q, { filter, limit: 8 }) : (suggestions ?? []).slice(0, 8)), [players, clubs, q, filter, suggestions]);
  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (box.current && !box.current.contains(t) && !lista.current?.contains(t)) setOpen(false);
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
  const pos = useDropdownPosition(box, show);

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
        onBlur={(e) => {
          // foco saiu do campo (Tab, outra janela abriu): fecha a lista
          const para = e.relatedTarget as Node | null;
          if (!para || (!lista.current?.contains(para) && !box.current?.contains(para))) setOpen(false);
        }}
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
      {show && pos && createPortal(
        <div ref={lista} className="card fixed z-[80] flex flex-col overflow-hidden p-1 shadow-2xl shadow-black/50" style={pos}>
          {!q.trim() && suggestions?.length ? <div className="px-2 pt-1 pb-1.5 text-[10px] font-bold tracking-wider text-[var(--color-ink-3)] uppercase">{suggestionsLabel}</div> : null}
          <ul id={`${id}-list`} role="listbox" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
                      <PosBadge pos={p.posicaoId} lado={p.lado} />
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
        </div>,
        document.body,
      )}
    </div>
  );
}

/**
 * A lista de resultados fica numa camada própria, presa ao campo: assim nenhum card com
 * overflow-hidden corta a lista. Abre para cima quando não há espaço embaixo (ex.: teclado do celular).
 */
function useDropdownPosition(anchor: RefObject<HTMLDivElement | null>, open: boolean) {
  const [pos, setPos] = useState<CSSProperties | null>(null);
  useLayoutEffect(() => {
    if (!open) return setPos(null);
    const update = () => {
      const el = anchor.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const gap = 6;
      // no celular a barra de atalhos fixa embaixo cobriria o fim da lista
      const barra = document.querySelector<HTMLElement>('nav[aria-label="Atalhos"]');
      const rodape = barra && barra.offsetParent ? barra.getBoundingClientRect().height : 0;
      const below = vh - rodape - r.bottom - gap - 8;
      const above = r.top - gap - 8;
      const up = below < 220 && above > below;
      const maxHeight = Math.min(440, Math.max(120, up ? above : below));
      setPos({ left: r.left, width: r.width, maxHeight, ...(up ? { bottom: window.innerHeight - r.top + gap } : { top: r.bottom + gap }) });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [open, anchor]);
  return pos;
}
