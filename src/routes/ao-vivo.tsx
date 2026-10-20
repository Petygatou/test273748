import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Crown, Radio, RefreshCw } from "lucide-react";
import { AskButton } from "../components/AskButton";
import { FollowedTeams } from "../components/FollowedTeams";
import { Alert, Card, ClubBadge, ErrorBox, PageSkeleton, PlayerPhoto, PosBadge, SectionTitle, StatTile } from "../components/ui";
import { CAPTAIN_MULTIPLIER } from "../engine/rules";
import type { PlayerProjection } from "../engine/types";
import type { LiveData, LiveMatch } from "../server/live";
import { fmt1, timeAgo } from "../lib/format";
import { analysisQuery, liveQuery } from "../lib/queries";
import { KEYS, useLocal } from "../lib/storage";

export const Route = createFileRoute("/ao-vivo")({
  component: LivePage,
});

interface LastLineup {
  rodada: number;
  titulares: number[];
  captainId: number;
  reservas: Array<{ atletaId: number; posicaoId: number; luxo?: boolean }>;
}

const REMAINING = 0.45; // fração média de jogo restante em partidas em andamento

function playerLive(p: PlayerProjection, live: LiveData, matches: Map<number, LiveMatch>) {
  const m = p.matchId != null ? matches.get(p.matchId) : undefined;
  const l = live.atletas[p.atletaId];
  const status = m?.status ?? "pre";
  const parcial = l?.entrou ? l.pontos : 0;
  const projetado = status === "encerrado" ? parcial : status === "andamento" ? parcial + (l?.entrou ? p.xPJogando * REMAINING : p.xP * REMAINING * 0.6) : p.xP;
  return { status, parcial, projetado, entrou: Boolean(l?.entrou) };
}

function LivePage() {
  const an = useQuery(analysisQuery);
  const lv = useQuery(liveQuery);
  const [last] = useLocal<LastLineup | null>(KEYS.lastLineup, null);
  if (an.isLoading || lv.isLoading) return <PageSkeleton />;
  if (an.error || !an.data) return <ErrorBox error={an.error} retry={() => an.refetch()} />;
  if (lv.error || !lv.data) return <ErrorBox error={lv.error} retry={() => lv.refetch()} />;
  const a = an.data.analysis;
  const live = lv.data;
  const byId = new Map(a.players.map((p) => [p.atletaId, p] as const));
  const matches = new Map(live.partidas.map((m) => [m.matchId, m] as const));

  const lineup = last && last.rodada === a.rodada ? last : null;
  let parcial = 0;
  let projetado = 0;
  const rows: Array<{ p: PlayerProjection; parcial: number; projetado: number; status: string; entrou: boolean; cap: boolean; sub?: PlayerProjection }> = [];
  if (lineup) {
    const usedReserves = new Set<number>();
    for (const id of lineup.titulares) {
      const p = byId.get(id);
      if (!p) continue;
      const st = playerLive(p, live, matches);
      const cap = id === lineup.captainId;
      let row = { p, ...st, cap, sub: undefined as PlayerProjection | undefined };
      // titular não entrou e o jogo acabou → reserva da posição entra
      if (st.status === "encerrado" && !st.entrou) {
        const r = lineup.reservas.find((x) => x.posicaoId === p.posicaoId && !usedReserves.has(x.atletaId));
        const rp = r ? byId.get(r.atletaId) : undefined;
        if (r && rp) {
          usedReserves.add(r.atletaId);
          const rs = playerLive(rp, live, matches);
          row = { ...row, parcial: rs.parcial, projetado: rs.projetado, sub: rp, cap: false };
        }
      }
      const mult = row.cap ? CAPTAIN_MULTIPLIER : 1;
      parcial += row.parcial * mult;
      projetado += row.projetado * mult;
      rows.push(row);
    }
  }
  const topLive = Object.entries(live.atletas)
    .map(([id, v]) => ({ p: byId.get(Number(id)), v }))
    .filter((x): x is { p: PlayerProjection; v: LiveData["atletas"][number] } => Boolean(x.p))
    .sort((x, y) => y.v.pontos - x.v.pontos)
    .slice(0, 10);
  const encerrados = live.partidas.filter((m) => m.status === "encerrado").length;
  const naoComecou = live.source === "cartola" && live.partidas.every((m) => m.status === "pre");
  const inicio = live.partidas.map((m) => m.data).filter((d): d is string => Boolean(d)).sort()[0];
  const primeiroJogo = inicio ? new Date(inicio).toLocaleString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div data-tour="aovivo">
          <h1 className="font-display flex items-center gap-2 text-2xl font-extrabold">
            <Radio size={22} className="text-[var(--color-critical-ink)]" /> Ao Vivo — Rodada {live.rodada}
          </h1>
          <p className="text-sm text-[var(--color-ink-3)]">
            {live.source === "demo" ? "Modo Demonstração: rodada em andamento simulada a partir das distribuições do modelo." : "Parciais oficiais do Cartola."} Atualiza a cada minuto · {timeAgo(live.atualizadoEm)}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => lv.refetch()} disabled={lv.isFetching}>
            <RefreshCw size={15} className={lv.isFetching ? "animate-spin" : ""} /> Atualizar
          </button>
          {lineup && (
            <AskButton
              label="Interpretar parciais"
              payload={() => ({
                titulo: "Parciais da rodada",
                pergunta: "Interprete as parciais da minha tropa: o que já está garantido, o que ainda pode render, e se a projeção final está acima ou abaixo do esperado antes da rodada.",
                contexto: {
                  parcial,
                  projecaoFinal: projetado,
                  jogosEncerrados: encerrados,
                  totalJogos: live.partidas.length,
                  atletas: rows.map((r) => ({ atleta: (r.sub ?? r.p).apelido, capitao: r.cap, status: r.status, parcial: r.parcial, projetado: r.projetado, xPAntes: r.p.xP, substituiu: r.sub ? r.p.apelido : null })),
                },
              })}
            />
          )}
        </div>
      </div>

      {naoComecou && (
        <Card className="flex items-center gap-3 p-4">
          <Radio size={20} className="shrink-0 text-[var(--color-ink-3)]" aria-hidden />
          <p className="text-sm text-[var(--color-ink-2)]">
            A rodada {live.rodada} ainda não começou{primeiroJogo ? `: o primeiro jogo é ${primeiroJogo}` : ""}. Os placares e as parciais aparecem aqui assim que a bola rolar.
          </p>
        </Card>
      )}

      {lineup ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Parcial da tropa" value={fmt1(parcial)} accent="gold" />
            <StatTile label="Projeção final" value={fmt1(projetado)} hint="parcial + o que falta jogar" accent="brand" />
            <StatTile label="Jogos encerrados" value={`${encerrados}/${live.partidas.length}`} />
            <StatTile label="Esperado antes da rodada" value={fmt1(rows.reduce((s, r) => s + r.p.xP * (r.cap ? CAPTAIN_MULTIPLIER : 1), 0))} />
          </div>
          <Card className="p-3 sm:p-4">
            <SectionTitle title="Minha tropa" subtitle="Última tropa gerada no Montador" />
            <ul className="divide-y divide-[var(--color-line)]">
              {rows.map((r) => {
                const p = r.sub ?? r.p;
                return (
                  <li key={r.p.atletaId} className="flex items-center gap-3 py-2">
                    <PlayerPhoto p={p} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm font-semibold">
                        <span className="truncate">{p.apelido}</span>
                        {r.cap && <Crown size={13} className="text-[var(--color-gold)]" aria-label="capitão" />}
                        {r.sub && <span className="chip text-[10px]">entrou no lugar de {r.p.apelido}</span>}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-ink-3)]">
                        <PosBadge pos={p.posicaoId} /> <ClubBadge club={a.clubs[p.clubeId]} size={14} />
                        {r.status === "encerrado" ? "encerrado" : r.status === "andamento" ? "em andamento" : "não começou"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-display tabular text-base font-bold ${r.parcial < 0 ? "text-[var(--color-critical-ink)]" : ""}`}>{r.status === "pre" ? "—" : fmt1(r.parcial)}</div>
                      <div className="tabular text-[10px] text-[var(--color-ink-3)]">proj. {fmt1(r.projetado)}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      ) : (
        <Alert tone="info">
          Monte sua tropa no <Link to="/escalacao" className="font-semibold text-[var(--color-brand)] underline">Montador</Link> para acompanhar as parciais e a projeção final aqui.
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-4">
          <SectionTitle title="Jogos" />
          <ul className="space-y-2">
            {live.partidas.map((m) => (
              <li key={m.matchId} className="flex items-center gap-2 rounded-xl bg-[var(--color-surface-1)] px-3 py-2 text-sm">
                <ClubBadge club={a.clubs[m.casaId]} size={20} />
                <span className="w-10 font-semibold">{a.clubs[m.casaId]?.abreviacao}</span>
                <span className="font-display tabular flex-1 text-center text-base font-bold">
                  {m.placarCasa ?? "–"} x {m.placarFora ?? "–"}
                </span>
                <span className="w-10 text-right font-semibold">{a.clubs[m.foraId]?.abreviacao}</span>
                <ClubBadge club={a.clubs[m.foraId]} size={20} />
                <span
                  className={`chip ml-2 w-24 justify-center text-[10px] ${m.status === "andamento" ? "border-[var(--color-critical)]/40 text-[var(--color-critical-ink)]" : m.status === "encerrado" ? "" : "text-[var(--color-ink-3)]"}`}
                >
                  {m.status === "andamento" ? "● ao vivo" : m.status === "encerrado" ? "encerrado" : "a jogar"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-4">
          <SectionTitle title="Destaques da rodada" subtitle="Maiores parciais até agora" />
          <ul className="divide-y divide-[var(--color-line)]">
            {topLive.map(({ p, v }) => (
              <li key={p.atletaId} className="flex items-center gap-3 py-2">
                <PlayerPhoto p={p} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{p.apelido}</div>
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-ink-3)]">
                    <PosBadge pos={p.posicaoId} /> <ClubBadge club={a.clubs[p.clubeId]} size={14} /> xP antes {fmt1(p.xP)}
                  </div>
                </div>
                <div className="font-display tabular text-base font-bold text-[var(--color-gold)]">{fmt1(v.pontos)}</div>
              </li>
            ))}
            {!topLive.length && <li className="py-2 text-sm text-[var(--color-ink-3)]">Nenhum jogo começou ainda.</li>}
          </ul>
        </Card>
      </div>
      <FollowedTeams />
    </div>
  );
}
