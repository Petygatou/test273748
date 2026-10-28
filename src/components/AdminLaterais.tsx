import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, CheckCircle2, RefreshCw, RotateCcw, Search, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { LadoLateral, RoundAnalysis } from "../engine/types";
import { pct, timeAgo } from "../lib/format";
import { analysisQuery } from "../lib/queries";
import { norm } from "../lib/search";
import { atualizarLadosAuto, fetchLadosAuto, saveLadoLateral } from "../server/fns";
import type { LadoAuto, ResumoLados } from "../server/ladosAuto";
import { Alert, Card, ClubBadge, PlayerPhoto, SectionTitle, Seg, StatusPill } from "./ui";

type Filtro = "todos" | "sem" | "manual" | "ambos" | "diverge";
const LADOS_KEY = ["admin-lados"] as const;
const sigla = (l: LadoLateral) => (l === "E" ? "LE" : "LD");

/** De onde veio e quantos jogos sustentam o lado descoberto. */
function evidencia(auto: LadoAuto | null): string {
  if (!auto) return "Ainda sem jogo lido como lateral";
  const partes: string[] = [];
  const conta = (c: Record<LadoLateral, number>) =>
    [c.E ? `LE ${c.E}×` : "", c.D ? `LD ${c.D}×` : ""].filter(Boolean).join(" · ");
  if (auto.jogosAtual) partes.push(`nesta temporada: ${conta(auto.atual)}`);
  if (auto.jogosAnteriores) partes.push(`${auto.temporadasAnteriores.sort().join("/")}: ${conta(auto.anterior)}`);
  return partes.join(" — ");
}

function nomeFonte(f: "espn" | "apifootball") {
  return f === "espn" ? "ESPN" : "API-Football";
}

/**
 * Painel ADM → Laterais: o Cartola só diz "lateral". O site lê a escalação de cada jogo
 * (ESPN e API-Football) e descobre sozinho o lado de cada um; aqui a equipe acompanha as
 * fontes e, se precisar, corrige à mão.
 */
export function AdminLaterais({ a }: { a: RoundAnalysis }) {
  const qc = useQueryClient();
  const resumoQ = useQuery({ queryKey: LADOS_KEY, queryFn: () => fetchLadosAuto(), refetchInterval: 60_000 });
  const resumo = resumoQ.data;
  // correções feitas nesta tela (aparecem na hora, antes da análise ser refeita)
  const [local, setLocal] = useState<Record<number, LadoLateral | null>>({});
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const laterais = a.players.filter((p) => p.posicaoId === 2);

  const info = (id: number, ladoBase?: LadoLateral) => {
    const r = resumo?.porAtleta[id];
    const manual = id in local ? local[id] : (r?.manual ?? null);
    const auto = r?.auto ?? null;
    const efetivo: LadoLateral | null = manual ?? auto?.lado ?? (resumo ? null : (ladoBase ?? null));
    return { manual, auto, efetivo, diverge: Boolean(manual && auto?.lado && manual !== auto.lado) };
  };

  const contagem = useMemo(() => {
    let comLado = 0,
      automaticos = 0,
      manuais = 0,
      semDados = 0,
      ambos = 0,
      diverge = 0;
    for (const p of laterais) {
      const x = info(p.atletaId, p.lado);
      if (x.efetivo) comLado++;
      if (x.manual) manuais++;
      else if (x.auto?.lado) automaticos++;
      if (!x.auto) semDados++;
      if (x.auto?.ambos && !x.manual) ambos++;
      if (x.diverge) diverge++;
    }
    return { comLado, automaticos, manuais, semDados, ambos, diverge };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laterais, resumo, local]);

  const grupos = useMemo(() => {
    const n = norm(busca);
    const porClube = new Map<number, typeof laterais>();
    for (const p of laterais) {
      const x = info(p.atletaId, p.lado);
      if (filtro === "sem" && x.efetivo) continue;
      if (filtro === "manual" && !x.manual) continue;
      if (filtro === "ambos" && !(x.auto?.ambos && !x.manual)) continue;
      if (filtro === "diverge" && !x.diverge) continue;
      if (n && !norm(p.apelido).includes(n) && !norm(a.clubs[p.clubeId]?.nome ?? "").includes(n)) continue;
      porClube.set(p.clubeId, [...(porClube.get(p.clubeId) ?? []), p]);
    }
    return [...porClube.entries()]
      .map(([clubeId, ps]) => ({ clubeId, ps: ps.sort((x, y) => y.pJogar - x.pJogar) }))
      .sort((x, y) => (a.clubs[x.clubeId]?.nome ?? "").localeCompare(a.clubs[y.clubeId]?.nome ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laterais, filtro, busca, local, resumo]);

  const recalcularDepois = () => setTimeout(() => void qc.invalidateQueries({ queryKey: analysisQuery.queryKey }), 7000);

  const corrigir = async (atletaId: number, manualAtual: LadoLateral | null, lado: LadoLateral | null) => {
    const novo = lado && manualAtual === lado ? null : lado; // tocar de novo no lado corrigido volta ao automático
    setLocal((l) => ({ ...l, [atletaId]: novo }));
    setErro(null);
    try {
      await saveLadoLateral({ data: { atletaId, lado: novo } });
    } catch (e) {
      setLocal((l) => ({ ...l, [atletaId]: manualAtual }));
      setErro(e instanceof Error ? e.message : "Falha ao salvar");
      return;
    }
    void qc.invalidateQueries({ queryKey: LADOS_KEY });
    recalcularDepois();
  };

  /** Lê as escalações que faltam: o servidor trabalha uns segundos por vez e a tela repete até acabar. */
  const atualizar = async () => {
    setAtualizando(true);
    setErro(null);
    try {
      let antes = Infinity;
      let parado = 0;
      for (let i = 0; i < 40; i++) {
        const r = await atualizarLadosAuto();
        qc.setQueryData(LADOS_KEY, r.resumo);
        const pend = r.resumo.espn.pendentes;
        if (!pend || r.resumo.espn.erro) break;
        parado = pend < antes ? 0 : parado + 1;
        if (parado >= 2) break;
        antes = pend;
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao atualizar");
    } finally {
      setAtualizando(false);
      recalcularDepois();
    }
  };

  return (
    <div className="space-y-4">
      <Fontes resumo={resumo} carregando={resumoQ.isLoading} atualizando={atualizando} onAtualizar={atualizar} />

      <Card className="p-3 sm:p-4">
        <SectionTitle
          title="Lado de cada lateral"
          subtitle="Descoberto sozinho pelas escalações. Toque em LE ou LD só para corrigir; tocar de novo volta ao automático."
          icon={<ArrowLeftRight size={18} className="text-[var(--color-brand)]" />}
        />
        <div className="mb-3">
          <div className="flex justify-between text-xs text-[var(--color-ink-3)]">
            <span>
              <b className="text-[var(--color-ink)]">{contagem.comLado}</b> de {laterais.length} laterais com lado · {contagem.automaticos} automáticos · {contagem.manuais} corrigidos à mão
            </span>
            <span className="tabular">{laterais.length ? Math.round((contagem.comLado / laterais.length) * 100) : 0}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-1)]">
            <div className="h-full rounded-full bg-[var(--color-brand)] transition-[width]" style={{ width: `${laterais.length ? (contagem.comLado / laterais.length) * 100 : 0}%` }} />
          </div>
          {resumo?.ligado && contagem.semDados > 0 && (
            <p className="mt-1 text-[11px] text-[var(--color-ink-3)]">
              {contagem.semDados} ainda sem jogo lido como lateral (não entraram em campo nos jogos lidos). Eles não mexem na cedência; ganham lado assim que jogarem.
            </p>
          )}
        </div>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-ink-3)]" aria-hidden />
            <input className="input pl-9" placeholder="Buscar lateral ou clube" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar lateral" />
          </div>
          <Seg
            label="Filtro"
            value={filtro}
            onChange={setFiltro}
            options={[
              { value: "todos", label: "Todos" },
              { value: "sem", label: `Sem lado (${laterais.length - contagem.comLado})` },
              { value: "ambos", label: `Dois lados (${contagem.ambos})` },
              { value: "manual", label: `Corrigidos (${contagem.manuais})` },
              { value: "diverge", label: `Divergem (${contagem.diverge})` },
            ]}
          />
        </div>
        {erro && (
          <div className="mb-2">
            <Alert tone="critical">{erro}</Alert>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {grupos.map(({ clubeId, ps }) => (
            <div key={clubeId} className="rounded-xl border border-[var(--color-line)]">
              <div className="flex items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-surface-1)] px-3 py-2 text-sm font-semibold">
                <ClubBadge club={a.clubs[clubeId]} size={18} /> {a.clubs[clubeId]?.nome}
              </div>
              <ul className="divide-y divide-[var(--color-line)]">
                {ps.map((p) => {
                  const x = info(p.atletaId, p.lado);
                  return (
                    <li key={p.atletaId} className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <PlayerPhoto p={p} size={30} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 truncate text-sm font-semibold">
                            {p.apelido}
                            {x.manual ? (
                              <span className="rounded bg-[var(--color-gold)]/15 px-1 text-[10px] font-bold text-[var(--color-gold)]">corrigido</span>
                            ) : x.auto?.ambos ? (
                              <span className="rounded bg-[var(--color-warning)]/15 px-1 text-[10px] font-bold text-[var(--color-warning)]">dois lados</span>
                            ) : x.auto?.lado ? (
                              <span className="inline-flex items-center gap-0.5 rounded bg-[var(--color-good)]/15 px-1 text-[10px] font-bold text-[var(--color-good-ink)]" title="Descoberto pelas escalações">
                                <Wand2 size={10} aria-hidden /> auto
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-ink-3)]">
                            <StatusPill status={p.statusId} compact /> joga {pct(p.pJogar)}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1" role="group" aria-label={`Lado de ${p.apelido}`}>
                          {(["E", "D"] as const).map((l) => (
                            <button
                              key={l}
                              type="button"
                              onClick={() => corrigir(p.atletaId, x.manual, l)}
                              aria-pressed={x.efetivo === l}
                              title={x.manual === l ? "Voltar ao automático" : `Corrigir para ${l === "E" ? "lateral esquerdo" : "lateral direito"}`}
                              className={`h-8 w-11 rounded-lg border text-xs font-bold transition-colors ${
                                x.efetivo === l
                                  ? x.manual
                                    ? "border-[var(--color-gold)] bg-[var(--color-gold)] text-[#1a1400]"
                                    : "border-[var(--color-brand)] bg-[var(--color-brand)] text-[#1a0a00]"
                                  : "border-[var(--color-line)] text-[var(--color-ink-3)] hover:border-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
                              }`}
                            >
                              {sigla(l)}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="mt-1 pl-[38px] text-[11px] leading-snug text-[var(--color-ink-3)]">
                        {evidencia(x.auto)}
                        {x.auto?.ultimo && (
                          <span className="block truncate" title={x.auto.ultimo.posicao}>
                            Último: {x.auto.ultimo.rodada ? `rodada ${x.auto.ultimo.rodada}` : x.auto.ultimo.temporada} · {x.auto.ultimo.posicao} ({nomeFonte(x.auto.ultimo.fonte)})
                          </span>
                        )}
                        {x.diverge && x.auto?.lado && (
                          <span className="mt-0.5 flex items-center gap-1 text-[var(--color-warning)]">
                            As escalações dizem {sigla(x.auto.lado)}.
                            <button type="button" className="inline-flex items-center gap-0.5 underline" onClick={() => corrigir(p.atletaId, x.manual, null)}>
                              <RotateCcw size={10} aria-hidden /> usar o automático
                            </button>
                          </span>
                        )}
                        {x.auto?.ambos && !x.manual && (
                          <span className="block text-[var(--color-warning)]">
                            {x.auto.lado
                              ? `Joga dos dois lados; nos últimos jogos, ${sigla(x.auto.lado)}. Na cedência conta o lado de cada jogo.`
                              : "Joga dos dois lados: na cedência conta o lado de cada jogo. Escolha um para os filtros."}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        {!grupos.length && <p className="py-6 text-center text-sm text-[var(--color-ink-3)]">Nenhum lateral nesse filtro.</p>}
        <p className="mt-3 text-xs text-[var(--color-ink-3)]">
          A correção à mão vale para todos os jogos do atleta. A análise do site é refeita alguns segundos depois da última mudança.
        </p>
      </Card>
    </div>
  );
}

function Fontes({ resumo, carregando, atualizando, onAtualizar }: { resumo?: ResumoLados; carregando: boolean; atualizando: boolean; onAtualizar: () => void }) {
  const espn = resumo?.espn;
  const api = resumo?.apiFootball;
  const ori = resumo?.orientacao;
  const totalOri = (ori?.confirmam ?? 0) + (ori?.contrariam ?? 0);
  return (
    <Card className="p-3 sm:p-4">
      <SectionTitle
        title="Descoberta automática"
        subtitle="O site lê a escalação de cada jogo e anota de que lado cada lateral jogou. Na cedência, cada jogo conta o lado em que o lateral jogou naquele dia."
        icon={<Wand2 size={18} className="text-[var(--color-brand)]" />}
        right={
          <button type="button" className="btn btn-primary px-3 py-1.5 text-sm" onClick={onAtualizar} disabled={atualizando || !resumo?.ligado}>
            <RefreshCw size={14} className={atualizando ? "animate-spin" : ""} aria-hidden /> {atualizando ? "Lendo escalações…" : "Atualizar agora"}
          </button>
        }
      />
      {carregando && <p className="text-sm text-[var(--color-ink-3)]">Carregando…</p>}
      {resumo && !resumo.ligado && (
        <Alert tone="info">A descoberta automática usa os jogadores de verdade do Cartola. Com o site em modo demonstração, só a marcação manual vale.</Alert>
      )}
      {resumo?.ligado && espn && api && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-[var(--color-line)] p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">ESPN · escalação jogo a jogo</div>
              {!espn.erro && espn.jogosNaLista > 0 && !espn.pendentes && <CheckCircle2 size={16} className="text-[var(--color-good-ink)]" aria-label="Em dia" />}
            </div>
            <div className="mt-1 text-xs text-[var(--color-ink-3)]">Posição escrita em cada jogo (“Left Back”, “Right Back”). Não precisa de chave.</div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="font-display text-2xl font-bold">{espn.jogosLidos}</span>
              <span className="text-xs text-[var(--color-ink-3)]">de {espn.jogosNaLista} jogos de {resumo.temporada} lidos</span>
            </div>
            <Progresso valor={espn.jogosLidos} total={espn.jogosNaLista} />
            <div className="mt-1.5 space-y-0.5 text-[11px] text-[var(--color-ink-3)]">
              {espn.pendentes > 0 && <div>{espn.pendentes} jogos na fila (o vigia lê alguns por minuto; “Atualizar agora” lê todos)</div>}
              {espn.semEscalacao > 0 && <div>{espn.semEscalacao} jogos sem escalação publicada (tenta de novo depois)</div>}
              <div>{espn.lateraisEncontrados} laterais encontrados nas escalações · {resumo.jogosComLado} lados por jogo usados na cedência</div>
              {espn.listaEm && <div>Lista de jogos atualizada {timeAgo(espn.listaEm)}</div>}
            </div>
            {espn.erro && (
              <div className="mt-2">
                <Alert tone="warning">{espn.erro}. Tenta de novo sozinho em 15 min.</Alert>
              </div>
            )}
          </div>
          <div className="rounded-xl border border-[var(--color-line)] p-3">
            <div className="text-sm font-semibold">API-Football · desenho tático</div>
            {!api.chave ? (
              <div className="mt-1 text-xs text-[var(--color-ink-3)]">Sem a chave API_FOOTBALL_KEY no servidor. Opcional: a ESPN já cobre a temporada.</div>
            ) : (
              <>
                <div className="mt-1 text-xs text-[var(--color-ink-3)]">
                  Posição no desenho de cada jogo. Usa só a cota que sobra no dia
                  {api.temporadaConsultada ? ` · temporada ${api.temporadaConsultada}` : ""}
                  {api.negadas.length ? ` (o plano não libera ${api.negadas.join(", ")})` : ""}.
                </div>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="font-display text-2xl font-bold">{api.jogosLidos}</span>
                  <span className="text-xs text-[var(--color-ink-3)]">de {api.jogosNaLista || "?"} jogos lidos</span>
                </div>
                <Progresso valor={api.jogosLidos} total={api.jogosNaLista} />
                <div className="mt-1.5 space-y-0.5 text-[11px] text-[var(--color-ink-3)]">
                  {api.pendentes > 0 && <div>{api.pendentes} jogos na fila (20 por chamada, sem atrapalhar as escalações oficiais)</div>}
                  {totalOri > 0 && (
                    <div>
                      Ponta esquerda conferida pelas camisas 2 (lateral direito) e 6 (esquerdo): {ori!.confirmam} de {totalOri} confirmam
                      {ori!.invertido ? " · orientação invertida automaticamente" : ""}
                    </div>
                  )}
                </div>
                {api.erro && (
                  <div className="mt-2">
                    <Alert tone="warning">{api.erro}</Alert>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {resumo?.ligado && (resumo.timesSemPar.length > 0 || resumo.jogosSemRodada > 0) && (
        <div className="mt-3">
          <Alert tone="warning">
            {resumo.timesSemPar.length > 0 && <div>Times das escalações sem par no Cartola: {resumo.timesSemPar.join(", ")}. Os laterais desses times ficam sem lado automático.</div>}
            {resumo.jogosSemRodada > 0 && <div>{resumo.jogosSemRodada} jogos lidos não foram achados no calendário do Cartola: contam para o lado do atleta, mas não para o lado por jogo.</div>}
          </Alert>
        </div>
      )}
      {resumo?.ligado && resumo.semPar.length > 0 && (
        <details className="mt-3 text-xs text-[var(--color-ink-3)]">
          <summary className="cursor-pointer">{resumo.semPar.length} laterais das escalações sem par no Cartola</summary>
          <p className="mt-1">Nomes que as fontes escreveram de um jeito que não casou com nenhum lateral do Cartola (ou atleta que o Cartola chama de outra posição): {resumo.semPar.join(", ")}.</p>
        </details>
      )}
    </Card>
  );
}

function Progresso({ valor, total }: { valor: number; total: number }) {
  const w = total ? Math.min(100, (valor / total) * 100) : 0;
  return (
    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-1)]">
      <div className="h-full rounded-full bg-[var(--color-good)] transition-[width]" style={{ width: `${w}%` }} />
    </div>
  );
}
