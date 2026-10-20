import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, BookOpen, Hand, PlayCircle, Sparkles, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CAPITULOS, PASSOS, marcarTourVisto, tourVisto, type CapituloId, type TourStep } from "../lib/tour";

type TourApi = {
  /** começa o tour completo, ou só o capítulo de uma ferramenta */
  iniciar: (capitulo?: CapituloId) => void;
  /** abre o convite (boas-vindas) com as opções de tour e guia */
  abrirConvite: () => void;
};

const Ctx = createContext<TourApi>({ iniciar: () => {}, abrirConvite: () => {} });
export const useTour = () => useContext(Ctx);

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 8;

/** Primeiro elemento visível marcado com data-tour={alvo} (há versões de celular e de computador). */
function acharAlvo(alvo: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${alvo}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden") return el;
  }
  return null;
}

/** Centraliza o elemento; se for mais alto que a tela, alinha o topo logo abaixo do cabeçalho fixo. */
function rolarAte(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const topo = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
  const livre = window.innerHeight - topo;
  const y = r.height < livre * 0.6 ? r.top - topo - (livre - r.height) / 2 : r.top - topo - 16;
  window.scrollTo({ top: Math.max(0, window.scrollY + y), behavior: "smooth" });
}

function mesmoRect(a: Rect | null, b: Rect | null) {
  if (!a || !b) return a === b;
  return Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
}

export function TourProvider({ children }: { children: ReactNode }) {
  const [passos, setPassos] = useState<TourStep[] | null>(null);
  const [i, setI] = useState(0);
  const [convite, setConvite] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });

  // primeira visita: convida para o tour depois que a página assentar
  useEffect(() => {
    if (tourVisto() || path.startsWith("/admin")) return;
    const t = setTimeout(() => setConvite(true), 1200);
    return () => clearTimeout(t);
  }, []); // só na chegada ao site

  const iniciar = useCallback((capitulo?: CapituloId) => {
    setConvite(false);
    setPassos(capitulo ? PASSOS.filter((p) => p.capitulo === capitulo) : PASSOS);
    setI(0);
  }, []);
  const fechar = useCallback(() => {
    marcarTourVisto();
    setPassos(null);
  }, []);
  const api = useMemo<TourApi>(() => ({ iniciar, abrirConvite: () => setConvite(true) }), [iniciar]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {convite && (
        <Convite
          onTour={() => iniciar()}
          onFechar={() => {
            marcarTourVisto();
            setConvite(false);
          }}
        />
      )}
      {passos && passos[i] && <Spotlight passo={passos[i]} n={i} total={passos.length} parcial={passos.length < PASSOS.length} onIr={setI} onFechar={fechar} />}
    </Ctx.Provider>
  );
}

function Convite({ onTour, onFechar }: { onTour: () => void; onFechar: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFechar]);
  return createPortal(
    <div className="tour-fade fixed inset-0 z-[70] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="tour-convite-titulo" onClick={onFechar}>
      <div className="tour-pop card relative w-full max-w-md overflow-hidden rounded-b-none p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:rounded-b-[var(--radius-card,20px)] sm:pb-6" onClick={(e) => e.stopPropagation()}>
        <div className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-[var(--color-brand)]/20 blur-3xl" aria-hidden />
        <button type="button" onClick={onFechar} className="absolute top-3 right-3 rounded-lg p-1.5 text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]" aria-label="Fechar">
          <X size={18} />
        </button>
        <img src="/logo-sm.png" alt="" width={46} height={56} className="h-14 w-auto" />
        <h2 id="tour-convite-titulo" className="font-display mt-3 text-2xl font-extrabold">
          Bem-vindo à Tropa!
        </h2>
        <p className="mt-1.5 text-[15px] text-[var(--color-ink-2)]">Quer conhecer as ferramentas na prática? Em 1 minuto a gente mostra onde fica cada coisa, direto nas telas de verdade.</p>
        <ul className="mt-4 space-y-2 text-sm text-[var(--color-ink-2)]">
          {CAPITULOS.slice(1, 5).map((c) => (
            <li key={c.id} className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand)]/15 text-[var(--color-brand)]">
                <c.Icon size={15} aria-hidden />
              </span>
              <span>
                <b className="text-[var(--color-ink)]">{c.nome}:</b> {c.resumo}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button type="button" className="btn btn-primary flex-1 py-3 text-[15px]" onClick={onTour} autoFocus>
            <PlayCircle size={18} /> Fazer o tour
          </button>
          <Link to="/guia" className="btn btn-ghost flex-1 py-3" onClick={onFechar}>
            <BookOpen size={16} /> Ver o guia
          </Link>
        </div>
        <button type="button" className="mt-3 w-full text-center text-xs text-[var(--color-ink-3)] hover:text-[var(--color-ink)]" onClick={onFechar}>
          Agora não — dá para abrir depois no botão ?
        </button>
      </div>
    </div>,
    document.body,
  );
}

function Spotlight({ passo, n, total, parcial, onIr, onFechar }: { passo: TourStep; n: number; total: number; parcial: boolean; onIr: (i: number) => void; onFechar: () => void }) {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [rect, setRect] = useState<Rect | null>(null);
  const [procurando, setProcurando] = useState(true);
  const alvoRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(180);
  const ultimo = n === total - 1;

  // vai até a página do passo
  useEffect(() => {
    if (path !== passo.to) void navigate({ to: passo.to, search: passo.search as never });
  }, [passo, path, navigate]);

  // espera o elemento aparecer (a página pode estar carregando), rola até ele e acompanha a posição
  useEffect(() => {
    alvoRef.current = null;
    setRect(null);
    setProcurando(Boolean(passo.alvo));
    if (!passo.alvo) return;
    let raf = 0;
    const inicio = performance.now();
    let atual: Rect | null = null;
    const tick = () => {
      if (path === passo.to) {
        if (!alvoRef.current || !alvoRef.current.isConnected) {
          const el = acharAlvo(passo.alvo!);
          if (el) {
            alvoRef.current = el;
            rolarAte(el);
            setProcurando(false);
          } else if (performance.now() - inicio > 4000) {
            setProcurando(false); // não apareceu: mostra o cartão no centro mesmo
          }
        }
        const el = alvoRef.current;
        if (el) {
          const r = el.getBoundingClientRect();
          const novo = { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
          if (!mesmoRect(novo, atual)) {
            atual = novo;
            setRect(novo);
          }
        }
      }
      // segue acompanhando rolagem, animações e redimensionamento
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [passo, path]);

  useEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
      else if (e.key === "ArrowRight" || e.key === "Enter") ultimo ? onFechar() : onIr(n + 1);
      else if (e.key === "ArrowLeft" && n > 0) onIr(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n, ultimo, onIr, onFechar]);

  const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
  const vh = typeof window === "undefined" ? 768 : window.innerHeight;
  const celular = vw < 640;
  const visivel = rect && rect.top < vh && rect.top + rect.height > 0;

  // posição do cartão: abaixo do destaque se couber, senão acima; no celular vira painel embaixo
  let cardStyle: CSSProperties = {};
  if (celular) {
    cardStyle = { left: 12, right: 12, bottom: `calc(12px + env(safe-area-inset-bottom))` };
    // destaque escondido atrás do painel: o painel sobe para o topo
    if (visivel && rect.top + rect.height > vh - cardH - 24 && rect.top > cardH + 24) cardStyle = { left: 12, right: 12, top: 12 };
  } else if (visivel) {
    const w = 360;
    const left = Math.max(16, Math.min(vw - w - 16, rect.left + rect.width / 2 - w / 2));
    const abaixo = rect.top + rect.height + 14;
    const acima = rect.top - cardH - 14;
    // destaque grande demais para ter espaço em volta: o cartão fica no canto de baixo, por cima
    cardStyle = abaixo + cardH < vh - 16 ? { width: w, left, top: abaixo } : acima >= 16 ? { width: w, left, top: acima } : { width: w, right: 24, bottom: 24 };
  } else {
    cardStyle = { width: 380, left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  }

  const capitulo = CAPITULOS.find((c) => c.id === passo.capitulo);
  const proximo = () => (ultimo ? onFechar() : onIr(n + 1));

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="tour-titulo">
      {/* escurece tudo menos o destaque; o destaque continua clicável para experimentar */}
      {visivel ? (
        <>
          <div className="absolute inset-x-0 top-0" style={{ height: Math.max(0, rect.top) }} onClick={proximo} />
          <div className="absolute inset-x-0 bottom-0" style={{ top: rect.top + rect.height }} onClick={proximo} />
          <div className="absolute left-0" style={{ top: rect.top, height: rect.height, width: Math.max(0, rect.left) }} onClick={proximo} />
          <div className="absolute right-0" style={{ top: rect.top, height: rect.height, left: rect.left + rect.width }} onClick={proximo} />
          <div
            className="tour-hole pointer-events-none absolute rounded-2xl"
            style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
            aria-hidden
          />
        </>
      ) : (
        <div className="tour-fade absolute inset-0 bg-black/65" />
      )}

      <div ref={cardRef} key={passo.id} className="tour-pop card absolute max-w-[calc(100vw-24px)] p-4 shadow-2xl shadow-black/60" style={cardStyle}>
        <div className="flex items-center gap-2">
          {capitulo && (
            <span className="chip border-[var(--color-brand)]/40 py-0.5 text-[11px] text-[var(--color-brand)]">
              <capitulo.Icon size={12} aria-hidden /> {capitulo.nome}
            </span>
          )}
          <span className="tabular ml-auto text-[11px] font-semibold text-[var(--color-ink-3)]">
            {n + 1} de {total}
          </span>
          <button type="button" onClick={onFechar} className="-mr-1 rounded-lg p-1 text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]" aria-label="Fechar tour">
            <X size={16} />
          </button>
        </div>
        <h2 id="tour-titulo" className="font-display mt-2 text-lg leading-tight font-extrabold">
          {passo.titulo}
        </h2>
        <p className="mt-1 text-sm text-[var(--color-ink-2)]">{procurando ? "Abrindo a página…" : passo.texto}</p>
        {passo.experimente && !procurando && visivel && (
          <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-[var(--color-brand)]/10 px-2.5 py-1.5 text-xs font-semibold text-[var(--color-brand)]">
            <Hand size={13} aria-hidden /> Experimente: {passo.experimente}
          </p>
        )}
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-[var(--color-surface-2)]" aria-hidden>
          <div className="h-full rounded-full bg-[var(--color-brand)] transition-[width] duration-500" style={{ width: `${((n + 1) / total) * 100}%` }} />
        </div>
        <div className="mt-3 flex items-center gap-2">
          {n > 0 ? (
            <button type="button" className="btn btn-ghost px-3 py-2" onClick={() => onIr(n - 1)} aria-label="Voltar">
              <ArrowLeft size={16} />
            </button>
          ) : (
            <button type="button" className="text-xs text-[var(--color-ink-3)] hover:text-[var(--color-ink)]" onClick={onFechar}>
              Pular tour
            </button>
          )}
          <button type="button" className="btn btn-primary ml-auto px-4 py-2" onClick={proximo} autoFocus>
            {ultimo ? (
              <>
                <Sparkles size={15} /> {parcial ? "Entendi" : "Começar"}
              </>
            ) : (
              <>
                Próximo <ArrowRight size={15} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
