import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, Bell, ChevronRight, ClipboardList, Coins, Crown, FlaskConical, Gem, Radio, Scale, ShieldCheck, Swords, Target, TrendingUp } from "lucide-react";
import { useState } from "react";
import { OutcomeBar } from "../components/FixtureCard";
import { CountUp, Countdown } from "../components/motion";
import { PlayerCard } from "../components/PlayerCard";
import { PlayerRow } from "../components/PlayerRow";
import { PlayerSearch } from "../components/PlayerSearch";
import { Card, ClubBadge, ErrorBox, PageSkeleton, PlayerPhoto, Seg } from "../components/ui";
import { POSITIONS } from "../engine/rules";
import type { Club, FixtureOdds, PlayerProjection } from "../engine/types";
import { topBy } from "../lib/derive";
import { dateTime, fmt1, fmt2, pct, signed } from "../lib/format";
import { useAlerts } from "../lib/alerts";
import { analysisQuery, backtestQuery, mudancasQuery } from "../lib/queries";
import { posRodadaFn } from "../server/fnsCartola";

export const Route = createFileRoute("/")({
  component: Home,
});

type PosFiltro = "todos" | "1" | "2" | "3" | "4" | "5" | "6";
type Lista = "valorizar" | "diferenciais" | "atencao";

function SectionHead({ title, hint, to, toLabel, search }: { title: string; hint?: string; to?: string; toLabel?: string; search?: Record<string, string> }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-xl font-bold sm:text-2xl">{title}</h2>
        {hint && <p className="text-sm text-[var(--color-ink-3)]">{hint}</p>}
      </div>
      {to && (
        <Link to={to} search={search as never} className="flex shrink-0 items-center gap-1 text-sm font-semibold text-[var(--color-brand)] hover:underline">
          {toLabel} <ChevronRight size={15} />
        </Link>
      )}
    </div>
  );
}

/** O capitão da rodada em destaque, com o rosto grande e duas alternativas. */
function CaptainSpotlight({ p, alts, clubs }: { p?: PlayerProjection; alts: PlayerProjection[]; clubs: Record<number, Club> }) {
  if (!p) return null;
  const opp = p.adversarioId != null ? clubs[p.adversarioId] : undefined;
  return (
    <div data-tour="capitao" className="animate-rise relative overflow-hidden rounded-[22px] border border-[var(--color-gold)]/30 bg-gradient-to-b from-[var(--color-gold)]/10 to-black/20 p-4 sm:p-5" style={{ ["--d" as string]: "120ms" }}>
      <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-widest text-[var(--color-gold)] uppercase">
        <Crown size={14} /> Capitão da rodada
      </div>
      <Link to="/jogador/$id" params={{ id: String(p.atletaId) }} className="group mt-3 flex items-center gap-4">
        <span className="glow-pulse relative shrink-0 rounded-full ring-2 ring-[var(--color-gold)]/70">
          <PlayerPhoto p={p} size={96} />
          <span className="absolute -right-1 -bottom-1">
            <ClubBadge club={clubs[p.clubeId]} size={28} />
          </span>
        </span>
        <span className="min-w-0">
          <span className="font-display block truncate text-2xl font-extrabold group-hover:underline">{p.apelido}</span>
          <span className="block text-sm text-[var(--color-ink-3)]">
            {clubs[p.clubeId]?.nome} {opp ? `${p.mando === "casa" ? "recebe o" : "visita o"} ${opp.nome}` : ""}
          </span>
          <span className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-4xl leading-none font-extrabold text-[var(--color-gold)]">
              <CountUp value={p.xP} format={fmt1} />
            </span>
            <span className="text-xs text-[var(--color-ink-3)]">pts previstos</span>
          </span>
        </span>
      </Link>
      <div className="mt-4 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-black/25 px-2 py-2">
          <div className="font-display tabular text-lg font-bold">{pct(p.pAcima12)}</div>
          <div className="text-[10px] text-[var(--color-ink-3)]">chance de 12+ pontos</div>
        </div>
        <div className="rounded-xl bg-black/25 px-2 py-2">
          <div className="font-display tabular text-lg font-bold">{pct(p.pJogar)}</div>
          <div className="text-[10px] text-[var(--color-ink-3)]">chance de jogar</div>
        </div>
      </div>
      {alts.length > 0 && (
        <div className="mt-3 space-y-1">
          <div className="text-[10px] font-semibold tracking-wider text-[var(--color-ink-3)] uppercase">Outras boas opções</div>
          {alts.map((x) => (
            <Link key={x.atletaId} to="/jogador/$id" params={{ id: String(x.atletaId) }} className="flex items-center gap-2 rounded-xl px-1.5 py-1 hover:bg-white/5">
              <PlayerPhoto p={x} size={28} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{x.apelido}</span>
              <span className="font-display tabular text-sm font-bold text-[var(--color-gold)]">{fmt1(x.xP)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Jogo em formato compacto para a faixa deslizante. */
function MatchChip({ f, clubs, delay }: { f: FixtureOdds; clubs: Record<number, Club>; delay: number }) {
  const c = clubs[f.casaId];
  const v = clubs[f.foraId];
  const fav = f.pCasa >= f.pFora ? { club: c, p: f.pCasa } : { club: v, p: f.pFora };
  return (
    <Link to="/provaveis" hash={`jogo-${f.matchId}`} className="card lift animate-rise block w-[250px] p-3 lg:w-auto" style={{ ["--d" as string]: `${delay}ms` }}>
      <div className="text-[11px] text-[var(--color-ink-3)]">{dateTime(f.data) || `Rodada ${f.rodada}`}</div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <ClubBadge club={c} size={30} />
          <span className="font-display text-base font-bold">{c?.abreviacao}</span>
        </span>
        <span className="text-xs font-bold text-[var(--color-ink-3)]">x</span>
        <span className="flex min-w-0 items-center gap-2">
          <span className="font-display text-base font-bold">{v?.abreviacao}</span>
          <ClubBadge club={v} size={30} />
        </span>
      </div>
      <div className="mt-2.5">
        <OutcomeBar f={f} />
      </div>
      <div className="mt-2 text-[11px] text-[var(--color-ink-2)]">
        Favorito: <b>{fav.club?.nome}</b> ({pct(fav.p)})
      </div>
    </Link>
  );
}

function Home() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useQuery(analysisQuery);
  const bt = useQuery({ ...backtestQuery, enabled: Boolean(data) });
  const mud = useQuery({ ...mudancasQuery, enabled: Boolean(data) });
  const [posF, setPosF] = useState<PosFiltro>("todos");
  const [lista, setLista] = useState<Lista>("valorizar");
  const real = mud.data?.medicao;
  const { alerts: oficiais } = useAlerts();
  const pos = useQuery({ queryKey: ["pos-rodada"], queryFn: () => posRodadaFn(), staleTime: 15 * 60_000, enabled: data?.analysis.source === "cartola" });
  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <ErrorBox error={error} retry={() => refetch()} />;
  const a = data.analysis;
  const m = data.meta;
  const clubs = a.clubs;
  const field = (p: { posicaoId: number }) => p.posicaoId !== 6;
  const capitaes = topBy(a.players, (p) => p.xP, 5, field);
  const destaques = topBy(a.players, (p) => p.xP, 10, (p) => p.matchId != null && (posF === "todos" ? field(p) : p.posicaoId === Number(posF)));
  const valoriza = topBy(a.players, (p) => p.valorizacaoEsperada, 6, (p) => p.pJogar > 0.6);
  const diferenciais = topBy(a.players, (p) => p.xP * (1 - (p.posse ?? 0) / 100), 6, (p) => field(p) && (p.posse ?? 0) < 12 && p.pJogar > 0.7);
  const alertas = topBy(a.players, (p) => p.xP, 60, (p) => p.alertas.length > 0 && p.pJogar > 0.3 && p.posicaoId !== 6)
    .filter((p) => p.alertas.some((x) => x.startsWith("Pendurado") || x.startsWith("Status")))
    .slice(0, 6);
  const sg = [...a.fixtures].flatMap((f) => [{ c: f.casaId, p: f.sgCasa }, { c: f.foraId, p: f.sgFora }]).sort((x, y) => y.p - x.p)[0];
  const jogos = [...a.fixtures].sort((x, y) => String(x.data ?? "").localeCompare(String(y.data ?? "")));
  const acerto = real && real.acerto != null && real.times >= 2 ? { v: real.acerto, hint: `contra a súmula oficial (${real.times} times)` } : bt.data?.provaveis ? { v: bt.data.provaveis.acerto, hint: `últimas ${bt.data.provaveis.rodadas.length} rodadas, sem olhar o futuro` } : null;
  const aberto = m.mercadoStatus === 1;

  const actions = [
    { to: "/escalacao", label: "Montar minha tropa", hint: "a melhor escalação para o seu C$", Icon: Swords, tone: "from-[#ff6b1a] to-[#ff9a3d]" },
    { to: "/provaveis", label: "Ver prováveis", hint: "quem entra em campo", Icon: ClipboardList, tone: "from-[#2fd27a] to-[#1fa863]" },
    { to: "/estatisticas", search: { tab: "x1" }, label: "Comparar atletas", hint: "quem escalar no X1", Icon: Scale, tone: "from-[#3987e5] to-[#5aa6ff]" },
    { to: "/ao-vivo", label: "Acompanhar ao vivo", hint: "parciais da sua tropa", Icon: Radio, tone: "from-[#e23b2e] to-[#ff6b6b]" },
  ] as const;

  return (
    <div className="space-y-9 pb-4">
      {oficiais.length > 0 && (
        <div className="space-y-2" role="region" aria-label="Alertas oficiais">
          {oficiais.slice(0, 3).map((al) => (
            <div key={al.id} className="animate-rise flex items-start gap-3 rounded-2xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5 px-4 py-3">
              <Bell size={18} className="mt-0.5 shrink-0 text-[var(--color-warning)]" aria-hidden />
              <div className="min-w-0">
                <div className="text-sm font-semibold">{al.titulo}</div>
                <div className="text-sm text-[var(--color-ink-2)]">{al.mensagem}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* topo */}
      <section className="hero-surface relative overflow-hidden p-5 sm:p-7">
        <div className="grid gap-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-center">
          <div className="animate-rise min-w-0">
            <span className="chip border-[var(--color-brand)]/40 text-[var(--color-brand)]">
              <span className={`h-1.5 w-1.5 rounded-full ${aberto ? "bg-[var(--color-good)]" : "bg-[var(--color-critical)]"} animate-pulse`} aria-hidden />
              Rodada {a.rodada} · {aberto ? "mercado aberto" : "bola rolando"}
            </span>
            <h1 className="font-display mt-3 text-3xl leading-[1.05] font-extrabold sm:text-4xl lg:text-5xl">
              Bora mitar na
              <br />
              <span className="bg-gradient-to-r from-[var(--color-brand)] to-[var(--color-gold)] bg-clip-text text-transparent">rodada {a.rodada}</span>?
            </h1>
            <p className="mt-3 max-w-md text-[15px] text-[var(--color-ink-2)]">Quem joga, quanto deve pontuar e a melhor tropa para o seu orçamento. Simples assim.</p>
            {aberto && m.fechamento && (
              <div className="mt-4">
                <Countdown to={m.fechamento} />
              </div>
            )}
            <div data-tour="busca-home" className="mt-5 max-w-xl">
            <PlayerSearch
              inputClassName="h-12 rounded-2xl text-base"
              players={a.players}
              clubs={clubs}
              placeholder="Busque um atleta, clube ou posição"
              label="Buscar atleta"
              suggestions={capitaes}
              suggestionsLabel="Mais bem projetados da rodada"
              onSelect={(p) => navigate({ to: "/jogador/$id", params: { id: String(p.atletaId) } })}
            />
            </div>
          </div>
          <CaptainSpotlight p={capitaes[0]} alts={capitaes.slice(1, 3)} clubs={clubs} />
        </div>
      </section>

      {/* atalhos */}
      <section data-tour="atalhos" className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Atalhos">
        {actions.map((x, i) => (
          <Link
            key={x.label}
            to={x.to}
            search={"search" in x ? (x.search as never) : undefined}
            className="card lift animate-rise group flex flex-col gap-3 p-4"
            style={{ ["--d" as string]: `${80 + i * 60}ms` }}
          >
            <span className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${x.tone} text-white shadow-lg shadow-black/30`}>
              <x.Icon size={21} aria-hidden />
            </span>
            <span>
              <span className="flex items-center justify-between gap-2 text-[15px] leading-tight font-bold">
                {x.label} <ArrowRight size={16} className="shrink-0 text-[var(--color-ink-3)] transition-transform group-hover:translate-x-1 group-hover:text-[var(--color-ink)]" />
              </span>
              <span className="mt-0.5 block text-xs text-[var(--color-ink-3)]">{x.hint}</span>
            </span>
          </Link>
        ))}
      </section>

      {/* destaques */}
      <section data-tour="destaques">
        <SectionHead title="Destaques da rodada" hint="Quem deve pontuar mais. Toque para ver a ficha." to="/estatisticas" toLabel="Ver todos" />
        <div className="-mx-1 mb-3 overflow-x-auto px-1 scrollbar-none">
          <Seg
            label="Posição"
            value={posF}
            onChange={setPosF}
            options={[{ value: "todos", label: "Todos" }, ...([1, 2, 3, 4, 5, 6] as const).map((p) => ({ value: String(p) as PosFiltro, label: POSITIONS[p].plural }))]}
          />
        </div>
        <div key={posF} className="snap-row -mx-4 px-4 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0">
          {destaques.map((p, i) => (
            <PlayerCard key={p.atletaId} p={p} clubs={clubs} delay={i * 40} />
          ))}
        </div>
      </section>

      {/* jogos */}
      <section>
        <SectionHead title="Jogos da rodada" hint="Chance de vitória de cada lado. Toque para ver as prováveis." to="/provaveis" toLabel="Prováveis" />
        <div className="snap-row -mx-4 px-4 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0">
          {jogos.map((f, i) => (
            <MatchChip key={f.matchId} f={f} clubs={clubs} delay={i * 40} />
          ))}
        </div>
      </section>

      {/* listas */}
      <section className="grid gap-5 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className="animate-rise p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-xl font-bold">Para ficar de olho</h2>
            <Seg
              label="Lista"
              value={lista}
              onChange={setLista}
              options={[
                { value: "valorizar", label: "Valorizar" },
                { value: "diferenciais", label: "De olho neles" },
                { value: "atencao", label: "Atenção" },
              ]}
            />
          </div>
          <p className="mb-2 flex items-center gap-1.5 text-xs text-[var(--color-ink-3)]">
            {lista === "valorizar" ? (
              <>
                <Coins size={13} className="text-[var(--color-gold)]" /> Quem mais deve subir de preço (C$) na rodada.
              </>
            ) : lista === "diferenciais" ? (
              <>
                <Gem size={13} className="text-[var(--color-series-b)]" /> Bons pontos previstos.
              </>
            ) : (
              <>
                <AlertTriangle size={13} className="text-[var(--color-warning)]" /> Pendurados e dúvidas entre os bem cotados.
              </>
            )}
          </p>
          <div key={lista} className="animate-rise -mx-2">
            {lista === "valorizar" &&
              valoriza.map((p) => <PlayerRow key={p.atletaId} p={p} clubs={clubs} metric={signed(p.valorizacaoEsperada)} metricLabel="C$ previsto" />)}
            {lista === "diferenciais" &&
              (diferenciais.length ? (
                diferenciais.map((p) => <PlayerRow key={p.atletaId} p={p} clubs={clubs} sub={p.posse != null ? `${fmt1(p.posse)}% escalam` : undefined} />)
              ) : (
                <p className="px-2 py-4 text-sm text-[var(--color-ink-3)]">Ainda sem dados de mais escalados.</p>
              ))}
            {lista === "atencao" &&
              (alertas.length ? (
                alertas.map((p) => <PlayerRow key={p.atletaId} p={p} clubs={clubs} sub={p.alertas[0].split(":")[0]} />)
              ) : (
                <p className="px-2 py-4 text-sm text-[var(--color-ink-3)]">Nenhum alerta importante agora.</p>
              ))}
          </div>
        </Card>

        <div className="grid content-start gap-3">
          <Link to="/modelo" className="card lift animate-rise flex items-center gap-4 p-4" style={{ ["--d" as string]: "60ms" }}>
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-good)]/15 text-[var(--color-good-ink)]">
              <Target size={21} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-[var(--color-ink-3)]">Acerto das prováveis</span>
              <span className="font-display block text-3xl leading-tight font-extrabold text-[var(--color-good-ink)]">{acerto ? <CountUp value={acerto.v * 100} format={(x) => `${x.toFixed(1).replace(".", ",")}%`} /> : "…"}</span>
              {acerto && <span className="block truncate text-[11px] text-[var(--color-ink-3)]">{acerto.hint}</span>}
            </span>
            <ChevronRight size={18} className="text-[var(--color-ink-3)]" />
          </Link>
          {sg && (
            <div className="card animate-rise flex items-center gap-4 p-4" style={{ ["--d" as string]: "120ms" }}>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-series-b)]/15 text-[#7fb6f5]">
                <ShieldCheck size={21} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-[var(--color-ink-3)]">Defesa mais segura</span>
                <span className="flex items-center gap-2">
                  <ClubBadge club={clubs[sg.c]} size={24} />
                  <span className="font-display text-xl font-bold">{clubs[sg.c]?.nome}</span>
                </span>
                <span className="block text-[11px] text-[var(--color-ink-3)]">{pct(sg.p)} de chance de não sofrer gol</span>
              </span>
            </div>
          )}
          <div className="card animate-rise flex items-center gap-4 p-4" style={{ ["--d" as string]: "180ms" }}>
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-brand)]/15 text-[var(--color-brand)]">
              <TrendingUp size={21} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-[var(--color-ink-3)]">Jogar em casa ajuda</span>
              <span className="font-display block text-xl font-bold">+{((a.homeAdvantage - 1) * 100).toFixed(0)}% de gols</span>
              <span className="block text-[11px] text-[var(--color-ink-3)]">a mais para o mandante, em média</span>
            </span>
          </div>
        </div>
      </section>

      {pos.data?.mito && (
        <Card className="animate-rise flex flex-wrap items-center gap-4 p-4">
          {pos.data.mito.escudo && <img src={pos.data.mito.escudo} alt="" width={48} height={48} className="rounded-lg" />}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold tracking-widest text-[var(--color-gold)] uppercase">Mito da rodada passada</div>
            <div className="font-display truncate text-lg font-bold">{pos.data.mito.nome}</div>
            <div className="text-sm text-[var(--color-ink-3)]">{pos.data.mito.cartoleiro}</div>
          </div>
          <div className="text-right">
            <div className="font-display tabular text-2xl font-extrabold text-[var(--color-gold)]">{fmt2(pos.data.mito.pontos)}</div>
            {pos.data.mediaPontos != null && <div className="text-xs text-[var(--color-ink-3)]">média geral {fmt2(pos.data.mediaPontos)}</div>}
          </div>
        </Card>
      )}

      {a.source === "demo" && (
        <p className="flex items-center gap-2 text-xs text-[var(--color-ink-3)]">
          <FlaskConical size={14} aria-hidden /> Modo Demonstração: temporada simulada com atletas fictícios.
        </p>
      )}
    </div>
  );
}
