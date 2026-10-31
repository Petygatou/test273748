import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronRight, CircleAlert, Database, FlaskConical, Info, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { Club } from "../engine/types";
import { useAuth } from "../lib/auth";
import { dateTime, fmt1, pct, timeAgo } from "../lib/format";
import { fetchCruzamentoOpcoes, fetchSyncLogs, sincronizarScoutsAgora, verificarFontesCruzamento, type CruzamentoOpcoes } from "../server/fnsCruzamento";
import { PorTimes } from "./cruzamento/PorTimes";
import { Alert, Card, ErrorBox, SectionTitle, Skeleton } from "./ui";

/** Aba "Cruzamento de Scout" de Estatísticas: cruzamento por time, jogo a jogo da rodada. */
export function Cruzamento() {
  const [temporada, setTemporada] = useState<number | undefined>();
  const [rodada, setRodada] = useState<number | undefined>();
  const opcoes = useQuery({ queryKey: ["cruz-opcoes", temporada ?? 0], queryFn: () => fetchCruzamentoOpcoes({ data: { temporada } }), staleTime: 5 * 60_000 });
  const o = opcoes.data;
  const clubes = useMemo(() => Object.fromEntries((o?.clubes ?? []).map((c) => [c.id, c as Club])) as Record<number, Club>, [o]);

  if (opcoes.isLoading)
    return (
      <div className="space-y-4" aria-busy="true">
        <span className="sr-only">Carregando o Cruzamento de Scout…</span>
        <Skeleton className="h-28" />
        <Skeleton className="h-40" />
        <Skeleton className="h-96" />
      </div>
    );
  if (opcoes.error || !o) return <ErrorBox error={opcoes.error} retry={() => opcoes.refetch()} />;

  return (
    <div className="space-y-4">
      <Card className="p-3 sm:p-4">
        <SectionTitle
          title="Cruzamento de Scout"
          subtitle="Em cada jogo da rodada: o que o time faz no mando × o que o adversário cede."
          icon={<FlaskConical size={18} className="text-[var(--color-brand)]" />}
        />
        <SituacaoDados o={o} />
      </Card>
      <PorTimes
        o={o}
        clubes={clubes}
        rodada={rodada ?? o.rodadaPadrao}
        setRodada={setRodada}
        setTemporada={(t) => {
          setTemporada(t);
          setRodada(undefined);
        }}
      />
    </div>
  );
}

/* ---------------------------- situação dos dados ---------------------------- */

function SituacaoDados({ o }: { o: CruzamentoOpcoes }) {
  const auth = useAuth();
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [verif, setVerif] = useState<Awaited<ReturnType<typeof verificarFontesCruzamento>> | null>(null);
  const [ocupado, setOcupado] = useState<"verificar" | "sincronizar" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const logs = useQuery({ queryKey: ["cruz-logs"], queryFn: () => fetchSyncLogs(), enabled: aberto && auth.isAdmin });
  const st = o.status;
  const estado = o.demo ? "demo" : st.estado;
  const cor =
    estado === "atualizado" ? "bg-[var(--color-good)]" : estado === "desatualizado" ? "bg-[var(--color-warning)]" : estado === "demo" ? "bg-[var(--color-series-b)]" : "bg-[var(--color-critical)]";
  const rotulo =
    estado === "demo" ? "Demonstração: dados fictícios" : estado === "atualizado" ? "Dados atualizados" : estado === "desatualizado" ? "Dados desatualizados" : "Histórico guardado indisponível";
  const Icone = estado === "atualizado" ? CheckCircle2 : estado === "demo" ? Info : estado === "desatualizado" ? TriangleAlert : CircleAlert;

  const verificar = async () => {
    setOcupado("verificar");
    setMsg(null);
    try {
      setVerif(await verificarFontesCruzamento());
      void logs.refetch();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao verificar");
    } finally {
      setOcupado(null);
    }
  };
  const sincronizar = async () => {
    setOcupado("sincronizar");
    setMsg(null);
    try {
      const r = await sincronizarScoutsAgora();
      setMsg(!r.ok ? `Falhou: ${r.erro}` : "aviso" in r && r.aviso ? r.aviso : `Sincronizado em ${fmt1((r.ms ?? 0) / 1000)} s.`);
      await qc.invalidateQueries({ queryKey: ["cruz-opcoes"] });
      void qc.invalidateQueries({ queryKey: ["cruz-rank"] });
      void logs.refetch();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao sincronizar");
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-1)]">
      <button type="button" className="flex w-full items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-sm sm:flex-wrap" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
        <span className="flex items-center gap-2 font-semibold">
          <span className={`h-2 w-2 rounded-full ${cor}`} aria-hidden />
          <Icone size={15} aria-hidden />
          {rotulo}
        </span>
        <span className="hidden text-xs text-[var(--color-ink-3)] sm:inline">
          Fonte: {o.fonte} · temporada {o.temporada} · {o.historicoRodadas} rodadas com scouts
          {st.ultimaVerificacao ? ` · conferido ${timeAgo(st.ultimaVerificacao)}` : ""}
        </span>
        <ChevronRight size={15} className={`ml-auto text-[var(--color-ink-3)] transition-transform ${aberto ? "rotate-90" : ""}`} aria-hidden />
      </button>
      {aberto && (
        <div className="space-y-3 border-t border-[var(--color-line)] px-3 py-3 text-sm">
          <p className="text-xs text-[var(--color-ink-3)] sm:hidden">
            Fonte: {o.fonte} · temporada {o.temporada} · {o.historicoRodadas} rodadas com scouts
            {st.ultimaVerificacao ? ` · conferido ${timeAgo(st.ultimaVerificacao)}` : ""}
          </p>
          <p className="text-[var(--color-ink-2)]">
            {o.demo ? "O site está em modo demonstração: atletas e números são fictícios, só para mostrar o funcionamento. Em produção o Cruzamento usa apenas dados reais do Cartola." : st.explicacao}
          </p>
          {!o.demo && (
            <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <Dado k="Rodadas guardadas" v={`${st.rodadasGuardadas} de ${st.rodadasEsperadas}`} />
              <Dado k="Lacunas" v={st.lacunas.length ? st.lacunas.join(", ") : "nenhuma"} />
              <Dado k="Pontos conferidos" v={st.validacao.linhas ? `${pct(st.validacao.batem / st.validacao.linhas, 1)} de ${st.validacao.linhas.toLocaleString("pt-BR")} atuações` : "—"} />
              <Dado k="Correções da fonte" v={`${st.revisoes} rodada(s) revisada(s)`} />
              <Dado k="Última conferência" v={st.ultimaVerificacao ? dateTime(st.ultimaVerificacao) : "—"} />
              <Dado k="Última mudança" v={st.ultimaMudanca ? dateTime(st.ultimaMudanca) : "—"} />
              <Dado k="Atualização" v="O site relê o mercado a cada minuto; rodadas encerradas há 5+ dias são lidas do banco." />
              <Dado k="Parciais" v="Nunca entram no histórico: só rodadas encerradas." />
            </dl>
          )}
          {st.ultimoErro && (
            <Alert tone="warning">
              Último erro da fonte ({dateTime(st.ultimoErro.em)}): {st.ultimoErro.mensagem}
            </Alert>
          )}
          {auth.isAdmin && (
            <div className="space-y-2 rounded-xl border border-[var(--color-line)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-ink-2)]">
                  <ShieldCheck size={14} aria-hidden /> Painel ADM
                </span>
                <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs" onClick={verificar} disabled={ocupado != null}>
                  <Database size={13} aria-hidden /> {ocupado === "verificar" ? "Testando…" : "Testar os endpoints do Cartola"}
                </button>
                <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs" onClick={sincronizar} disabled={ocupado != null}>
                  <RefreshCw size={13} className={ocupado === "sincronizar" ? "animate-spin" : ""} aria-hidden /> {ocupado === "sincronizar" ? "Sincronizando…" : "Sincronizar agora"}
                </button>
                {msg && <span className="text-xs text-[var(--color-ink-2)]">{msg}</span>}
              </div>
              {verif && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[var(--color-ink-3)]">
                        <th className="py-1 pr-2">Endpoint</th>
                        <th className="pr-2">Resultado</th>
                        <th className="pr-2">HTTP</th>
                        <th className="pr-2">Tempo</th>
                        <th>O que veio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {verif.resultados.map((v) => (
                        <tr key={v.endpoint} className="border-t border-[var(--color-line)] align-top">
                          <td className="py-1.5 pr-2 font-mono">{v.endpoint}</td>
                          <td className="pr-2">
                            <span className={v.situacao === "ok" ? "text-[var(--color-good-ink)]" : v.situacao === "nao-se-aplica" ? "text-[var(--color-ink-3)]" : "text-[var(--color-critical-ink)]"}>
                              {v.situacao === "ok"
                                ? "funcionou"
                                : v.situacao === "nao-se-aplica"
                                  ? "não se aplica agora"
                                  : v.situacao === "campos-faltando"
                                    ? `faltam: ${v.faltando.join(", ")}`
                                    : "falhou"}
                            </span>
                          </td>
                          <td className="pr-2 tabular">{v.http ?? "rede"}</td>
                          <td className="pr-2 tabular">{v.ms} ms</td>
                          <td className="text-[var(--color-ink-2)]">
                            {v.observacao}
                            <span className="block text-[var(--color-ink-3)]">{v.uso}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {logs.data && logs.data.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-xs text-[var(--color-ink-2)]">Registro de sincronização ({logs.data.length})</summary>
                  <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs">
                    {logs.data.map((l) => (
                      <li key={l.id} className="flex gap-2 border-t border-[var(--color-line)] pt-1">
                        <span className="w-32 shrink-0 text-[var(--color-ink-3)]">{dateTime(l.em)}</span>
                        <span className={l.resultado === "erro" ? "text-[var(--color-critical-ink)]" : l.resultado === "parcial" ? "text-[var(--color-warning)]" : "text-[var(--color-ink-2)]"}>
                          {l.operacao} · {l.fonte}
                          {l.registros ? ` · ${l.novos} novas, ${l.revisados} revisadas` : ""}
                          {l.mensagem ? ` — ${l.mensagem}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Dado({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="rounded-lg bg-[var(--color-surface-2)] px-2 py-1.5">
      <dt className="text-[10px] font-semibold tracking-wide text-[var(--color-ink-3)] uppercase">{k}</dt>
      <dd className="mt-0.5 text-[var(--color-ink)]">{v}</dd>
    </div>
  );
}
