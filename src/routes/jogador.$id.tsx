import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Ban, Lock, Scale, Unlock } from "lucide-react";
import { AskButton } from "../components/AskButton";
import { RoundBars, SERIES_A, divergingColor } from "../components/charts";
import { FixtureCard } from "../components/FixtureCard";
import { Alert, Card, ClubBadge, ErrorBox, FactorChip, PageSkeleton, PlayerPhoto, PosBadge, ProbBar, RangeBar, SectionTitle, StatTile, StatusPill } from "../components/ui";
import { SCOUT_LABELS } from "../engine/rules";
import { compactPlayer } from "../lib/derive";
import { cs, fmt1, fmt2, pct, posName, signed } from "../lib/format";
import { analysisQuery } from "../lib/queries";
import { KEYS, useLocal } from "../lib/storage";

export const Route = createFileRoute("/jogador/$id")({
  component: PlayerPage,
});

function PlayerPage() {
  const { id } = Route.useParams();
  const { data, isLoading, error, refetch } = useQuery(analysisQuery);
  const [fixed, setFixed] = useLocal<number[]>(KEYS.fixed, []);
  const [banned, setBanned] = useLocal<number[]>(KEYS.banned, []);
  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <ErrorBox error={error} retry={() => refetch()} />;
  const a = data.analysis;
  const p = a.players.find((x) => x.atletaId === Number(id));
  if (!p) return <Alert tone="critical">Atleta não encontrado no mercado desta rodada.</Alert>;
  const club = a.clubs[p.clubeId];
  const opp = p.adversarioId != null ? a.clubs[p.adversarioId] : undefined;
  const fixture = a.fixtures.find((f) => f.matchId === p.matchId);
  const ced = a.cedencia.find((c) => c.clubeId === p.adversarioId);
  const maxPts = Math.max(0.5, ...p.scouts.map((s) => Math.abs(s.pontos)));
  const isFixed = fixed.includes(p.atletaId);
  const isBanned = banned.includes(p.atletaId);
  const proximos = a.proximos[p.clubeId] ?? [];

  return (
    <div className="space-y-5">
      <Card className="p-4 md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-4">
            <PlayerPhoto p={p} size={72} />
            <div className="min-w-0">
              <h1 className="font-display truncate text-2xl font-extrabold">{p.apelido}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--color-ink-2)]">
                <PosBadge pos={p.posicaoId} /> {posName(p.posicaoId)}
                <ClubBadge club={club} size={18} /> {club?.nome}
                <StatusPill status={p.statusId} />
              </div>
              <div className="mt-1 text-xs text-[var(--color-ink-3)]">
                {opp ? `${p.mando === "casa" ? "Em casa contra" : "Fora contra"} ${opp.nome}` : "Sem jogo válido nesta rodada"} · {cs(p.preco)} · média {fmt2(p.media)} em {p.jogos} jogos
                {p.posse != null && ` · ${fmt1(p.posse)}% escalam`}
              </div>
            </div>
          </div>
          <div className="flex flex-1 flex-wrap gap-2 md:justify-end">
            <button className="btn btn-ghost" onClick={() => setFixed(isFixed ? fixed.filter((x) => x !== p.atletaId) : [...fixed, p.atletaId])}>
              {isFixed ? <Unlock size={15} /> : <Lock size={15} />} {isFixed ? "Desafixar" : "Fixar na escalação"}
            </button>
            <button className="btn btn-ghost" onClick={() => setBanned(isBanned ? banned.filter((x) => x !== p.atletaId) : [...banned, p.atletaId])}>
              <Ban size={15} /> {isBanned ? "Desbanir" : "Banir"}
            </button>
            <Link to="/estatisticas" search={{ tab: "x1", a: p.atletaId }} className="btn btn-ghost">
              <Scale size={15} /> Comparar no X1
            </Link>
            <AskButton
              label="Interpretar esta análise"
              payload={() => ({
                titulo: `Análise: ${p.apelido}`,
                pergunta: `Interprete a projeção de ${p.apelido}: de onde vêm os pontos, riscos, se vale como capitão ou aposta de valorização.`,
                contexto: { ...compactPlayer(a)(p), scouts: p.scouts, ultimas: p.ultimas, proximos },
              })}
            />
          </div>
        </div>
      </Card>

      {p.alertas.length > 0 && (
        <div className="space-y-2">
          {p.alertas.map((al) => (
            <Alert key={al} tone={al.startsWith("Boa chance") ? "info" : "warning"}>
              {al}
            </Alert>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="xP (pontos esperados)" value={fmt1(p.xP)} hint="já descontada a chance de não jogar" accent="gold" />
        <StatTile label="Chance de jogar" value={pct(p.pJogar)} hint={p.override ? `prováveis: ${p.override}` : "status + participação recente"} />
        <StatTile label="xP se jogar" value={fmt1(p.xPJogando)} hint={`base ${fmt1(p.base)} · explosão ${fmt1(p.explosao)}`} accent="brand" />
        <StatTile
          label="Mínimo p/ valorizar"
          value={fmt1(p.mpv)}
          hint={`${p.mpvFonte === "oficial" ? "oficial" : "calibrado"} · esperado ${signed(p.valorizacaoEsperada)} C$`}
          accent={p.valorizacaoEsperada >= 0 ? "good" : undefined}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-4">
          <SectionTitle title="Distribuição de pontos" subtitle={`Monte Carlo com ${a.config.simulations.toLocaleString("pt-BR")} simulações (dado que joga)`} />
          <RangeBar p={p} />
          <div className="mt-4 space-y-2">
            <ProbBar label="Negativar" value={p.pNegativo} tone="blue" />
            <ProbBar label="5+ pontos" value={p.pAcima5} />
            <ProbBar label="8+ pontos" value={p.pAcima8} />
            <ProbBar label="12+ pontos" value={p.pAcima12} tone="gold" />
            <ProbBar label="Valorizar" value={p.pValorizar} tone="good" />
          </div>
          <p className="mt-3 text-xs text-[var(--color-ink-3)]">
            Faixa laranja: entre o piso (P15) e o teto (P85) — 70% dos cenários. Traço branco: mediana. Traço dourado: média. P95 = {fmt1(p.p95)}.
          </p>
        </Card>

        <Card className="p-4">
          <SectionTitle title="De onde vêm os pontos" subtitle="Projeção scout a scout, dado que entra em campo" />
          <ul className="space-y-1.5">
            {p.scouts.map((s) => (
              <li key={s.key} className="grid grid-cols-[110px_1fr_70px] items-center gap-2 text-sm">
                <span className="truncate text-[var(--color-ink-2)]" title={SCOUT_LABELS[s.key]}>
                  <b className="text-[var(--color-ink)]">{s.key}</b> {SCOUT_LABELS[s.key]}
                </span>
                <div className="relative h-3 rounded-full bg-[var(--color-surface-1)]">
                  <div
                    className="absolute top-0 h-3 rounded-full"
                    style={{
                      width: `${(Math.abs(s.pontos) / maxPts) * 100}%`,
                      background: s.pontos >= 0 ? SERIES_A : "#d03b3b",
                    }}
                  />
                </div>
                <span className="tabular text-right text-xs">
                  <b className={s.pontos >= 0 ? "text-[var(--color-ink)]" : "text-[var(--color-critical-ink)]"}>{signed(s.pontos)}</b>
                  <span className="block text-[10px] text-[var(--color-ink-3)]">{fmt2(s.esperado)}×</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          <SectionTitle title="Fatores de contexto" subtitle="Como o confronto altera a projeção" />
          <div className="flex flex-wrap gap-2">
            <FactorChip label="Ataque do time" value={p.fatores.ataque} title="Gols esperados no confronto / gols esperados contra adversário médio" />
            <FactorChip label="Cedência do adversário" value={p.fatores.cedencia} title="Quanto o adversário cede do scout principal da posição" />
            <FactorChip label="Mando" value={p.fatores.mando} />
            <FactorChip label="Forma recente" value={p.fatores.forma} title="Pontos recentes (peso maior) vs. temporada" />
          </div>
          {ced && (
            <div className="mt-4">
              <div className="mb-1.5 text-xs font-semibold text-[var(--color-ink-3)] uppercase">
                {opp?.nome} cede a {posName(p.posicaoId).toLowerCase()}s
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                {(["geral", "casa", "fora", "ultimos5"] as const).map((k) => {
                  const cell = ced[k][p.posicaoId];
                  const col = divergingColor(cell.fator);
                  return (
                    <div key={k} className="rounded-lg p-2" style={{ background: col.bg, color: col.fg }}>
                      <div className="text-[10px] font-semibold uppercase opacity-80">{{ geral: "Geral", casa: "Em casa", fora: "Fora", ultimos5: "Últ. 5" }[k]}</div>
                      <div className="font-display tabular text-lg font-bold">{fmt1(cell.pontos)}</div>
                      <div className="tabular text-[10px] opacity-80">{signed((cell.fator - 1) * 100, 0)}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-[var(--color-surface-1)] p-2">
              <div className="text-[10px] text-[var(--color-ink-3)] uppercase">Média casa</div>
              <div className="font-display tabular text-lg font-bold">{fmt2(p.mediaCasa)}</div>
            </div>
            <div className="rounded-lg bg-[var(--color-surface-1)] p-2">
              <div className="text-[10px] text-[var(--color-ink-3)] uppercase">Média fora</div>
              <div className="font-display tabular text-lg font-bold">{fmt2(p.mediaFora)}</div>
            </div>
            <div className="rounded-lg bg-[var(--color-surface-1)] p-2">
              <div className="text-[10px] text-[var(--color-ink-3)] uppercase">Regularidade</div>
              <div className="font-display tabular text-lg font-bold">{p.regularidade}%</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle title="Últimos jogos do clube" subtitle="Pontos do atleta (— = não entrou)" />
          {p.ultimas.length ? <RoundBars data={p.ultimas} /> : <p className="text-sm text-[var(--color-ink-3)]">Sem histórico.</p>}
          {proximos.length > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 text-xs font-semibold text-[var(--color-ink-3)] uppercase">Próximos jogos do {club?.nome}</div>
              <div className="flex flex-wrap gap-1.5">
                {proximos.map((u) => {
                  const col = divergingColor(1 + (u.pVitoria - 0.38) * 1.1, 0.35);
                  return (
                    <span key={u.rodada} className="tabular rounded-lg px-2 py-1 text-[11px] font-semibold" style={{ background: col.bg, color: col.fg }} title={`SG ${pct(u.pSG)} · xG ${fmt2(u.xgPro)} x ${fmt2(u.xgContra)}`}>
                      R{u.rodada} {u.mando === "casa" ? "vs" : "@"} {a.clubs[u.adversarioId]?.abreviacao} · {pct(u.pVitoria)}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      </div>

      {fixture && (
        <div className="max-w-xl">
          <SectionTitle title="O jogo" />
          <FixtureCard f={fixture} clubs={a.clubs} />
        </div>
      )}
    </div>
  );
}
