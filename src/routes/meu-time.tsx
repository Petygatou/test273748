import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronDown, Crown, KeyRound, Lock, RefreshCw, Swords, Trophy, Wallet } from "lucide-react";
import { useMemo } from "react";
import { AskButton } from "../components/AskButton";
import { CartolaConnect, useCartolaToken } from "../components/CartolaConnect";
import { EscolherMeuTime } from "../components/EscolherMeuTime";
import type { TeamSummary } from "../server/cartolaConta";
import { FollowedTeams } from "../components/FollowedTeams";
import { Alert, Card, ClubBadge, PageSkeleton, PlayerPhoto, PosBadge, SectionTitle, StatTile } from "../components/ui";
import { optimizeLineup } from "../engine/optimizer";
import { CAPTAIN_MULTIPLIER } from "../engine/rules";
import { compactPlayer } from "../lib/derive";
import { cs, fmt1, signed } from "../lib/format";
import { analysisQuery } from "../lib/queries";
import { KEYS, readLocal, useLocal, writeLocal } from "../lib/storage";
import { fetchTeamFn, myLeaguesFn, myTeamFn } from "../server/fnsCartola";

export const Route = createFileRoute("/meu-time")({ component: MyTeamPage });

function MyTeamPage() {
  const [token, setToken] = useCartolaToken();
  // sem login: o time escolhido pelo nome (leitura pública do Cartola)
  const [meuTime, setMeuTime] = useLocal<TeamSummary | null>(KEYS.meuTime, null);
  const an = useQuery(analysisQuery);
  const team = useQuery({
    queryKey: ["meu-time", token ? token.slice(-12) : `publico:${meuTime?.timeId ?? ""}`],
    queryFn: () => (token ? myTeamFn({ data: { token } }) : fetchTeamFn({ data: { id: meuTime!.timeId } })),
    enabled: Boolean(token || meuTime),
    retry: false,
    staleTime: 60_000,
  });
  const leagues = useQuery({ queryKey: ["minhas-ligas", token.slice(-12)], queryFn: () => myLeaguesFn({ data: { token } }), enabled: Boolean(token), retry: false, staleTime: 5 * 60_000 });
  const navigate = useNavigate();

  const a = an.data?.analysis;
  const t = team.data;
  const comparison = useMemo(() => {
    if (!a || !t || !t.atletas.length) return null;
    const byId = new Map(a.players.map((p) => [p.atletaId, p] as const));
    const mine = t.atletas.map((x) => byId.get(x.atletaId)).filter((p): p is NonNullable<typeof p> => Boolean(p));
    const cap = t.capitaoId != null ? byId.get(t.capitaoId) : undefined;
    const xpAtual = mine.reduce((s, p) => s + p.xP, 0) + (cap ? (CAPTAIN_MULTIPLIER - 1) * cap.xP : 0);
    const budget = t.patrimonio ?? mine.reduce((s, p) => s + p.preco, 0);
    const best = optimizeLineup(a, { formation: "auto", budget, profile: "equilibrada" }).lineup;
    return { mine, xpAtual, budget, best, byId };
  }, [a, t]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-extrabold">Meu Time</h1>
        <p className="text-sm text-[var(--color-ink-3)]">Seu time do Cartola lido da API oficial, comparado com a tropa ótima do motor para o seu patrimônio.</p>
      </div>
      <div data-tour="meutime-conectar" className="space-y-3">
        {token ? <CartolaConnect /> : !meuTime ? <EscolherMeuTime onEscolher={setMeuTime} /> : null}
        {!token && (
          <details className="group rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-1)]/40">
            <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-sm font-semibold sm:p-4">
              <KeyRound size={16} className="shrink-0 text-[var(--color-gold)]" aria-hidden />
              <span className="flex-1">
                Opcional: conectar a conta Globo
                <span className="block text-xs font-normal text-[var(--color-ink-3)]">Só para ver suas ligas privadas e escalar direto pelo Tropa. Para ver o seu time, não precisa.</span>
              </span>
              <ChevronDown size={16} className="shrink-0 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="px-3 pb-3 sm:px-4 sm:pb-4">
              <CartolaConnect />
            </div>
          </details>
        )}
      </div>

      {(token || meuTime) && team.isLoading && <PageSkeleton />}
      {(token || meuTime) && team.error && (
        <Alert tone="critical">
          {team.error instanceof Error ? team.error.message : "Falha ao ler seu time."}{" "}
          <button className="underline" onClick={() => (token ? setToken("") : setMeuTime(null))}>
            {token ? "Desconectar" : "Escolher outro time"}
          </button>
        </Alert>
      )}

      {t && (
        <>
          <Card className="flex flex-wrap items-center gap-4 p-4">
            {t.time.escudo && <img src={t.time.escudo} alt="" width={56} height={56} className="rounded-lg" />}
            <div className="min-w-0 flex-1">
              <div className="font-display truncate text-xl font-bold">{t.time.nome}</div>
              <div className="text-sm text-[var(--color-ink-3)]">{t.time.cartoleiro}</div>
              {!token && (
                <button type="button" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-ink-2)] underline" onClick={() => setMeuTime(null)}>
                  <RefreshCw size={12} aria-hidden /> Não é o seu? Trocar de time
                </button>
              )}
            </div>
            {t.patrimonio != null && (
              <button
                className="btn btn-ghost"
                onClick={() => {
                  const cur = readLocal<Record<string, unknown>>(KEYS.builder, {});
                  writeLocal(KEYS.builder, { profile: "equilibrada", formation: "auto", minPJogar: 0.5, ...cur, budget: t.patrimonio });
                  navigate({ to: "/escalacao" });
                }}
              >
                <Swords size={15} /> Montar com meu patrimônio
              </button>
            )}
            <button
              className="btn btn-ghost"
              onClick={() => {
                writeLocal(
                  KEYS.fixed,
                  t.atletas.map((x) => x.atletaId),
                );
                navigate({ to: "/escalacao" });
              }}
            >
              <Lock size={15} /> Fixar meu time no Montador
            </button>
          </Card>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Patrimônio" value={cs(t.patrimonio)} hint={t.valorTime != null ? `time vale ${cs(t.valorTime)}` : undefined} accent="gold" />
            <StatTile label="Pontos na rodada" value={fmt1(t.pontosRodada)} />
            <StatTile label="Pontos no campeonato" value={fmt1(t.pontosCampeonato)} />
            <StatTile
              label="Projeção do seu time"
              value={comparison ? fmt1(comparison.xpAtual) : "—"}
              hint={comparison?.best ? `ótimo no seu patrimônio: ${fmt1(comparison.best.xPComCapitao)} (${signed(comparison.best.xPComCapitao - comparison.xpAtual, 1)})` : undefined}
              accent="brand"
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-4">
              <SectionTitle title="Escalação atual" subtitle="Pontos previstos para esta rodada" icon={<Wallet size={18} className="text-[var(--color-brand)]" />} />
              {!t.atletas.length && <p className="text-sm text-[var(--color-ink-3)]">Você ainda não escalou nesta rodada.</p>}
              <ul className="divide-y divide-[var(--color-line)]">
                {[...t.atletas]
                  .sort((x, y) => x.posicaoId - y.posicaoId)
                  .map((x) => {
                    const p = comparison?.byId.get(x.atletaId);
                    return (
                      <li key={x.atletaId} className="flex items-center gap-2 py-2">
                        <PosBadge pos={x.posicaoId} />
                        <PlayerPhoto p={{ foto: x.foto, apelido: x.apelido, posicaoId: x.posicaoId as 1, atletaId: x.atletaId, clubeId: x.clubeId }} size={28} />
                        <div className="min-w-0 flex-1">
                          <Link to="/jogador/$id" params={{ id: String(x.atletaId) }} className="flex items-center gap-1.5 truncate text-sm font-semibold hover:text-[var(--color-brand)]">
                            {x.apelido} {x.atletaId === t.capitaoId && <Crown size={12} className="text-[var(--color-gold)]" aria-label="capitão" />}
                          </Link>
                          <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-ink-3)]">
                            <ClubBadge club={a?.clubs[x.clubeId]} size={14} /> {cs(x.preco)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-display tabular font-bold text-[var(--color-gold)]">{p ? fmt1(p.xP) : "—"}</div>
                          <div className="text-[10px] text-[var(--color-ink-3)]">{p?.alertas[0]?.split(":")[0] ?? "pts previstos"}</div>
                        </div>
                      </li>
                    );
                  })}
              </ul>
              {comparison && a && (
                <div className="mt-3">
                  <AskButton
                    label="Auditar meu time"
                    payload={() => ({
                      titulo: "Auditoria do meu time",
                      pergunta: "Audite meu time atual do Cartola: riscos de não jogar, confrontos, capitão e as melhores trocas dentro do meu patrimônio. Compare com a tropa ótima do motor.",
                      contexto: {
                        patrimonio: t.patrimonio,
                        capitao: comparison.byId.get(t.capitaoId ?? -1)?.apelido,
                        meuTime: comparison.mine.map(compactPlayer(a)),
                        xPAtual: comparison.xpAtual,
                        tropaOtima: comparison.best ? { xP: comparison.best.xPComCapitao, atletas: comparison.best.slots.map((s) => comparison.byId.get(s.atletaId)?.apelido) } : null,
                      },
                    })}
                  />
                </div>
              )}
            </Card>
            <Card className="p-4">
              <SectionTitle title="Minhas ligas" icon={<Trophy size={18} className="text-[var(--color-gold)]" />} />
              {!token && (
                <p className="text-sm text-[var(--color-ink-3)]">O Cartola só mostra as suas ligas para quem conecta a conta Globo (opcional, no topo da página). As ligas públicas estão em Ligas.</p>
              )}
              {token && leagues.isLoading && <p className="text-sm text-[var(--color-ink-3)]">Carregando…</p>}
              {leagues.error && <Alert tone="warning">{leagues.error instanceof Error ? leagues.error.message : "Falha ao ler ligas"}</Alert>}
              <ul className="space-y-1.5">
                {(leagues.data ?? []).map((l) => (
                  <li key={l.ligaId || l.slug}>
                    <Link to="/ligas" search={{ slug: l.slug }} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-[var(--color-surface-3)]">
                      {l.imagem && <img src={l.imagem} alt="" width={28} height={28} className="rounded" />}
                      <span className="flex-1 truncate text-sm font-semibold">{l.nome}</span>
                      {l.totalTimes != null && <span className="text-xs text-[var(--color-ink-3)]">{l.totalTimes} times</span>}
                    </Link>
                  </li>
                ))}
                {leagues.data && !leagues.data.length && <li className="text-sm text-[var(--color-ink-3)]">Você não participa de ligas.</li>}
              </ul>
            </Card>
          </div>
        </>
      )}

      <FollowedTeams />
    </div>
  );
}
