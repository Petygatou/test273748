import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, BarChart3, Bot, ClipboardList, FlaskConical, House, Newspaper, Radio, Search, Shield, Shirt, Swords, Trophy, Users } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../lib/auth";
import { AI_ENABLED } from "../lib/features";
import { countdown, timeAgo } from "../lib/format";
import { analysisQuery } from "../lib/queries";
import { Avatar } from "./avatars";
import { GlobalSearch, type PageEntry } from "./GlobalSearch";

/** Todas as seções ficam à vista: nada importante escondido em menus. */
const SECTIONS: PageEntry[] = [
  { to: "/", label: "Início", Icon: House, keywords: "home inicio resumo rodada capitaes" },
  { to: "/escalacao", label: "Escalar", Icon: Swords, keywords: "escalacao montar tropa time otimizador capitao" },
  { to: "/provaveis", label: "Prováveis", Icon: ClipboardList, keywords: "provaveis escalacoes titulares duvidas" },
  { to: "/estatisticas", label: "Estatísticas", Icon: BarChart3, keywords: "estatisticas mercado x1 duelo confrontos cedencia" },
  { to: "/ao-vivo", label: "Ao Vivo", Icon: Radio, keywords: "ao vivo parciais placar" },
  { to: "/meu-time", label: "Meu Time", Icon: Shirt, keywords: "meu time conta cartola patrimonio" },
  { to: "/ligas", label: "Ligas", Icon: Trophy, keywords: "ligas classificacao ranking" },
  { to: "/noticias", label: "Notícias", Icon: Newspaper, keywords: "noticias desfalques lesao" },
  { to: "/comunidade", label: "Comunidade", Icon: Users, keywords: "comunidade feed stories enquete" },
  ...(AI_ENABLED ? [{ to: "/assistente", label: "Comandante", Icon: Bot, keywords: "assistente ia comandante chat" }] : []),
];

/** Páginas extras que entram na busca e no rodapé. */
const EXTRA: PageEntry[] = [
  { to: "/estatisticas", label: "Duelo X1", Icon: BarChart3, keywords: "x1 comparar duelo versus", search: { tab: "x1" } },
  { to: "/modelo", label: "Precisão do modelo", Icon: FlaskConical, keywords: "modelo precisao backtest acerto" },
];

/** Atalhos da barra inferior no celular. */
const MOBILE = ["/", "/escalacao", "/provaveis", "/ao-vivo", "/estatisticas"];

function Logo() {
  return (
    <Link to="/" className="flex shrink-0 items-center" aria-label="Tropa — início">
      <img src="/logo-sm.png" alt="Tropa" width={46} height={56} className="h-[54px] w-auto drop-shadow-[0_2px_8px_rgba(255,107,26,0.35)] lg:h-[62px]" />
    </Link>
  );
}

export function SyncBar() {
  const { data, isLoading, isError } = useQuery(analysisQuery);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (isLoading) return <div className="h-6" />;
  if (isError || !data) return <div className="chip border-[var(--color-critical)]/40 text-[var(--color-critical-ink)]">Sem conexão com os dados</div>;
  const m = data.meta;
  const demo = m.source === "demo";
  const aberto = m.mercadoStatus === 1;
  const cd = countdown(m.fechamento, now);
  return (
    <div className="flex min-w-0 items-center gap-2 overflow-x-auto text-xs scrollbar-none" role="status">
      <span className={`chip ${aberto ? "border-[var(--color-good)]/40 text-[var(--color-good-ink)]" : "border-[var(--color-serious)]/40 text-[var(--color-serious)]"}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${aberto ? "bg-[var(--color-good)]" : "bg-[var(--color-serious)]"}`} aria-hidden />
        Mercado {aberto ? "aberto" : m.mercadoStatus === 2 ? "fechado" : "em manutenção"}
        {aberto && cd ? <span className="text-[var(--color-ink-2)]">· fecha em {cd}</span> : null}
      </span>
      <span className="chip">
        <Activity size={12} aria-hidden /> Rodada {m.rodada}
      </span>
      {!demo && (
        <span className="chip border-[var(--color-good)]/40 text-[var(--color-good-ink)]" title={m.importadoEm ? `Dados reais enviados ${timeAgo(m.importadoEm)}` : "Direto da API do Cartola"}>
          Dados reais
        </span>
      )}
      {demo ? (
        <span className="chip border-[var(--color-gold)]/40 text-[var(--color-gold)]" title={m.motivoDemo ? `Motivo: ${m.motivoDemo}` : undefined}>
          <FlaskConical size={12} aria-hidden /> Demonstração
        </span>
      ) : null}
      <span className="hidden text-[var(--color-ink-3)] sm:inline">atualizado {timeAgo(data.analysis.updatedAt)}</span>
    </div>
  );
}

/** Explica, em linguagem simples, por que o site está em demonstração. */
function DemoNotice() {
  const { data } = useQuery(analysisQuery);
  const [open, setOpen] = useState(false);
  if (data?.meta.source !== "demo") return null;
  const motivo = data.meta.motivoDemo;
  return (
    <div className="mt-2 rounded-xl border border-[var(--color-gold)]/40 bg-[var(--color-gold)]/5 px-3 py-2 text-xs text-[var(--color-ink-2)]">
      <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <FlaskConical size={14} className="shrink-0 text-[var(--color-gold)]" aria-hidden />
        <span className="flex-1">
          <b className="text-[var(--color-gold)]">Modo Demonstração:</b> atletas e números fictícios porque o servidor não conseguiu acessar a API do Cartola.
        </span>
        <span className="font-semibold text-[var(--color-gold)] underline">{open ? "fechar" : "por quê?"}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-1 border-t border-[var(--color-gold)]/20 pt-2">
          <p>
            Motivo informado pelo servidor: <code className="rounded bg-black/30 px-1 py-0.5 break-all">{motivo ?? "não informado"}</code>
          </p>
          <p>
            O site sai sozinho deste modo assim que o servidor conseguir falar com <b>api.cartolafc.globo.com</b>. Se aparecer <code>DATA_MODE=demo</code>, apague essa variável do servidor.
          </p>
        </div>
      )}
    </div>
  );
}

function isActive(path: string, to: string) {
  return to === "/" ? path === "/" : path.startsWith(to);
}

export function Layout({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [searchOpen, setSearchOpen] = useState(false);
  const strip = useRef<HTMLDivElement>(null);

  // atalhos de teclado: "/" ou Ctrl/Cmd+K abrem a busca
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.closest("input, textarea, select, [contenteditable=true]") != null);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => setSearchOpen(false), [path]);
  // mantém a seção atual visível na faixa de navegação do celular
  useEffect(() => {
    strip.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [path]);

  const pages = [...SECTIONS, ...EXTRA, ...(auth.isAdmin ? [{ to: "/admin", label: "Painel ADM", Icon: Shield, keywords: "admin painel" }] : [])];

  return (
    <div className="flex min-h-dvh flex-col pb-20 lg:pb-0">
      <header className="sticky top-0 z-30 border-b border-[var(--color-line)] bg-[var(--color-page)]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-1">
          <Logo />
          <nav className="hidden min-w-0 flex-1 items-center gap-0.5 lg:flex" aria-label="Principal">
            {SECTIONS.map(({ to, label, Icon }) => {
              const active = isActive(path, to);
              return (
                <Link
                  key={to}
                  to={to}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold whitespace-nowrap transition-colors ${
                    active ? "text-[var(--color-ink)]" : "text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
                  }`}
                >
                  <Icon size={15} aria-hidden className={`hidden xl:block ${active ? "text-[var(--color-brand)]" : ""}`} />
                  {label}
                  {active && <span className="absolute inset-x-2.5 -bottom-[11px] h-0.5 rounded-full bg-[var(--color-brand)]" aria-hidden />}
                </Link>
              );
            })}
          </nav>
          <div className="flex-1 lg:hidden" />
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-10 items-center gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-1)] px-3 text-sm text-[var(--color-ink-3)] hover:border-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
            aria-label="Buscar atleta, clube ou página"
          >
            <Search size={16} aria-hidden />
            <span className="hidden sm:inline lg:hidden 2xl:inline">Buscar</span>
            <kbd className="hidden rounded border border-[var(--color-line)] px-1.5 text-[10px] sm:inline">/</kbd>
          </button>
          {auth.isAdmin && (
            <Link
              to="/admin"
              className={`flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-line)] ${isActive(path, "/admin") ? "text-[var(--color-brand)]" : "text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"}`}
              aria-label="Painel ADM"
              title="Painel ADM"
            >
              <Shield size={17} />
            </Link>
          )}
          <Link to="/conta" aria-label="Minha conta" title={auth.user ? auth.user.nome : "Entrar"} className="flex shrink-0 items-center gap-2">
            <Avatar k={auth.profile.avatar} size={36} />
            {!auth.user && auth.ready && <span className="hidden text-sm font-semibold text-[var(--color-ink-2)] sm:inline">Entrar</span>}
          </Link>
        </div>
        {/* celular: todas as seções numa faixa deslizável, sempre visível */}
        <div ref={strip} className="flex gap-1 overflow-x-auto px-3 pb-2 scrollbar-none lg:hidden" role="navigation" aria-label="Seções">
          {SECTIONS.map(({ to, label, Icon }) => {
            const active = isActive(path, to);
            return (
              <Link
                key={to}
                to={to}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold ${
                  active ? "bg-[var(--color-brand)] text-[#1a0a00]" : "bg-[var(--color-surface-2)] text-[var(--color-ink-2)]"
                }`}
              >
                <Icon size={14} aria-hidden />
                {label}
              </Link>
            );
          })}
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-4 pt-3">
        <SyncBar />
        <DemoNotice />
      </div>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-3">{children}</main>

      <footer className="mt-10 border-t border-[var(--color-line)] bg-[var(--color-surface-1)]/40">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:grid-cols-[auto_1fr]">
          <img src="/logo-sm.png" alt="Tropa" width={70} height={86} className="h-20 w-auto" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            {[...SECTIONS, ...EXTRA, { to: "/conta", label: "Minha conta", Icon: Users, keywords: "" }].map((s) => (
              <Link key={s.label} to={s.to} search={s.search as never} className="text-[var(--color-ink-3)] hover:text-[var(--color-ink)]">
                {s.label}
              </Link>
            ))}
            <p className="col-span-full mt-3 text-xs text-[var(--color-ink-3)]">Tropa — o site da mitagem. Projeções do nosso modelo estatístico; não é afiliado à Globo nem ao Cartola FC.</p>
          </div>
        </div>
      </footer>

      {/* celular: atalhos fixos */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-line)] bg-[var(--color-surface-1)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden" aria-label="Atalhos">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {MOBILE.map((to) => {
            const s = SECTIONS.find((x) => x.to === to)!;
            const active = isActive(path, to);
            return (
              <Link key={to} to={to} aria-current={active ? "page" : undefined} className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold">
                <s.Icon size={21} aria-hidden className={active ? "text-[var(--color-brand)]" : "text-[var(--color-ink-3)]"} />
                <span className={active ? "text-[var(--color-ink)]" : "text-[var(--color-ink-3)]"}>{s.label === "Estatísticas" ? "Stats" : s.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <GlobalSearch pages={pages} open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
