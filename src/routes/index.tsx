import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Bell, ChevronRight, ClipboardList, Coins, Crown, FlaskConical, Gem, Radio, Scale, Swords, Target } from "lucide-react";
import { FixtureCard } from "../components/FixtureCard";
import { PlayerRow } from "../components/PlayerRow";
import { PlayerSearch } from "../components/PlayerSearch";
import { Card, ErrorBox, PageSkeleton, PosBadge, SectionTitle, StatTile } from "../components/ui";
import { PLAYER_POSITIONS, POSITIONS } from "../engine/rules";
import { topBy } from "../lib/derive";
import { fmt1, fmt2, pct, signed } from "../lib/format";
import { useAlerts } from "../lib/alerts";
import { analysisQuery, backtestQuery } from "../lib/queries";
import { posRodadaFn } from "../server/fnsCartola";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useQuery(analysisQuery);
  const bt = useQuery({ ...backtestQuery, enabled: Boolean(data) });
  const { alerts: oficiais } = useAlerts();
  const pos = useQuery({ queryKey: ["pos-rodada"], queryFn: () => posRodadaFn(), staleTime: 15 * 60_000, enabled: data?.analysis.source === "cartola" });
  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <ErrorBox error={error} retry={() => refetch()} />;
  const a = data.analysis;
  const clubs = a.clubs;
  const field = (p: { posicaoId: number }) => p.posicaoId !== 6;
  const capitaes = topBy(a.players, (p) => p.xP, 5, field);
  const valoriza = topBy(a.players, (p) => p.valorizacaoEsperada, 5, (p) => p.pJogar > 0.6);
  const diferenciais = topBy(a.players, (p) => p.xP * (1 - (p.posse ?? 0) / 100), 5, (p) => field(p) && (p.posse ?? 0) < 12 && p.pJogar > 0.7);
  const alertas = topBy(a.players, (p) => p.xP, 60, (p) => p.alertas.length > 0 && p.pJogar > 0.3 && p.posicaoId !== 6)
    .filter((p) => p.alertas.some((x) => x.startsWith("Pendurado") || x.startsWith("Status")))
    .slice(0, 6);
  const r = bt.data?.resumo;

  return (
    <div className="space-y-6">
      {oficiais.length > 0 && (
        <div className="space-y-2" role="region" aria-label="Alertas oficiais">
          {oficiais.slice(0, 3).map((al) => (
            <div key={al.id} className="flex items-start gap-3 rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5 px-4 py-3">
              <Bell size={18} className="mt-0.5 shrink-0 text-[var(--color-warning)]" aria-hidden />
              <div className="min-w-0">
                <div className="text-sm font-semibold">{al.titulo}</div>
                <div className="text-sm text-[var(--color-ink-2)]">{al.mensagem}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* hero */}
      <section className="card relative overflow-hidden p-5 md:p-7">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[var(--color-brand)]/15 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-center">
          <img src="/logo.png" alt="" width={120} height={148} className="mx-auto hidden h-32 w-auto md:block" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold tracking-widest text-[var(--color-brand)] uppercase">Rodada {a.rodada} · {a.temporada}</div>
            <h1 className="font-display mt-1 text-2xl font-extrabold md:text-3xl">Bora mitar na rodada {a.rodada}?</h1>
            <p className="mt-1 max-w-xl text-sm text-[var(--color-ink-2)]">Projeções de cada atleta, prováveis escalações e a melhor tropa para o seu orçamento — tudo calculado pelo nosso modelo.</p>
            <PlayerSearch
              className="mt-4 max-w-xl"
              inputClassName="h-12 text-base"
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
        <div className="relative mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">
          {(
            [
              { to: "/escalacao", label: "Montar minha tropa", hint: "a melhor escalação no seu C$", Icon: Swords },
              { to: "/provaveis", label: "Ver prováveis", hint: "quem joga em cada time", Icon: ClipboardList },
              { to: "/estatisticas", search: { tab: "x1" }, label: "Comparar dois atletas", hint: "duelo X1 com veredito", Icon: Scale },
              { to: "/ao-vivo", label: "Acompanhar ao vivo", hint: "parciais da sua tropa", Icon: Radio },
            ] as const
          ).map((x) => (
            <Link
              key={x.label}
              to={x.to}
              search={"search" in x ? (x.search as never) : undefined}
              className="group flex items-center gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-1)] p-3 transition-colors hover:border-[var(--color-brand)]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-brand)]/15 text-[var(--color-brand)]">
                <x.Icon size={19} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm leading-tight font-bold">{x.label}</span>
                <span className="hidden truncate text-[11px] text-[var(--color-ink-3)] sm:block">{x.hint}</span>
              </span>
            </Link>
          ))}
        </div>
        <div className="relative mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Melhor capitão" value={capitaes[0]?.apelido ?? "—"} hint={capitaes[0] ? `xP ${fmt1(capitaes[0].xP)} · ${pct(capitaes[0].pAcima12)} de 12+` : undefined} accent="gold" />
          <StatTile
            label="Maior chance de SG"
            value={(() => {
              const best = [...a.fixtures].flatMap((f) => [{ c: f.casaId, p: f.sgCasa }, { c: f.foraId, p: f.sgFora }]).sort((x, y) => y.p - x.p)[0];
              return best ? clubs[best.c]?.abreviacao ?? "—" : "—";
            })()}
            hint={(() => {
              const best = [...a.fixtures].flatMap((f) => [f.sgCasa, f.sgFora]).sort((x, y) => y - x)[0];
              return best != null ? `${pct(best)} de não sofrer gol` : undefined;
            })()}
            accent="brand"
          />
          <StatTile label="Vantagem do mando" value={`+${((a.homeAdvantage - 1) * 100).toFixed(0)}%`} hint="gols a mais jogando em casa (estimado)" />
          <Link to="/modelo" className="block">
            <StatTile
              label="Precisão comprovada"
              value={r?.tropaModelo != null && r.tropaMedia ? `${signed(((r.tropaModelo - r.tropaMedia) / r.tropaMedia) * 100, 0)}%` : bt.isLoading ? "…" : "—"}
              hint={r ? `pontos reais da tropa vs. escalar pela média (${r.rodadas} rodadas)` : "backtest walk-forward"}
              accent="good"
            />
          </Link>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-1">
          <SectionTitle title="Capitães da rodada" subtitle="Maior pontuação esperada (bônus 1,5×)" icon={<Crown size={18} className="text-[var(--color-gold)]" />} />
          <div className="-mx-2">
            {capitaes.map((p) => (
              <PlayerRow key={p.atletaId} p={p} clubs={clubs} sub={`12+ ${pct(p.pAcima12)}`} />
            ))}
          </div>
        </Card>
        <Card className="p-4 lg:col-span-2">
          <SectionTitle
            title="Melhores por posição"
            subtitle="xP = probabilidade de jogar × pontos esperados jogando"
            icon={<Target size={18} className="text-[var(--color-brand)]" />}
            right={
              <Link to="/estatisticas" className="text-xs font-semibold text-[var(--color-brand)]">
                Ver mercado <ChevronRight size={12} className="inline" />
              </Link>
            }
          />
          <div className="grid gap-x-4 sm:grid-cols-2">
            {[...PLAYER_POSITIONS, 6 as const].map((pos) => (
              <div key={pos} className="py-1">
                <div className="flex items-center gap-2 px-2 pt-1 text-xs font-semibold text-[var(--color-ink-3)]">
                  <PosBadge pos={pos} /> {POSITIONS[pos].plural}
                </div>
                <div className="-mx-0">
                  {topBy(a.players, (p) => p.xP, 2, (p) => p.posicaoId === pos).map((p) => (
                    <PlayerRow key={p.atletaId} p={p} clubs={clubs} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <section>
        <SectionTitle
          title="Jogos da rodada"
          subtitle="Probabilidades do modelo de Poisson (Dixon-Coles) com xG por finalizações"
          right={
            <Link to="/estatisticas" search={{ tab: "confrontos" }} className="text-xs font-semibold text-[var(--color-brand)]">
              Matriz de confrontos <ChevronRight size={12} className="inline" />
            </Link>
          }
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {a.fixtures.map((f) => (
            <FixtureCard key={f.matchId} f={f} clubs={clubs} />
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-4">
          <SectionTitle title="Para valorizar" subtitle="Maior variação esperada de preço (C$)" icon={<Coins size={18} className="text-[var(--color-gold)]" />} />
          <div className="-mx-2">
            {valoriza.map((p) => (
              <PlayerRow key={p.atletaId} p={p} clubs={clubs} metric={signed(p.valorizacaoEsperada)} metricLabel={`MPV ${fmt1(p.mpv)}`} />
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <SectionTitle title="Diferenciais" subtitle="Alto xP e pouco escalados" icon={<Gem size={18} className="text-[var(--color-series-b)]" />} />
          <div className="-mx-2">
            {diferenciais.length ? (
              diferenciais.map((p) => <PlayerRow key={p.atletaId} p={p} clubs={clubs} sub={p.posse != null ? `${fmt1(p.posse)}% escalam` : "fora do top escalados"} />)
            ) : (
              <p className="px-2 text-sm text-[var(--color-ink-3)]">Dados de mais escalados indisponíveis.</p>
            )}
          </div>
        </Card>
        <Card className="p-4">
          <SectionTitle title="Atenção" subtitle="Pendurados e dúvidas entre os bem projetados" icon={<AlertTriangle size={18} className="text-[var(--color-warning)]" />} />
          <div className="-mx-2">
            {alertas.length ? (
              alertas.map((p) => <PlayerRow key={p.atletaId} p={p} clubs={clubs} sub={p.alertas[0].split(":")[0]} />)
            ) : (
              <p className="px-2 text-sm text-[var(--color-ink-3)]">Nenhum alerta relevante.</p>
            )}
          </div>
        </Card>
      </div>

      {pos.data?.mito && (
        <Card className="flex flex-wrap items-center gap-4 p-4">
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
          <FlaskConical size={14} aria-hidden /> Modo Demonstração: temporada sintética com atletas fictícios. Em produção os dados vêm da API oficial do Cartola. PMV calibrado: R² {fmt2(a.pmvModel.r2)}.
        </p>
      )}
    </div>
  );
}
