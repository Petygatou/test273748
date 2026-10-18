import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, BarChart3, Bot, Ellipsis, FlaskConical, House, Newspaper, Radio, Shield, Shirt, Swords, Trophy, User, Users, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { AI_ENABLED } from "../lib/features";
import { analysisQuery } from "../lib/queries";
import { countdown, timeAgo } from "../lib/format";
import { DEFAULT_PROFILE, KEYS, useLocal, type UserProfile } from "../lib/storage";
import { Avatar } from "./avatars";

const PRIMARY = ([
  { to: "/", label: "Início", Icon: House },
  { to: "/escalacao", label: "Escalar", Icon: Swords },
  { to: "/estatisticas", label: "Stats", Icon: BarChart3 },
  { to: "/ao-vivo", label: "Ao Vivo", Icon: Radio },
  { to: "/assistente", label: "Comandante", Icon: Bot },
] as const).filter((n) => AI_ENABLED || n.to !== "/assistente");

const SECONDARY = [
  { to: "/meu-time", label: "Meu Time", Icon: Shirt },
  { to: "/ligas", label: "Ligas", Icon: Trophy },
  { to: "/noticias", label: "Notícias", Icon: Newspaper },
  { to: "/comunidade", label: "Comunidade", Icon: Users },
  { to: "/modelo", label: "Precisão do modelo", Icon: FlaskConical },
  { to: "/admin", label: "Painel ADM", Icon: Shield },
  { to: "/conta", label: "Minha conta", Icon: User },
] as const;

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2" aria-label="Comandante FC — início">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffb21a" />
            <stop offset="1" stopColor="#ff6b1a" />
          </linearGradient>
        </defs>
        <path d="M16 2l12 5v8c0 8-5 13-12 15C9 28 4 23 4 15V7z" fill="url(#lg)" />
        <path d="M10 16l4 4 8-9" stroke="#140700" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-display text-[17px] leading-none font-extrabold tracking-wide">
        COMANDANTE<span className="text-[var(--color-brand)]"> FC</span>
      </span>
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
  if (isLoading) return <div className="h-7" />;
  if (isError || !data) return <div className="chip border-[var(--color-critical)]/40 text-[var(--color-critical-ink)]">Sem conexão com os dados</div>;
  const m = data.meta;
  const demo = m.source === "demo";
  const aberto = m.mercadoStatus === 1;
  const cd = countdown(m.fechamento, now);
  return (
    <div className="flex min-w-0 items-center gap-2 overflow-x-auto text-xs scrollbar-none" role="status">
      {demo ? (
        <span className="chip border-[var(--color-gold)]/40 text-[var(--color-gold)]" title={m.motivoDemo ? `Motivo: ${m.motivoDemo}` : undefined}>
          <FlaskConical size={12} aria-hidden /> Modo Demonstração
        </span>
      ) : null}
      <span className={`chip ${aberto ? "border-[var(--color-good)]/40 text-[var(--color-good-ink)]" : "border-[var(--color-serious)]/40 text-[var(--color-serious)]"}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${aberto ? "bg-[var(--color-good)]" : "bg-[var(--color-serious)]"}`} aria-hidden />
        Mercado {aberto ? "aberto" : m.mercadoStatus === 2 ? "fechado" : "em manutenção"}
        {aberto && cd ? <span className="text-[var(--color-ink-2)]">· fecha em {cd}</span> : null}
      </span>
      <span className="chip">
        <Activity size={12} aria-hidden /> Rodada {m.rodada}
      </span>
      <span className="hidden text-[var(--color-ink-3)] sm:inline">atualizado {timeAgo(data.analysis.updatedAt)}</span>
    </div>
  );
}

function NavLink({ to, label, Icon, onClick }: { to: string; label: string; Icon: typeof House; onClick?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const active = to === "/" ? path === "/" : path.startsWith(to);
  return (
    <Link
      to={to}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
        active ? "bg-[var(--color-surface-3)] text-[var(--color-ink)]" : "text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
      }`}
    >
      <Icon size={16} aria-hidden className={active ? "text-[var(--color-brand)]" : ""} />
      {label}
    </Link>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [profile] = useLocal<UserProfile>(KEYS.profile, DEFAULT_PROFILE);
  const [moreOpen, setMoreOpen] = useState(false);
  const [deskMore, setDeskMore] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    setMoreOpen(false);
    setDeskMore(false);
  }, [path]);

  return (
    <div className="min-h-dvh pb-24 lg:pb-8">
      <header className="sticky top-0 z-30 border-b border-[var(--color-line)] bg-[var(--color-page)]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5">
          <Logo />
          <nav className="hidden flex-1 items-center gap-1 lg:flex" aria-label="Principal">
            {PRIMARY.map((n) => (
              <NavLink key={n.to} {...n} />
            ))}
            {SECONDARY.slice(0, 1).map((n) => (
              <NavLink key={n.to} {...n} />
            ))}
            <div className="relative">
              <button
                type="button"
                onClick={() => setDeskMore((v) => !v)}
                aria-expanded={deskMore}
                aria-haspopup="menu"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
              >
                <Ellipsis size={16} aria-hidden /> Mais
              </button>
              {deskMore && (
                <div className="card absolute top-full left-0 z-50 mt-1 grid w-60 gap-1 p-2" role="menu">
                  {SECONDARY.slice(1).map((n) => (
                    <NavLink key={n.to} {...n} onClick={() => setDeskMore(false)} />
                  ))}
                </div>
              )}
            </div>
          </nav>
          <div className="flex-1 lg:hidden" />
          <Link to="/admin" className="hidden text-[var(--color-ink-3)] hover:text-[var(--color-ink)] lg:block" aria-label="Painel ADM">
            <Shield size={18} />
          </Link>
          <Link to="/conta" aria-label="Minha conta" className="shrink-0">
            <Avatar k={profile.avatar} size={34} />
          </Link>
        </div>
        <div className="mx-auto max-w-7xl px-4 pb-2">
          <SyncBar />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pt-4">{children}</main>

      {/* navegação inferior (mobile) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-line)] bg-[var(--color-surface-1)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
        aria-label="Navegação inferior"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {PRIMARY.map(({ to, label, Icon }) => {
            const active = to === "/" ? path === "/" : path.startsWith(to);
            return (
              <Link key={to} to={to} aria-current={active ? "page" : undefined} className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold">
                <Icon size={20} aria-hidden className={active ? "text-[var(--color-brand)]" : "text-[var(--color-ink-3)]"} />
                <span className={active ? "text-[var(--color-ink)]" : "text-[var(--color-ink-3)]"}>{label}</span>
              </Link>
            );
          })}
          <button type="button" onClick={() => setMoreOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold text-[var(--color-ink-3)]" aria-haspopup="dialog">
            <Ellipsis size={20} aria-hidden />
            Mais
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Mais opções">
          <button className="absolute inset-0 bg-black/60" aria-label="Fechar" onClick={() => setMoreOpen(false)} />
          <div className="card absolute inset-x-3 bottom-3 p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="font-display font-bold">Mais</span>
              <button onClick={() => setMoreOpen(false)} aria-label="Fechar" className="text-[var(--color-ink-3)]">
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-1">
              {SECONDARY.map((n) => (
                <NavLink key={n.to} {...n} onClick={() => setMoreOpen(false)} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
