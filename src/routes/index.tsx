import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, ChevronRight, Coins, Crown, FlaskConical, Gem, Swords, Target } from "lucide-react";
import { AskButton } from "../components/AskButton";
import { FixtureCard } from "../components/FixtureCard";
import { PlayerRow } from "../components/PlayerRow";
import { Card, ErrorBox, PageSkeleton, PosBadge, SectionTitle, StatTile } from "../components/ui";
import { PLAYER_POSITIONS, POSITIONS } from "../engine/rules";
import { roundBrief, topBy } from "../lib/derive";
import { fmt1, fmt2, pct, signed } from "../lib/format";
import { analysisQuery, backtestQuery } from "../lib/queries";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const { data, isLoading, error, refetch } = useQuery(analysisQuery);
  const bt = useQuery({ ...backtestQuery, enabled: Boolean(data) });
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
  const sims = a.config.simulations;
  const r = bt.data?.resumo;

  return (
    <div className="space-y-6">
      {/* hero */}
      <section className="card relative overflow-hidden p-5 md:p-6">
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[var(--color-brand)]/15 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold tracking-widest text-[var(--color-brand)] uppercase">Rodada {a.rodada} · {a.temporada}</div>
            <h1 className="font-display mt-1 text-2xl font-extrabold md:text-3xl">A matemática já leu a rodada.</h1>
            <p className="mt-1 max-w-xl text-sm text-[var(--color-ink-2)]">
              {a.fixtures.length} jogos, {a.diagnostics.atletasModelados} atletas projetados scout a scout e {sims.toLocaleString("pt-BR")} simulações de Monte Carlo por atleta. A IA só interpreta — os números vêm do motor.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/escalacao" className="btn btn-primary">
              <Swords size={16} aria-hidden /> Montar tropa
            </Link>
            <AskButton
              label="Leitura da rodada com Comandante"
              payload={() => ({
                titulo: `Leitura da rodada ${a.rodada}`,
                pergunta: "Faça a leitura estratégica desta rodada: jogos que mais importam, onde buscar SG, ataques em alta, capitão seguro e capitão diferencial. Use só os números do motor.",
                contexto: roundBrief(a),
              })}
            />
          </div>
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

      {a.source === "demo" && (
        <p className="flex items-center gap-2 text-xs text-[var(--color-ink-3)]">
          <FlaskConical size={14} aria-hidden /> Modo Demonstração: temporada sintética com atletas fictícios. Em produção os dados vêm da API oficial do Cartola. PMV calibrado: R² {fmt2(a.pmvModel.r2)}.
        </p>
      )}
    </div>
  );
}
