import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, ChevronRight, CircleAlert, Database, FlaskConical, Info, RefreshCw, Search, ShieldCheck, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CRITERIOS, type CriterioRanking, type FiltroMando } from "../engine/cruzamento";
import { ALL_POSITIONS, POSITIONS, type PositionId } from "../engine/rules";
import { DEF_POR_CODIGO, SCOUT_DEFS, scoutsDaPosicao, valorScout, type CruzScout } from "../engine/scoutDefs";
import type { Club } from "../engine/types";
import { useAuth } from "../lib/auth";
import { dateTime, fmt1, fmt2, pct, timeAgo } from "../lib/format";
import { norm } from "../lib/search";
import { KEYS, useLocal } from "../lib/storage";
import {
  fetchCruzamentoAtleta,
  fetchCruzamentoOpcoes,
  fetchCruzamentoRanking,
  fetchSyncLogs,
  sincronizarScoutsAgora,
  verificarFontesCruzamento,
  type CruzamentoAtleta,
  type CruzamentoOpcoes,
  type CruzamentoRanking,
} from "../server/fnsCruzamento";
import { BarrasPartidas, FaixaCenarios, IndiceComparativo } from "./cruzamento/graficos";
import { PorTimes } from "./cruzamento/PorTimes";
import { Alert, Card, ClubBadge, ErrorBox, PlayerPhoto, PosBadge, SectionTitle, Seg, Skeleton, StatusPill } from "./ui";

type JanelaUi = "t" | "3" | "5" | "10";
interface Filtros {
  janela: JanelaUi;
  mando: FiltroMando;
  posicao: "all" | `${PositionId}`;
  clubeId: number;
  adversarioId: number;
  scout: CruzScout;
  limiar: number;
  criterio: CriterioRanking;
  provaveis: boolean;
}
const PADRAO: Filtros = { janela: "t", mando: "todos", posicao: "all", clubeId: 0, adversarioId: 0, scout: "FIN", limiar: 1, criterio: "pontos", provaveis: true };

const CONF_ROTULO = { alta: "Alta", media: "Média", baixa: "Baixa" } as const;
const CONF_COR = {
  alta: "text-[var(--color-good-ink)] bg-[var(--color-good)]/15",
  media: "text-[var(--color-gold)] bg-[var(--color-gold)]/15",
  baixa: "text-[var(--color-ink-3)] bg-[var(--color-surface-1)]",
} as const;
const CONF_EXPLICA =
  "Alta: 10+ jogos na amostra, taxa estimada com erro relativo de até 30% e 6+ jogos do adversário. Média: 5+ jogos e erro de até 55%. Baixa: o resto. Com menos de 3 jogos não há projeção.";

function Confianca({ c }: { c: "alta" | "media" | "baixa" | null | undefined }) {
  if (!c) return <span className="text-[var(--color-ink-3)]">—</span>;
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold ${CONF_COR[c]}`} title={CONF_EXPLICA}>
      {CONF_ROTULO[c]}
    </span>
  );
}

const nomeScout = (c: CruzScout) => DEF_POR_CODIGO.get(c)?.nome ?? c;
const janelaParam = (j: JanelaUi) => (j === "t" ? undefined : Number(j));
const pctOuTraco = (x: number | null | undefined, d = 0) => (x == null ? "—" : pct(x, d));

/** Aba "Cruzamento de Scout" de Estatísticas. */
export function Cruzamento({ atletaId, onAtleta }: { atletaId?: number; onAtleta: (id: number | undefined) => void }) {
  const [salvos, setSalvos] = useLocal<Filtros>(KEYS.cruzamento, PADRAO);
  const f = { ...PADRAO, ...salvos };
  const set = (p: Partial<Filtros>) => setSalvos((s) => ({ ...PADRAO, ...s, ...p }));
  const [temporada, setTemporada] = useState<number | undefined>();
  const [rodada, setRodada] = useState<number | undefined>();
  const [maisFiltros, setMaisFiltros] = useState(false);
  const [visaoSalva, setVisao] = useLocal<"times" | "atleta">(KEYS.cruzamentoVisao, "times");
  // link direto para um atleta abre a análise por atleta
  const visao = atletaId ? "atleta" : visaoSalva;
  const opcoes = useQuery({ queryKey: ["cruz-opcoes", temporada ?? 0], queryFn: () => fetchCruzamentoOpcoes({ data: { temporada } }), staleTime: 5 * 60_000 });
  const o = opcoes.data;
  const clubes = useMemo(() => Object.fromEntries((o?.clubes ?? []).map((c) => [c.id, c as Club])) as Record<number, Club>, [o]);

  if (opcoes.isLoading)
    return (
      <div className="space-y-4" aria-busy="true">
        <span className="sr-only">Carregando o Cruzamento de Scout…</span>
        <Skeleton className="h-28" />
        <Skeleton className="h-24" />
        <Skeleton className="h-96" />
      </div>
    );
  if (opcoes.error || !o) return <ErrorBox error={opcoes.error} retry={() => opcoes.refetch()} />;

  const rodadaEf = rodada ?? o.rodadaPadrao;
  const comum = { temporada: o.atual ? undefined : o.temporada, rodada: rodadaEf, janela: janelaParam(f.janela), mando: f.mando };
  const posNum = f.posicao === "all" ? undefined : (Number(f.posicao) as PositionId);
  const scoutsDisponiveis = posNum ? scoutsDaPosicao(posNum) : SCOUT_DEFS.filter((d) => d.posicoes.some((p) => p !== 6 && p !== 1) || d.codigo === "DE");
  const scoutValido = scoutsDisponiveis.some((d) => d.codigo === f.scout) ? f.scout : (scoutsDisponiveis[0]?.codigo ?? "FIN");
  const limiares = DEF_POR_CODIGO.get(scoutValido)?.limiares ?? [1];
  const limiar = limiares.includes(f.limiar) ? f.limiar : limiares[0];

  return (
    <div className="space-y-4">
      <Card className="p-3 sm:p-4">
        <SectionTitle
          title="Cruzamento de Scout"
          subtitle="Por time: em cada jogo da rodada, o que o setor do time fez no mesmo mando × o que o adversário cedeu a esse setor. Por atleta: histórico de cada jogador × adversário, com projeção e metodologia aberta."
          icon={<FlaskConical size={18} className="text-[var(--color-brand)]" />}
        />
        <SituacaoDados o={o} />
        <div className="mt-3">
          <Seg
            label="Visão"
            value={visao}
            onChange={(v) => {
              setVisao(v);
              if (v === "times" && atletaId) onAtleta(undefined);
            }}
            options={[
              { value: "times", label: "Por time (rodada)" },
              { value: "atleta", label: "Por atleta" },
            ]}
          />
        </div>
      </Card>

      {visao === "times" ? (
        <PorTimes o={o} clubes={clubes} rodada={rodadaEf} setRodada={setRodada} />
      ) : (
        <>
          <Card className="p-3 sm:p-4">
            {/* celular: os filtros menos usados ficam recolhidos */}
            <button type="button" className="btn btn-ghost mb-2 w-full justify-between text-sm md:hidden" onClick={() => setMaisFiltros((v) => !v)} aria-expanded={maisFiltros}>
              <span className="truncate">
                Filtros: {o.temporada} · rodada {rodadaEf} · {f.posicao === "all" ? "todas as posições" : POSITIONS[Number(f.posicao) as PositionId].abbr} ·{" "}
                {f.janela === "t" ? "temporada" : `últ. ${f.janela}`}
                {f.mando !== "todos" ? ` · ${f.mando}` : ""}
                {f.clubeId ? ` · ${clubes[f.clubeId]?.abreviacao}` : ""}
                {f.adversarioId ? ` · vs ${clubes[f.adversarioId]?.abreviacao}` : ""}
              </span>
              <ChevronRight size={15} className={`shrink-0 transition-transform ${maisFiltros ? "rotate-90" : ""}`} aria-hidden />
            </button>
            <div className={maisFiltros ? "" : "hidden md:block"}>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Campo rotulo="Temporada">
                  <select
                    className="input"
                    value={o.temporada}
                    onChange={(e) => {
                      const t = Number(e.target.value);
                      setTemporada(t);
                      setRodada(undefined);
                    }}
                    aria-label="Temporada"
                  >
                    {o.temporadas.map((t) => (
                      <option key={t} value={t}>
                        {t}
                        {t === o.temporadas[0] && o.atual ? " (atual)" : ""}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo rotulo="Rodada analisada">
                  <select className="input" value={rodadaEf} onChange={(e) => setRodada(Number(e.target.value))} aria-label="Rodada">
                    {Array.from({ length: Math.max(0, (o.atual ? o.rodadaAtual : o.rodadaAtual - 1) - 1) }, (_, i) => i + 2)
                      .reverse()
                      .map((r) => (
                        <option key={r} value={r}>
                          Rodada {r}
                          {o.atual && r === o.rodadaAtual ? " (próxima)" : " (já jogada: previsão × real)"}
                        </option>
                      ))}
                  </select>
                </Campo>
                <Campo rotulo="Clube">
                  <select className="input" value={f.clubeId} onChange={(e) => set({ clubeId: Number(e.target.value) })} aria-label="Clube">
                    <option value={0}>Todos os clubes</option>
                    {o.clubes
                      .slice()
                      .sort((x, y) => x.nome.localeCompare(y.nome))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                  </select>
                </Campo>
                <Campo rotulo="Adversário">
                  <select className="input" value={f.adversarioId} onChange={(e) => set({ adversarioId: Number(e.target.value) })} aria-label="Adversário">
                    <option value={0}>Qualquer adversário</option>
                    {o.clubes
                      .slice()
                      .sort((x, y) => x.nome.localeCompare(y.nome))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          Quem enfrenta o {c.nome}
                        </option>
                      ))}
                  </select>
                </Campo>
              </div>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <Campo rotulo="Posição">
                  <Seg
                    label="Posição"
                    value={f.posicao}
                    onChange={(v) => set({ posicao: v })}
                    options={[{ value: "all", label: "Todas" }, ...ALL_POSITIONS.map((p) => ({ value: `${p}` as `${PositionId}`, label: POSITIONS[p].abbr as string }))]}
                  />
                </Campo>
                <Campo rotulo="Partidas anteriores">
                  <Seg
                    label="Partidas anteriores"
                    value={f.janela}
                    onChange={(v) => set({ janela: v })}
                    options={[
                      { value: "3", label: "Últ. 3" },
                      { value: "5", label: "Últ. 5" },
                      { value: "10", label: "Últ. 10" },
                      { value: "t", label: "Temporada" },
                    ]}
                  />
                </Campo>
                <Campo rotulo="Mando (histórico)">
                  <Seg
                    label="Mando"
                    value={f.mando}
                    onChange={(v) => set({ mando: v })}
                    options={[
                      { value: "todos", label: "Todos" },
                      { value: "casa", label: "Em casa" },
                      { value: "fora", label: "Fora" },
                    ]}
                  />
                </Campo>
              </div>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
              <Campo rotulo="Scout analisado">
                <div className="flex flex-wrap gap-2">
                  <select className="input min-w-0 flex-1" value={scoutValido} onChange={(e) => set({ scout: e.target.value as CruzScout })} aria-label="Scout">
                    {(["ofensivo", "defensivo", "negativo", "coletivo"] as const).map((cat) => {
                      const ds = scoutsDisponiveis.filter((d) => d.categoria === cat);
                      return ds.length ? (
                        <optgroup key={cat} label={cat === "ofensivo" ? "Ataque" : cat === "defensivo" ? "Defesa" : cat === "negativo" ? "Negativos" : "Coletivo"}>
                          {ds.map((d) => (
                            <option key={d.codigo} value={d.codigo}>
                              {d.nome} ({d.codigo})
                            </option>
                          ))}
                        </optgroup>
                      ) : null;
                    })}
                  </select>
                  {limiares.length > 1 && (
                    <Seg label="Pelo menos" value={String(limiar)} onChange={(v) => set({ limiar: Number(v) })} options={limiares.map((k) => ({ value: String(k), label: `${k}+` }))} />
                  )}
                </div>
              </Campo>
              <Campo rotulo="Minutos jogados">
                <p className="max-w-64 py-1 text-xs text-[var(--color-ink-3)]" title="A API do Cartola não publica minutos por jogo. As análises são por partida disputada.">
                  Indisponível na fonte: análise por partida.
                </p>
              </Campo>
            </div>
            <BuscaAtleta o={o} clubes={clubes} onEscolher={onAtleta} />
          </Card>

          {atletaId ? (
            <FichaAtleta
              key={atletaId}
              o={o}
              clubes={clubes}
              atletaId={atletaId}
              comum={comum}
              scout={scoutValido}
              limiar={limiar}
              onScout={(c) => set({ scout: c })}
              onVoltar={() => onAtleta(undefined)}
            />
          ) : (
            <Ranking clubes={clubes} comum={comum} f={{ ...f, scout: scoutValido, limiar }} posicao={posNum} set={set} onAtleta={onAtleta} />
          )}

          <Metodologia o={o} />
        </>
      )}
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-semibold tracking-wide text-[var(--color-ink-3)] uppercase">{rotulo}</span>
      {children}
    </label>
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
      <button type="button" className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-sm" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
        <span className="flex items-center gap-2 font-semibold">
          <span className={`h-2 w-2 rounded-full ${cor}`} aria-hidden />
          <Icone size={15} aria-hidden />
          {rotulo}
        </span>
        <span className="text-xs text-[var(--color-ink-3)]">
          Fonte: {o.fonte} · temporada {o.temporada} · {o.historicoRodadas} rodadas com scouts
          {st.ultimaVerificacao ? ` · conferido ${timeAgo(st.ultimaVerificacao)}` : ""}
        </span>
        <ChevronRight size={15} className={`ml-auto text-[var(--color-ink-3)] transition-transform ${aberto ? "rotate-90" : ""}`} aria-hidden />
      </button>
      {aberto && (
        <div className="space-y-3 border-t border-[var(--color-line)] px-3 py-3 text-sm">
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

/* -------------------------------- busca -------------------------------- */

function BuscaAtleta({ o, clubes, onEscolher }: { o: CruzamentoOpcoes; clubes: Record<number, Club>; onEscolher: (id: number) => void }) {
  const [q, setQ] = useState("");
  const achados = useMemo(() => {
    const n = norm(q);
    if (n.length < 2) return [];
    return o.atletas.filter((a) => norm(a.apelido).includes(n) || norm(clubes[a.clubeId]?.nome ?? "").startsWith(n)).slice(0, 8);
  }, [q, o.atletas, clubes]);
  return (
    <div className="relative mt-3">
      <Search size={15} className="pointer-events-none absolute top-[19px] left-3 -translate-y-1/2 text-[var(--color-ink-3)]" aria-hidden />
      <input className="input pl-9" placeholder="Buscar atleta para abrir a análise completa" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar atleta" />
      {achados.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] shadow-xl shadow-black/40" role="listbox">
          {achados.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-1)]"
                onClick={() => {
                  setQ("");
                  onEscolher(a.id);
                }}
              >
                <PlayerPhoto p={{ apelido: a.apelido, posicaoId: a.posicaoId, atletaId: a.id, clubeId: a.clubeId }} size={26} />
                <span className="flex-1 truncate font-semibold">{a.apelido}</span>
                <PosBadge pos={a.posicaoId} />
                <ClubBadge club={clubes[a.clubeId]} size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------- ranking ------------------------------- */

type LinhaR = CruzamentoRanking["linhas"][number];

function valorCriterio(l: LinhaR, c: CriterioRanking): number | null {
  switch (c) {
    case "pontos":
      return l.esperado;
    case "scout":
      return l.scout.p;
    case "ofensivo":
      return l.ofensivo;
    case "defensivo":
      return l.defensivo;
    case "confronto":
      return l.confronto;
    case "regularidade":
      return l.regularidade;
    case "volatilidade":
      return l.desvio == null ? null : -l.desvio;
    case "razao":
      return l.razao;
  }
}

function mostrarCriterio(l: LinhaR, c: CriterioRanking): string {
  switch (c) {
    case "pontos":
      return fmt1(l.esperado);
    case "scout":
      return pctOuTraco(l.scout.p);
    case "ofensivo":
      return fmt1(l.ofensivo);
    case "defensivo":
      return fmt1(l.defensivo);
    case "confronto":
      return l.confronto == null ? "—" : `${l.confronto > 0 ? "+" : ""}${fmt1(l.confronto)}`;
    case "regularidade":
      return pctOuTraco(l.regularidade);
    case "volatilidade":
      return l.desvio == null ? "—" : `±${fmt1(l.desvio)}`;
    case "razao":
      return fmt2(l.razao);
  }
}

function Ranking({
  clubes,
  comum,
  f,
  posicao,
  set,
  onAtleta,
}: {
  clubes: Record<number, Club>;
  comum: { temporada?: number; rodada: number; janela?: number; mando: FiltroMando };
  f: Filtros;
  posicao?: PositionId;
  set: (p: Partial<Filtros>) => void;
  onAtleta: (id: number) => void;
}) {
  const [nome, setNome] = useState("");
  const [qtd, setQtd] = useState(40);
  const params = { ...comum, scout: f.scout, limiar: f.limiar, posicao, clubeId: f.clubeId || undefined, adversarioId: f.adversarioId || undefined, somenteProvaveis: f.provaveis ? "1" : "0" };
  const r = useQuery({ queryKey: ["cruz-rank", params], queryFn: () => fetchCruzamentoRanking({ data: params }), placeholderData: keepPreviousData, staleTime: 5 * 60_000 });
  useEffect(() => setQtd(40), [f.criterio, f.scout, posicao, f.clubeId, f.adversarioId]);
  const criterio = CRITERIOS.find((c) => c.id === f.criterio)!;
  const linhas = useMemo(() => {
    const n = norm(nome);
    return (r.data?.linhas ?? []).filter((l) => !n || norm(l.apelido).includes(n)).sort((a, b) => (valorCriterio(b, f.criterio) ?? -1e9) - (valorCriterio(a, f.criterio) ?? -1e9));
  }, [r.data, nome, f.criterio]);
  const passada = r.data?.passada;

  return (
    <Card className="p-3 sm:p-4">
      <SectionTitle
        title={passada ? `Ranking da rodada ${r.data?.rodada}: previsão × real` : "Ranking de oportunidades"}
        subtitle={`${criterio.nome}: ${criterio.explica}`}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <select className="input h-9 w-auto py-1 text-sm" value={f.criterio} onChange={(e) => set({ criterio: e.target.value as CriterioRanking })} aria-label="Ordenar por">
              {CRITERIOS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id === "scout" ? `${nomeScout(f.scout)} ${f.limiar}+` : c.nome}
                </option>
              ))}
            </select>
          </div>
        }
      />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input className="input sm:max-w-xs" placeholder="Filtrar por nome" value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Filtrar por nome" />
        {!passada && (
          <label className="flex items-center gap-2 text-sm text-[var(--color-ink-2)]">
            <input type="checkbox" checked={f.provaveis} onChange={(e) => set({ provaveis: e.target.checked })} className="h-4 w-4 accent-[var(--color-brand)]" />
            Só quem deve jogar (chance de 50%+)
          </label>
        )}
        <span className="text-xs text-[var(--color-ink-3)] sm:ml-auto">{r.isFetching ? "Calculando…" : r.data ? `${linhas.length} atletas · pontos "se entrar em campo"` : ""}</span>
      </div>
      {r.error && <ErrorBox error={r.error} retry={() => r.refetch()} />}
      {r.isLoading && <Skeleton className="h-80" />}
      {r.data && !linhas.length && <p className="py-8 text-center text-sm text-[var(--color-ink-3)]">Nenhum atleta com esses filtros. Tente outra posição, clube ou desmarque “só quem deve jogar”.</p>}
      {r.data && linhas.length > 0 && (
        <>
          {/* celular: cartões */}
          <ul className="space-y-2 md:hidden">
            {linhas.slice(0, qtd).map((l, i) => (
              <li key={l.atletaId}>
                <button type="button" onClick={() => onAtleta(l.atletaId)} className="w-full rounded-xl border border-[var(--color-line)] p-2.5 text-left hover:border-[var(--color-ink-3)]">
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-xs text-[var(--color-ink-3)] tabular">{i + 1}</span>
                    <PlayerPhoto p={{ apelido: l.apelido, posicaoId: l.posicaoId, atletaId: l.atletaId, clubeId: l.clubeId }} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{l.apelido}</div>
                      <div className="flex items-center gap-1 text-[11px] text-[var(--color-ink-3)]">
                        <PosBadge pos={l.posicaoId} /> <ClubBadge club={clubes[l.clubeId]} size={14} /> {l.casa ? "em casa" : "fora"} vs{" "}
                        <ClubBadge club={l.adversarioId ? clubes[l.adversarioId] : undefined} size={14} /> {l.adversarioId ? clubes[l.adversarioId]?.abreviacao : "—"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-display text-lg font-bold tabular">{mostrarCriterio(l, f.criterio)}</div>
                      <div className="text-[10px] text-[var(--color-ink-3)]">{f.criterio === "pontos" ? "pts proj." : criterio.nome.toLowerCase()}</div>
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-7 text-[11px] text-[var(--color-ink-2)]">
                    <span>
                      {nomeScout(f.scout)} {f.limiar}+: <b className="text-[var(--color-ink)]">{pctOuTraco(l.scout.p)}</b>
                    </span>
                    <span>{l.jogos} jogos</span>
                    <Confianca c={l.confianca} />
                    {passada && l.real && <span>real: {l.real.jogou ? `${fmt1(l.real.pontos)} pts · ${l.scout.real ?? 0} ${f.scout}` : "não jogou"}</span>}
                    {!passada && l.pJogar != null && <span>joga {pct(l.pJogar)}</span>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {/* computador: tabela */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left text-[11px] tracking-wide text-[var(--color-ink-3)] uppercase">
                  <th className="py-2 pr-2">#</th>
                  <th className="pr-2">Atleta</th>
                  <th className="pr-2">Confronto</th>
                  <th className="pr-2 text-right" title="Quantidade esperada do scout no próximo jogo (se entrar)">
                    {f.scout} esperado
                  </th>
                  <th className="pr-2 text-right" title={`Probabilidade estimada de ${f.limiar} ou mais`}>
                    P({f.limiar}+)
                  </th>
                  <th className="pr-2 text-right" title="Frequência histórica na amostra (o que aconteceu)">
                    Freq. hist.
                  </th>
                  <th className="pr-2 text-right">Pts proj.</th>
                  {f.criterio !== "pontos" && f.criterio !== "scout" && <th className="pr-2 text-right">{criterio.nome}</th>}
                  <th className="pr-2 text-right">Amostra</th>
                  <th className="pr-2">Confiança</th>
                  <th className="text-right">{passada ? "Real" : "Joga"}</th>
                </tr>
              </thead>
              <tbody>
                {linhas.slice(0, qtd).map((l, i) => (
                  <tr key={l.atletaId} className="cursor-pointer border-b border-[var(--color-line)] hover:bg-[var(--color-surface-1)]" onClick={() => onAtleta(l.atletaId)}>
                    <td className="py-1.5 pr-2 text-xs text-[var(--color-ink-3)] tabular">{i + 1}</td>
                    <td className="pr-2">
                      <div className="flex items-center gap-2">
                        <PlayerPhoto p={{ apelido: l.apelido, posicaoId: l.posicaoId, atletaId: l.atletaId, clubeId: l.clubeId }} size={28} />
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{l.apelido}</div>
                          <div className="flex items-center gap-1 text-[11px] text-[var(--color-ink-3)]">
                            <PosBadge pos={l.posicaoId} /> {clubes[l.clubeId]?.abreviacao}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="pr-2 text-xs text-[var(--color-ink-2)]">
                      <span className="flex items-center gap-1">
                        {l.casa ? "casa" : "fora"} vs <ClubBadge club={l.adversarioId ? clubes[l.adversarioId] : undefined} size={16} /> {l.adversarioId ? clubes[l.adversarioId]?.abreviacao : "—"}
                      </span>
                    </td>
                    <td className="pr-2 text-right tabular">{l.scout.lambda == null ? "—" : fmt2(l.scout.lambda)}</td>
                    <td className="pr-2 text-right font-semibold tabular">{pctOuTraco(l.scout.p)}</td>
                    <td className="pr-2 text-right text-[var(--color-ink-3)] tabular">{pctOuTraco(l.scout.freqHist)}</td>
                    <td className="pr-2 text-right font-semibold tabular">{fmt1(l.esperado)}</td>
                    {f.criterio !== "pontos" && f.criterio !== "scout" && <td className="pr-2 text-right font-semibold tabular">{mostrarCriterio(l, f.criterio)}</td>}
                    <td className="pr-2 text-right text-xs text-[var(--color-ink-3)] tabular">{l.jogos} j</td>
                    <td className="pr-2">
                      <Confianca c={l.confianca} />
                    </td>
                    <td className="text-right text-xs tabular">
                      {passada ? (
                        l.real?.jogou ? (
                          `${fmt1(l.real.pontos)} · ${l.scout.real ?? 0} ${f.scout}`
                        ) : (
                          <span className="text-[var(--color-ink-3)]">não jogou</span>
                        )
                      ) : l.pJogar != null ? (
                        pct(l.pJogar)
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {linhas.length > qtd && (
            <button type="button" className="btn btn-ghost mt-3 w-full justify-center text-sm" onClick={() => setQtd((n) => n + 60)}>
              Mostrar mais ({linhas.length - qtd})
            </button>
          )}
          <p className="mt-3 text-xs text-[var(--color-ink-3)]">
            P({f.limiar}+) é a probabilidade estimada pelo modelo; “Freq. hist.” é o que aconteceu na amostra. Uma frequência de 70% em 10 jogos não é garantia de 70% no próximo. Toque num atleta para
            ver a análise completa.
          </p>
        </>
      )}
    </Card>
  );
}

/* ---------------------------- ficha do atleta ---------------------------- */

function FichaAtleta({
  o,
  clubes,
  atletaId,
  comum,
  scout,
  limiar,
  onScout,
  onVoltar,
}: {
  o: CruzamentoOpcoes;
  clubes: Record<number, Club>;
  atletaId: number;
  comum: { temporada?: number; rodada: number; janela?: number; mando: FiltroMando };
  scout: CruzScout;
  limiar: number;
  onScout: (c: CruzScout) => void;
  onVoltar: () => void;
}) {
  const [adv, setAdv] = useState(0);
  const [mandoConf, setMandoConf] = useState<"real" | "casa" | "fora">("real");
  const params = { ...comum, atletaId, adversarioId: adv || undefined, mandoConfronto: mandoConf === "real" ? undefined : mandoConf };
  const q = useQuery({ queryKey: ["cruz-atleta", params], queryFn: () => fetchCruzamentoAtleta({ data: params }), placeholderData: keepPreviousData, staleTime: 5 * 60_000 });
  useEffect(() => window.scrollTo({ top: 0, behavior: "smooth" }), [atletaId]);
  const an = q.data;
  const voltar = (
    <button type="button" className="btn btn-ghost px-3 py-1.5 text-sm" onClick={onVoltar}>
      <ArrowLeft size={14} aria-hidden /> Ranking
    </button>
  );
  if (q.isLoading)
    return (
      <div className="space-y-3">
        {voltar}
        <Skeleton className="h-40" />
        <Skeleton className="h-72" />
      </div>
    );
  if (q.error || !an)
    return (
      <div className="space-y-3">
        {voltar}
        <ErrorBox error={q.error} retry={() => q.refetch()} />
      </div>
    );

  const sc = an.scouts.find((s) => s.codigo === scout) ?? an.scouts[0];
  const def = DEF_POR_CODIGO.get(sc.codigo)!;
  const lim = sc.projecao?.limiares.find((l) => l.k === limiar) ?? sc.projecao?.limiares[0];
  const conf = an.confronto;
  const nomeClube = (id?: number | null) => (id ? (clubes[id]?.abreviacao ?? `#${id}`) : "—");
  const principais = an.scouts.filter((s) => s.codigo !== "V" && (an.mediasPosicao[s.codigo] ?? 0) > 0.05).slice(0, 9);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {voltar}
        {q.isFetching && <span className="text-xs text-[var(--color-ink-3)]">Atualizando…</span>}
      </div>

      <Card className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-3">
          <PlayerPhoto p={{ apelido: an.atleta.apelido, posicaoId: an.atleta.posicaoId, atletaId: an.atleta.id, clubeId: an.atleta.clubeId }} size={56} />
          <div className="min-w-0 flex-1">
            <h2 className="font-display truncate text-xl font-extrabold">{an.atleta.apelido}</h2>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-ink-3)]">
              <PosBadge pos={an.atleta.posicaoId} />
              <ClubBadge club={clubes[an.atleta.clubeId]} size={16} /> {clubes[an.atleta.clubeId]?.nome}
              {o.atual && <StatusPill status={an.statusId} compact />}
              {an.pJogar != null && <span>· chance de jogar {pct(an.pJogar)}</span>}
            </div>
          </div>
          <div className="text-right text-xs text-[var(--color-ink-3)]">
            <div>
              Amostra: <b className="text-[var(--color-ink)]">{an.amostra.jogos} jogos</b>
              {an.amostra.rodadas ? ` (R${an.amostra.rodadas[0]}–R${an.amostra.rodadas[1]})` : ""}
            </div>
            <div>
              {an.amostra.janela ? `últimos ${an.amostra.janela}` : "temporada, com peso maior aos recentes"}
              {an.amostra.mando !== "todos" ? `, só ${an.amostra.mando === "casa" ? "em casa" : "fora"}` : ""}
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2 rounded-xl bg-[var(--color-surface-1)] p-2.5 sm:flex-row sm:items-center">
          <div className="flex-1 text-sm">
            {conf ? (
              <span className="flex flex-wrap items-center gap-1.5">
                Rodada {an.rodada}: {conf.casa ? "em casa" : "fora"} contra <ClubBadge club={clubes[conf.adversarioId]} size={18} />{" "}
                <b>{clubes[conf.adversarioId]?.nome ?? nomeClube(conf.adversarioId)}</b>
                {conf.hipotetico && <span className="rounded bg-[var(--color-gold)]/15 px-1.5 text-[10px] font-bold text-[var(--color-gold)]">confronto simulado</span>}
              </span>
            ) : (
              <span className="text-[var(--color-ink-3)]">Sem jogo do clube nesta rodada.</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <select className="input h-9 w-auto py-1 text-xs" value={adv} onChange={(e) => setAdv(Number(e.target.value))} aria-label="Simular contra outro adversário">
              <option value={0}>Adversário real</option>
              {o.clubes
                .filter((c) => c.id !== an.atleta.clubeId)
                .sort((x, y) => x.nome.localeCompare(y.nome))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    Simular vs {c.nome}
                  </option>
                ))}
            </select>
            <Seg
              label="Mando do confronto"
              value={mandoConf}
              onChange={setMandoConf}
              options={[
                { value: "real", label: "Mando real" },
                { value: "casa", label: "Casa" },
                { value: "fora", label: "Fora" },
              ]}
            />
          </div>
        </div>
        {an.passada && (
          <div className="mt-3">
            <Alert tone="info">
              A rodada {an.rodada} já foi jogada. Os números abaixo são o que o modelo diria <b>antes</b> do jogo (só com as rodadas anteriores), ao lado do que aconteceu:{" "}
              {an.real?.jogou ? (
                <b>
                  {fmt1(an.real.pontos)} pontos, {sc.real ?? 0} {def.nome.toLowerCase()}
                </b>
              ) : (
                <b>não entrou em campo</b>
              )}
              .
            </Alert>
          </div>
        )}
      </Card>

      {/* resumo do scout escolhido */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Resumo
          rotulo={`${def.nome}: projeção`}
          valor={sc.projecao ? fmt2(sc.projecao.lambda) : "—"}
          detalhe={
            sc.projecao
              ? sc.projecao.intervalo
                ? `faixa de 80%: ${fmt2(sc.projecao.intervalo[0])} a ${fmt2(sc.projecao.intervalo[1])} por jogo`
                : def.binario
                  ? "probabilidade, do placar esperado"
                  : "do placar esperado"
              : sc.semProjecao
          }
          tag="estimativa"
        />
        <Resumo
          rotulo={def.binario ? "Probabilidade" : `Chance de ${lim?.k ?? limiar}+`}
          valor={lim ? pct(lim.p) : "—"}
          detalhe={lim ? (lim.pBaixo != null && lim.pAlto != null ? `faixa de 80%: ${pct(lim.pBaixo)} a ${pct(lim.pAlto)}` : "sem faixa (vem do modelo de gols)") : sc.semProjecao}
          tag="probabilidade estimada"
          extra={<Confianca c={sc.projecao?.confianca} />}
        />
        <Resumo
          rotulo="Frequência histórica"
          valor={sc.hist.n ? `${sc.hist.jogosCom} de ${sc.hist.n}` : "—"}
          detalhe={sc.hist.n ? `${pct(sc.hist.freq)} dos jogos com 1+ · média ${fmt2(sc.hist.media)} · mediana ${fmt1(sc.hist.mediana)}` : "sem jogos na amostra"}
          tag="aconteceu"
        />
        <Resumo
          rotulo={conf ? `${nomeClube(conf.adversarioId)} cede à posição` : "Adversário"}
          valor={sc.adversario && sc.adversario.aparicoes ? fmt2(sc.adversario.cede) : "—"}
          detalhe={
            sc.adversario && sc.adversario.aparicoes
              ? `por atleta · liga ${fmt2(sc.adversario.liga)} · fator usado ×${fmt2(sc.adversario.fator)} (bruto ×${fmt2(sc.adversario.bruto)}, ${sc.adversario.jogos} jogos)`
              : def.doPlacar && an.gols
                ? `gols esperados: ${fmt2(an.gols.pro)} a favor, ${fmt2(an.gols.contra)} contra`
                : "sem dados do adversário"
          }
          tag="aconteceu"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-3 sm:p-4">
          <SectionTitle title={`${def.nome} por jogo`} subtitle="Histórico real da amostra, do mais antigo ao mais recente." />
          <BarrasPartidas
            nome={def.nome}
            media={sc.hist.media}
            jogos={an.partidas
              .filter((p) => (an.amostra.rodadas ? p.rodada >= an.amostra.rodadas[0] && p.rodada <= an.amostra.rodadas[1] : false))
              .filter((p) => an.amostra.mando === "todos" || p.casa === (an.amostra.mando === "casa"))
              .slice(0, an.amostra.jogos)
              .reverse()
              .map((p) => ({ rodada: p.rodada, valor: valorScout(p.scout, sc.codigo), adversario: nomeClube(p.opp), casa: p.casa }))}
          />
        </Card>
        <Card className="p-3 sm:p-4">
          <SectionTitle title="Jogador × adversário" subtitle="Na mesma régua: 1,0× é a média da posição na liga." />
          <IndiceComparativo
            linhas={principais
              .filter((s) => !DEF_POR_CODIGO.get(s.codigo)?.doPlacar)
              .map((s) => ({
                codigo: s.codigo,
                nome: nomeScout(s.codigo),
                jogador: s.hist.media,
                adversario: s.adversario?.aparicoes ? s.adversario.cede : null,
                posicao: an.mediasPosicao[s.codigo] ?? 0,
              }))}
          />
        </Card>
      </div>

      <Card className="p-3 sm:p-4">
        <SectionTitle title="Scouts detalhados" subtitle="Toque num scout para ver o gráfico e os cartões dele. Histórico à esquerda, projeção à direita." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-xs">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-left text-[10px] tracking-wide text-[var(--color-ink-3)] uppercase">
                <th className="py-2 pr-2">Scout</th>
                <th className="pr-2 text-right">Média</th>
                <th className="pr-2 text-right">Mediana</th>
                <th className="pr-2 text-right">Desvio</th>
                <th className="pr-2 text-right">Jogos 1+</th>
                <th className="pr-2 text-right">Últ. 5</th>
                <th className="pr-2 text-right">Casa · Fora</th>
                <th className="pr-2 text-right" title="Média contra adversários que cedem esse scout num nível parecido com o do próximo">
                  Perfil parecido
                </th>
                <th className="border-l border-[var(--color-line)] pr-2 pl-2 text-right">Adv. cede</th>
                <th className="pr-2 text-right">Estimativa</th>
                <th className="pr-2 text-right">Probabilidades</th>
                <th className="pr-2">Confiança</th>
                {an.passada && <th className="text-right">Real</th>}
              </tr>
            </thead>
            <tbody>
              {an.scouts.map((s) => {
                const d = DEF_POR_CODIGO.get(s.codigo)!;
                const ativo = s.codigo === sc.codigo;
                return (
                  <tr
                    key={s.codigo}
                    className={`cursor-pointer border-b border-[var(--color-line)] ${ativo ? "bg-[var(--color-brand)]/10" : "hover:bg-[var(--color-surface-1)]"}`}
                    onClick={() => onScout(s.codigo)}
                  >
                    <td className="py-1.5 pr-2">
                      <span className="font-semibold">{d.nome}</span> <span className="text-[var(--color-ink-3)]">{s.codigo}</span>
                    </td>
                    <td className="pr-2 text-right tabular">{fmt2(s.hist.media)}</td>
                    <td className="pr-2 text-right tabular">{fmt1(s.hist.mediana)}</td>
                    <td className="pr-2 text-right tabular">{fmt2(s.hist.desvio)}</td>
                    <td className="pr-2 text-right tabular">{s.hist.n ? `${s.hist.jogosCom}/${s.hist.n}` : "—"}</td>
                    <td className="pr-2 text-right tabular">
                      {fmt2(s.hist.recente.media)}
                      {s.hist.tendencia && s.hist.tendencia.rotulo !== "estavel" && (
                        <span
                          className={`ml-1 ${s.hist.tendencia.rotulo === "alta" ? "text-[var(--color-good-ink)]" : "text-[var(--color-critical-ink)]"}`}
                          title={`Últimos 5 jogos ${s.hist.tendencia.rotulo === "alta" ? "acima" : "abaixo"} dos anteriores além do acaso (teste binomial exato, p = ${fmt2(s.hist.tendencia.p)})`}
                        >
                          {s.hist.tendencia.rotulo === "alta" ? "▲" : "▼"}
                        </span>
                      )}
                    </td>
                    <td className="pr-2 text-right tabular">
                      {s.hist.casa.n ? fmt2(s.hist.casa.media) : "—"} · {s.hist.fora.n ? fmt2(s.hist.fora.media) : "—"}
                    </td>
                    <td className="pr-2 text-right tabular" title={s.hist.perfil ? `${s.hist.perfil.faixa}: ${s.hist.perfil.n} jogos` : undefined}>
                      {s.hist.perfil && s.hist.perfil.n ? `${fmt2(s.hist.perfil.media)} (${s.hist.perfil.n})` : "—"}
                    </td>
                    <td className="border-l border-[var(--color-line)] pr-2 pl-2 text-right tabular">
                      {s.adversario && s.adversario.aparicoes ? `${fmt2(s.adversario.cede)} ×${fmt2(s.adversario.fator)}` : "—"}
                    </td>
                    <td className="pr-2 text-right font-semibold tabular">{s.projecao ? (d.binario ? pct(s.projecao.lambda) : fmt2(s.projecao.lambda)) : "—"}</td>
                    <td className="pr-2 text-right tabular">
                      {s.projecao ? (
                        s.projecao.limiares.map((l) => `${d.binario ? "" : `${l.k}+ `}${pct(l.p)}`).join(" · ")
                      ) : (
                        <span className="text-[var(--color-ink-3)]">{s.zero ? "nunca ocorreu" : "sem amostra"}</span>
                      )}
                    </td>
                    <td className="pr-2">
                      <Confianca c={s.projecao?.confianca} />
                    </td>
                    {an.passada && <td className="text-right font-semibold tabular">{an.real?.jogou ? (s.real ?? 0) : "—"}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {def.nota && <p className="mt-2 text-xs text-[var(--color-ink-3)]">{def.nota}</p>}
      </Card>

      <ProjecaoPontos an={an} />

      <Card className="p-3 sm:p-4">
        <SectionTitle title="Histórico por partida" subtitle={`Todos os jogos de ${an.atleta.apelido} na temporada até a rodada ${an.rodada - 1}. Fonte: pontuação oficial do Cartola.`} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-left text-[10px] tracking-wide text-[var(--color-ink-3)] uppercase">
                <th className="py-2 pr-2">Rodada</th>
                <th className="pr-2">Adversário</th>
                <th className="pr-2">Placar</th>
                <th className="pr-2 text-right">Pontos</th>
                <th className="pr-2 text-right">{sc.codigo}</th>
                <th>Scouts</th>
              </tr>
            </thead>
            <tbody>
              {an.partidas.map((p) => (
                <tr key={p.rodada} className="border-b border-[var(--color-line)]">
                  <td className="py-1.5 pr-2 tabular">R{p.rodada}</td>
                  <td className="pr-2">
                    <span className="flex items-center gap-1">
                      {p.casa ? "casa" : "fora"} vs <ClubBadge club={clubes[p.opp]} size={14} /> {nomeClube(p.opp)}
                    </span>
                  </td>
                  <td className="pr-2 tabular">{p.golsPro != null ? `${p.golsPro} × ${p.golsContra}` : "—"}</td>
                  <td className={`pr-2 text-right font-semibold tabular ${p.pontos < 0 ? "text-[var(--color-critical-ink)]" : ""}`}>{fmt1(p.pontos)}</td>
                  <td className="pr-2 text-right font-semibold tabular">{valorScout(p.scout, sc.codigo)}</td>
                  <td className="text-[var(--color-ink-3)]">
                    {Object.entries(p.scout)
                      .filter(([, v]) => v)
                      .map(([k, v]) => `${k} ${v}`)
                      .join(" · ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <MetodoAtleta an={an} sc={sc} />
    </div>
  );
}

function Resumo({ rotulo, valor, detalhe, tag, extra }: { rotulo: string; valor: string; detalhe?: string; tag: "estimativa" | "probabilidade estimada" | "aconteceu"; extra?: ReactNode }) {
  return (
    <div className="card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-semibold tracking-wide text-[var(--color-ink-3)] uppercase">{rotulo}</span>
        <span
          className={`shrink-0 rounded px-1.5 text-[10px] font-bold ${tag === "aconteceu" ? "bg-[var(--color-surface-1)] text-[var(--color-ink-2)]" : "bg-[var(--color-brand)]/15 text-[var(--color-brand)]"}`}
        >
          {tag}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="font-display text-2xl font-bold tabular">{valor}</span>
        {extra}
      </div>
      {detalhe && <div className="mt-0.5 text-xs text-[var(--color-ink-3)]">{detalhe}</div>}
    </div>
  );
}

function ProjecaoPontos({ an }: { an: CruzamentoAtleta }) {
  const p = an.pontos;
  const positivos = p?.contribuicoes.filter((c) => c.pontos > 0.05).slice(0, 5) ?? [];
  const riscos = p?.contribuicoes.filter((c) => c.pontos < -0.02).sort((a, b) => a.pontos - b.pontos) ?? [];
  const maxPos = Math.max(0.1, ...positivos.map((c) => c.pontos));
  return (
    <Card className="p-3 sm:p-4">
      <SectionTitle
        title="Projeção de pontuação"
        subtitle="Se entrar em campo. Scouts projetados × tabela vigente; gols, assistências, SG e gols sofridos saem do mesmo placar simulado (não são somados como se fossem independentes)."
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Dado k="Média na temporada" v={an.pontosHist.media == null ? "—" : `${fmt1(an.pontosHist.media)} pts (${an.pontosHist.n} jogos)`} />
        <Dado k="Média dos últimos 5" v={an.pontosHist.recente == null ? "—" : `${fmt1(an.pontosHist.recente)} pts`} />
        <Dado k="Acima da mediana da posição" v={an.pontosHist.regularidade == null ? "—" : `${pct(an.pontosHist.regularidade)} dos jogos da amostra`} />
      </div>
      {!p ? (
        <div className="mt-3">
          <Alert tone="info">{an.semPontos}</Alert>
          {an.gols && an.atleta.posicaoId === 6 && (
            <p className="mt-2 text-sm text-[var(--color-ink-2)]">
              Chance de vitória do time (modelo de gols): <b>{pct(an.gols.pVitoria)}</b>.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
              <div>
                <div className="text-[11px] font-semibold tracking-wide text-[var(--color-ink-3)] uppercase">Projetada (média)</div>
                <div className="font-display text-3xl font-extrabold tabular">{fmt1(p.esperado)}</div>
                <div className="text-xs text-[var(--color-ink-3)]">desvio ±{fmt1(p.desvio)}</div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                {(
                  [
                    ["Conservador", p.p20, "20%"],
                    ["Central", p.p50, "50%"],
                    ["Favorável", p.p80, "80%"],
                  ] as const
                ).map(([n, v, q]) => (
                  <div key={n}>
                    <div className="text-[10px] font-semibold text-[var(--color-ink-3)] uppercase">{n}</div>
                    <div className="font-display text-lg font-bold tabular">{fmt1(v)}</div>
                    <div className="text-[10px] text-[var(--color-ink-3)]">{q} dos jogos abaixo</div>
                  </div>
                ))}
              </div>
            </div>
            {p.p20 != null && p.p50 != null && p.p80 != null && <FaixaCenarios p20={p.p20} p50={p.p50} p80={p.p80} esperado={p.esperado} />}
            <div className="flex flex-wrap gap-2 text-xs text-[var(--color-ink-2)]">
              <span className="rounded-lg bg-[var(--color-surface-1)] px-2 py-1">negativo: {pctOuTraco(p.pNegativo)}</span>
              {p.pAcima &&
                ([5, 8, 12] as const).map((k) => (
                  <span key={k} className="rounded-lg bg-[var(--color-surface-1)] px-2 py-1">
                    {k}+ pts: {pct(p.pAcima![k])}
                  </span>
                ))}
            </div>
            <p className="mt-2 text-[11px] text-[var(--color-ink-3)]">{p.simulacoes.toLocaleString("pt-BR")} jogos simulados. É estatística, não garantia.</p>
          </div>
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-[11px] font-semibold tracking-wide text-[var(--color-ink-3)] uppercase">Scouts que mais somam</div>
              <ul className="space-y-1">
                {positivos.map((c) => (
                  <li key={c.codigo} className="grid grid-cols-[110px_1fr_auto] items-center gap-2 text-xs">
                    <span className="truncate">{nomeScout(c.codigo)}</span>
                    <span className="h-2 rounded-r-[4px] bg-[#e8641f]" style={{ width: `${(c.pontos / maxPos) * 100}%` }} />
                    <span className="tabular">
                      +{fmt2(c.pontos)} <span className="text-[var(--color-ink-3)]">({c.pAoMenosUm != null ? `1+: ${pct(c.pAoMenosUm)}` : ""})</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold tracking-wide text-[var(--color-ink-3)] uppercase">Riscos de pontos negativos</div>
              <ul className="space-y-1 text-xs">
                {riscos.slice(0, 5).map((c) => (
                  <li key={c.codigo} className="flex items-center justify-between gap-2">
                    <span>{nomeScout(c.codigo)}</span>
                    <span className="tabular text-[var(--color-ink-2)]">
                      chance de 1+: <b className="text-[var(--color-ink)]">{pctOuTraco(c.pAoMenosUm)}</b> · {fmt2(c.pontos)} pts na média
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function MetodoAtleta({ an, sc }: { an: CruzamentoAtleta; sc: CruzamentoAtleta["scouts"][number] }) {
  const pr = sc.projecao;
  const c = pr?.componentes;
  return (
    <Card className="p-3 sm:p-4">
      <details>
        <summary className="cursor-pointer text-sm font-semibold">Como chegamos a esse número ({nomeScout(sc.codigo)})</summary>
        <div className="mt-3 space-y-2 text-sm text-[var(--color-ink-2)]">
          {!pr && <p>{sc.semProjecao ?? "Sem projeção para este scout."}</p>}
          {pr && pr.metodo === "taxa" && c && (
            <>
              <p className="rounded-lg bg-[var(--color-surface-1)] p-2 font-mono text-xs">
                estimativa = taxa do atleta × fator do adversário × fator de mando = {fmt2(c.taxaJogador)} × {fmt2(c.fatorAdversario)} × {fmt2(c.fatorMando)} = <b>{fmt2(pr.lambda)}</b>
              </p>
              <ul className="list-disc space-y-1 pl-5 text-xs">
                <li>
                  <b>Taxa do atleta {fmt2(c.taxaJogador)}</b>: média dele ({fmt2(sc.hist.media)} em {sc.hist.n} jogos) combinada com a média da posição ({fmt2(c.mediaPosicao)}). Os jogos dele valem{" "}
                  {fmt1(c.pesoDados)} “jogos de informação” e a média da posição vale {fmt1(c.pesoPrior)}: esse peso vem da variação real entre atletas da posição (quanto mais parecidos, mais uma
                  amostra pequena é puxada para a média).
                  {an.meiaVida != null && an.amostra.janela == null ? ` Jogos recentes pesam mais: um jogo de ${an.meiaVida} partidas atrás vale metade do último.` : ""}
                  {an.meiaVida == null && an.amostra.janela == null ? " Todos os jogos da temporada pesam igual (a conferência fora da amostra não mostrou ganho com peso de recência)." : ""}
                </li>
                <li>
                  <b>Fator do adversário ×{fmt2(c.fatorAdversario)}</b>:{" "}
                  {sc.adversario?.aparicoes
                    ? `ele cedeu ${fmt2(sc.adversario.cede)} por atleta da posição contra ${fmt2(sc.adversario.liga)} da liga (×${fmt2(sc.adversario.bruto)} bruto, em ${sc.adversario.jogos} jogos). Usamos ${pct(sc.adversario.peso)} desse desvio: o resto é tratado como ruído, pela variação real entre os 20 times.`
                    : "sem jogos do adversário na amostra: fator neutro."}
                </li>
                <li>
                  <b>Fator de mando ×{fmt2(c.fatorMando)}</b>: média da posição jogando {an.confronto?.casa ? "em casa" : "fora"} ÷ média da posição na amostra usada.
                </li>
                <li>
                  <b>Probabilidades</b>: binomial negativa com média {fmt2(pr.lambda)} e a irregularidade dos jogos da posição
                  {c.dispersao != null ? ` (dispersão ${fmt1(c.dispersao)})` : " (sem excesso: Poisson)"} somada à incerteza da própria taxa. A faixa de 80% usa os limites da taxa estimada.
                </li>
              </ul>
            </>
          )}
          {pr && pr.metodo === "placar" && c && (
            <p className="text-xs">
              Vem do placar esperado: {fmt2(c.golsPro)} gols a favor e {fmt2(c.golsContra)} contra (ataque e defesa de cada time pelos gols da temporada, encolhidos para a média pelo ruído, e o
              mando).
              {sc.codigo === "SG" && c.qSG != null ? ` Chance de não sofrer gol × ${pct(c.qSG)} (parte dos jogos sem gol sofrido em que ele recebeu o SG).` : ""}
            </p>
          )}
          <p className="text-xs text-[var(--color-ink-3)]">
            Gerado {an.geradoEm ? dateTime(an.geradoEm) : ""} com os dados até a rodada {an.rodada - 1}.
          </p>
        </div>
      </details>
    </Card>
  );
}

/* ------------------------------ metodologia ------------------------------ */

function Metodologia({ o }: { o: CruzamentoOpcoes }) {
  const cal = o.calibracao;
  return (
    <Card className="p-3 sm:p-4">
      <details>
        <summary className="cursor-pointer text-sm font-semibold">Metodologia, conferência do modelo e cadastro de scouts</summary>
        <div className="mt-3 space-y-4 text-sm text-[var(--color-ink-2)]">
          <section className="space-y-1.5">
            <h3 className="font-semibold text-[var(--color-ink)]">De onde vêm os dados</h3>
            <p>
              Tudo vem da pontuação oficial do Cartola: <code>/atletas/pontuados/{"{rodada}"}</code> traz os scouts de cada atleta que entrou em campo em cada rodada encerrada, e{" "}
              <code>/partidas/{"{rodada}"}</code> traz adversário, mando e placar. As rodadas ficam guardadas no banco do site (sem duplicar; correções da fonte viram revisão registrada). Parciais
              nunca entram. A API não publica minutos jogados, então tudo é por partida.
            </p>
          </section>
          <section className="space-y-1.5">
            <h3 className="font-semibold text-[var(--color-ink)]">Como a projeção é feita</h3>
            <p className="rounded-lg bg-[var(--color-surface-1)] p-2 font-mono text-xs">estimativa = taxa do atleta × fator do adversário × fator de mando</p>
            <ul className="list-disc space-y-1 pl-5 text-xs">
              <li>
                <b>Taxa do atleta</b> (Gama-Poisson com Bayes empírico): a média dele é combinada com a média da posição; o peso da média da posição sai da variação real entre atletas, não de um
                número escolhido. Scouts irregulares informam menos por jogo (razão média/variância).
              </li>
              <li>
                <b>Recência</b>: na temporada inteira, jogos recentes pesam mais.{" "}
                {cal.rodadas
                  ? cal.meiaVida == null
                    ? "A conferência abaixo escolheu peso igual para todos os jogos (nenhuma meia-vida melhorou as previsões)."
                    : `A meia-vida (${cal.meiaVida} jogos) foi escolhida pela conferência abaixo, entre ${cal.candidatos.map((c) => (c.meiaVida == null ? "sem peso" : c.meiaVida)).join(", ")}.`
                  : "Ainda sem rodadas para conferir: meia-vida padrão de 8 jogos."}
              </li>
              <li>
                <b>Fator do adversário</b>: o que ele cedeu à posição por atuação ÷ média da liga, puxado para 1 na proporção do ruído (Bayes empírico entre os 20 times). Laterais usam o lado (LE/LD)
                quando há amostra.
              </li>
              <li>
                <b>Probabilidades</b>: binomial negativa (Poisson-Gama), com a irregularidade dos jogos da posição e a incerteza da própria taxa. SG, gols sofridos e vitória vêm de um modelo de gols
                de Poisson (ataque × defesa × mando).
              </li>
              <li>
                <b>Pontuação</b>: média e desvio exatos; cenários (20%, 50%, 80%) de jogos simulados em que gols, assistências, SG e gols sofridos saem do mesmo placar. Os demais scouts são sorteados
                independentes dado o jogo (limitação declarada).
              </li>
              <li>
                <b>Limitações</b>: sem minutos jogados; o fator do adversário não desconta a força dos adversários que o atleta já enfrentou; a incerteza do fator do adversário não entra na faixa de
                80%; mudanças de técnico ou esquema só aparecem depois de alguns jogos.
              </li>
            </ul>
          </section>
          <section className="space-y-1.5">
            <h3 className="font-semibold text-[var(--color-ink)]">Conferência fora da amostra</h3>
            {cal.rodadas ? (
              <>
                <p className="text-xs">
                  Para cada rodada de {cal.rodadas[0]} a {cal.rodadas[1]}, o modelo viu só as rodadas anteriores e previu a chance de cada scout para quem entrou em campo. São{" "}
                  {cal.previsoes.toLocaleString("pt-BR")} previsões comparadas com o que aconteceu.
                </p>
                <div className="grid gap-4 lg:grid-cols-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[10px] text-[var(--color-ink-3)] uppercase">
                        <th className="py-1">Quando o modelo disse</th>
                        <th className="text-right">Aconteceu</th>
                        <th className="text-right">Previsões</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cal.faixas.map((x) => (
                        <tr key={x.de} className="border-t border-[var(--color-line)]">
                          <td className="py-1 tabular">
                            {pct(x.de)}–{pct(x.ate)} (média {pct(x.previsto, 1)})
                          </td>
                          <td className="text-right font-semibold tabular">{pct(x.observado, 1)}</td>
                          <td className="text-right text-[var(--color-ink-3)] tabular">{x.n.toLocaleString("pt-BR")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[10px] text-[var(--color-ink-3)] uppercase">
                        <th className="py-1">Evento</th>
                        <th className="text-right">Previsto</th>
                        <th className="text-right">Real</th>
                        <th className="text-right" title="1 − Brier do modelo ÷ Brier da frequência da posição. Positivo = melhor que usar só a média da posição.">
                          Ganho
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {cal.porScout.map((x) => (
                        <tr key={`${x.codigo}${x.limiar}`} className="border-t border-[var(--color-line)]">
                          <td className="py-1">
                            {nomeScout(x.codigo)} {DEF_POR_CODIGO.get(x.codigo)?.binario ? "" : `${x.limiar}+`}
                          </td>
                          <td className="text-right tabular">{pct(x.previsto, 1)}</td>
                          <td className="text-right tabular">{pct(x.observado, 1)}</td>
                          <td className={`text-right tabular ${x.habilidade > 0 ? "text-[var(--color-good-ink)]" : "text-[var(--color-ink-3)]"}`}>
                            {x.habilidade > 0 ? "+" : ""}
                            {pct(x.habilidade, 1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-xs">Ainda não há rodadas suficientes (a conferência começa na rodada 6).</p>
            )}
          </section>
          <section className="space-y-1.5">
            <h3 className="font-semibold text-[var(--color-ink)]">Cadastro de scouts e pontuação vigente</h3>
            <p className="text-xs">
              Cada valor é conferido contra a pontuação oficial desta temporada: os pontos de cada atuação são recalculados pelos scouts e comparados com os oficiais. Se um scout diverge, vale o valor
              que os dados oficiais indicam.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-xs">
                <thead>
                  <tr className="text-left text-[10px] text-[var(--color-ink-3)] uppercase">
                    <th className="py-1 pr-2">Código</th>
                    <th className="pr-2">Scout</th>
                    <th className="pr-2">Categoria</th>
                    <th className="pr-2">Posições</th>
                    <th className="pr-2 text-right">Tabela</th>
                    <th className="pr-2 text-right">Vigente</th>
                    <th>Conferência</th>
                  </tr>
                </thead>
                <tbody>
                  {SCOUT_DEFS.map((d) => {
                    const c = o.conferencia.find((x) => x.codigo === d.codigo);
                    return (
                      <tr key={d.codigo} className="border-t border-[var(--color-line)] align-top">
                        <td className="py-1 pr-2 font-mono">{d.codigo}</td>
                        <td className="pr-2" title={d.descricao}>
                          {d.nome}
                          {d.nota && <span className="block text-[10px] text-[var(--color-ink-3)]">{d.nota}</span>}
                          {d.partes && <span className="block text-[10px] text-[var(--color-ink-3)]">soma de {d.partes.join(" + ")}</span>}
                        </td>
                        <td className="pr-2">{d.categoria}</td>
                        <td className="pr-2">{d.posicoes.map((p) => POSITIONS[p].abbr).join(", ")}</td>
                        <td className="pr-2 text-right tabular">{d.pontos == null ? "—" : fmt1(d.pontos)}</td>
                        <td className="pr-2 text-right font-semibold tabular">{c ? fmt1(c.vigente) : d.pontos == null ? "—" : fmt1(d.pontos)}</td>
                        <td>
                          {c ? (
                            <span className={c.estado === "conferido" ? "text-[var(--color-good-ink)]" : c.estado === "divergente" ? "text-[var(--color-warning)]" : "text-[var(--color-ink-3)]"}>
                              {c.estado === "conferido"
                                ? `conferido (${c.batem}/${c.atuacoes})`
                                : c.estado === "divergente"
                                  ? `diverge: dados oficiais indicam ${fmt1(c.estimado ?? c.vigente)}`
                                  : c.estado === "nao-confirmado"
                                    ? `não confirmado (${c.batem}/${c.atuacoes})`
                                    : c.estado === "pouca-amostra"
                                      ? `pouca amostra (${c.atuacoes})`
                                      : "sem ocorrências"}
                            </span>
                          ) : (
                            <span className="text-[var(--color-ink-3)]">{d.partes ? "soma de scouts conferidos" : "regra do técnico"}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </details>
    </Card>
  );
}
