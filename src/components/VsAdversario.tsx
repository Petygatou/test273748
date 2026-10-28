import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Flame, Home, Plane, Swords } from "lucide-react";
import { useMemo, useState } from "react";
import { POSITIONS, SCORING, SCOUT_LABELS, type PositionId, type ScoutKey } from "../engine/rules";
import type { RoundAnalysis } from "../engine/types";
import { fmt1, fmt2, pct, signed } from "../lib/format";
import { fetchVsAdversario } from "../server/fns";
import { divergingColor } from "./charts";
import { ClubBadge, PosBadge, Seg } from "./ui";

type Mando = "todos" | "casa" | "fora";
export type Periodo = "3" | "5" | "10" | "todos";
type Ordem = "recentes" | "maior" | "menor";

const SCOUTS_POS: Record<PositionId, ScoutKey[]> = {
  1: ["DE", "SG", "DP", "GS", "FS"],
  2: ["DS", "SG", "A", "FS", "FF", "G"],
  3: ["DS", "SG", "G", "A", "FS", "CA"],
  4: ["DS", "A", "FS", "FF", "FD", "G"],
  5: ["G", "A", "FS", "FF", "FD", "FT", "DS"],
  6: [],
};

/** Ordem de leitura dos scouts: os que dão mais pontos primeiro. */
const ordemScout = (a: string, b: string) => (SCORING[b as ScoutKey] ?? 0) - (SCORING[a as ScoutKey] ?? 0);

/**
 * Quem da mesma posição já enfrentou o adversário: jogo a jogo, com mando, placar, pontos e
 * scouts. Filtros de mando e de período (últimos N jogos do adversário), ordenação e mapa de calor.
 */
export function VsAdversario({
  a,
  adversarioId,
  posicaoId,
  mandoInicial = "todos",
  periodoInicial = "5",
  ladoInicial,
  nomeReferencia,
}: {
  a: RoundAnalysis;
  adversarioId: number;
  posicaoId: PositionId;
  /** mando de quem enfrenta (ex.: o atleta da ficha joga em casa → "casa") */
  mandoInicial?: Mando;
  periodoInicial?: Periodo;
  /** laterais: começa filtrando o lado (esquerdo/direito) */
  ladoInicial?: "E" | "D";
  /** nome do atleta da ficha, para o texto de comparação */
  nomeReferencia?: string;
}) {
  const [mando, setMando] = useState<Mando>(mandoInicial);
  const [periodo, setPeriodo] = useState<Periodo>(periodoInicial);
  const [lado, setLado] = useState<"todos" | "E" | "D">(ladoInicial ?? "todos");
  const [ordem, setOrdem] = useState<Ordem>("recentes");
  const [calor, setCalor] = useState(true);
  const q = useQuery({
    queryKey: ["vs-adversario", adversarioId, posicaoId, a.rodada],
    queryFn: () => fetchVsAdversario({ data: { clube: adversarioId, pos: posicaoId } }),
    staleTime: 10 * 60_000,
  });
  const adv = a.clubs[adversarioId];
  const posPlural = POSITIONS[posicaoId].plural.toLowerCase();
  const noMercado = useMemo(() => new Set(a.players.map((p) => p.atletaId)), [a]);

  const vis = useMemo(() => {
    const todos = q.data?.jogos ?? [];
    const porMando = mando === "todos" ? todos : todos.filter((j) => j.mando === mando);
    // período = últimos N jogos do adversário dentro do mando escolhido
    const jogosBase = periodo === "todos" ? porMando : porMando.slice(0, Number(periodo));
    // laterais: só os que jogaram do lado escolhido naquele jogo (sem lado conhecido ficam de fora do filtro)
    const jogos = lado === "todos" ? jogosBase : jogosBase.map((j) => ({ ...j, atletas: j.atletas.filter((at) => at.lado === lado) }));
    const linhas = jogos.flatMap((j) => j.atletas.map((at) => ({ ...at, jogo: j })));
    const n = linhas.length;
    const media = n ? linhas.reduce((s, l) => s + l.pontos, 0) / n : 0;
    const melhor = linhas.reduce<(typeof linhas)[number] | null>((m, l) => (!m || l.pontos > m.pontos ? l : m), null);
    const scoutMedio: Array<{ k: string; v: number }> = [];
    for (const k of SCOUTS_POS[posicaoId]) {
      const tot = linhas.reduce((s, l) => s + (l.scout[k] ?? 0), 0);
      if (n) scoutMedio.push({ k, v: tot / n });
    }
    return {
      jogos,
      n,
      media,
      melhor,
      p5: n ? linhas.filter((l) => l.pontos >= 5).length / n : 0,
      p8: n ? linhas.filter((l) => l.pontos >= 8).length / n : 0,
      negativos: n ? linhas.filter((l) => l.pontos < 0).length / n : 0,
      scoutMedio,
      linhas,
    };
  }, [q.data, mando, periodo, posicaoId, lado]);

  const mediaLiga = q.data?.mediaLiga ?? 0;
  const corPts = (pts: number) => divergingColor(mediaLiga > 0 ? 1 + (pts - mediaLiga) / Math.max(4, mediaLiga * 1.6) : 1, 0.6);
  const grupos =
    ordem === "recentes"
      ? vis.jogos.map((j) => ({ jogo: j, atletas: j.atletas }))
      : null;
  const ordenadas = ordem === "recentes" ? null : [...vis.linhas].sort((x, y) => (ordem === "maior" ? y.pontos - x.pontos : x.pontos - y.pontos));

  const linha = (at: (typeof vis.jogos)[number]["atletas"][number], jogo: (typeof vis.jogos)[number], mostrarJogo = false) => {
    const col = calor ? corPts(at.pontos) : null;
    const scouts = Object.entries(at.scout).sort(([x], [y]) => ordemScout(x, y));
    const nome = noMercado.has(at.atletaId) ? (
      <Link to="/jogador/$id" params={{ id: String(at.atletaId) }} className="truncate font-semibold hover:text-[var(--color-brand)]">
        {at.apelido}
      </Link>
    ) : (
      <span className="truncate font-semibold">{at.apelido}</span>
    );
    return (
      <li key={`${jogo.rodada}:${at.atletaId}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          {mostrarJogo && <ClubBadge club={a.clubs[jogo.clubeId]} size={16} />}
          {at.lado && <PosBadge pos={2} lado={at.lado} />}
          {nome}
          {mostrarJogo && (
            <span className="shrink-0 text-[11px] text-[var(--color-ink-3)]">
              R{jogo.rodada} · {jogo.mando === "casa" ? "em casa" : "fora"}
            </span>
          )}
        </div>
        <span
          className="font-display tabular row-span-2 min-w-[3.2rem] rounded-lg px-2 py-1 text-center text-base font-extrabold"
          style={col ? { background: col.bg, color: col.fg } : undefined}
          title={mediaLiga ? `${signed(at.pontos - mediaLiga, 1)} vs a média da liga para ${posPlural} (${fmt1(mediaLiga)})` : undefined}
        >
          {fmt1(at.pontos)}
        </span>
        <div className="flex min-w-0 flex-wrap gap-1 text-[11px] text-[var(--color-ink-3)]">
          {scouts.length ? (
            scouts.map(([k, v]) => (
              <span key={k} title={SCOUT_LABELS[k as ScoutKey] ?? k} className={`tabular rounded px-1.5 py-0.5 ${(SCORING[k as ScoutKey] ?? 0) < 0 ? "bg-[var(--color-critical)]/10 text-[var(--color-critical-ink)]" : "bg-[var(--color-surface-1)] text-[var(--color-ink-2)]"}`}>
                {k}:{v}
              </span>
            ))
          ) : (
            <span>sem scouts</span>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Seg
          label="Mando de quem enfrentou"
          value={mando}
          onChange={setMando}
          options={[
            { value: "todos", label: "Todos" },
            { value: "casa", label: <span className="flex items-center gap-1"><Home size={13} aria-hidden /> Em casa</span> },
            { value: "fora", label: <span className="flex items-center gap-1"><Plane size={13} aria-hidden /> Fora</span> },
          ]}
        />
        <Seg
          label="Período"
          value={periodo}
          onChange={setPeriodo}
          options={[
            { value: "3", label: "Últ. 3" },
            { value: "5", label: "Últ. 5" },
            { value: "10", label: "Últ. 10" },
            { value: "todos", label: "Temporada" },
          ]}
        />
        {posicaoId === 2 && (
          <Seg
            label="Lado do lateral"
            value={lado}
            onChange={setLado}
            options={[
              { value: "todos", label: "Ambos os lados" },
              { value: "E", label: "Esquerdo" },
              { value: "D", label: "Direito" },
            ]}
          />
        )}
        <select className="input h-9 w-auto py-1 text-xs" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label="Ordenar">
          <option value="recentes">Mais recentes</option>
          <option value="maior">Maior pontuação</option>
          <option value="menor">Menor pontuação</option>
        </select>
        <button type="button" className={`chip ${calor ? "border-[var(--color-brand)]/50 text-[var(--color-brand)]" : ""}`} aria-pressed={calor} onClick={() => setCalor((v) => !v)}>
          <Flame size={13} aria-hidden /> Mapa de calor
        </button>
      </div>
      <p className="text-xs text-[var(--color-ink-3)]">
        {mando === "todos" ? "Todos os jogos" : mando === "casa" ? "Jogos em que quem enfrentou estava em casa (o " + (adv?.abreviacao ?? "adversário") + " fora)" : "Jogos em que quem enfrentou estava fora (o " + (adv?.abreviacao ?? "adversário") + " em casa)"}
        {periodo !== "todos" ? ` · últimos ${periodo} jogos do ${adv?.nome ?? "adversário"}` : " · temporada inteira"}
        {lado !== "todos" ? ` · só quem jogou de lateral ${lado === "E" ? "esquerdo" : "direito"} naquele jogo` : ""}.
      </p>

      {q.isLoading && <div className="skeleton h-40" />}
      {q.error && <p className="text-sm text-[var(--color-critical-ink)]">Não foi possível carregar os jogos agora.</p>}

      {q.data && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Resumo
              rotulo={`Média de ${posPlural}`}
              valor={vis.n ? fmt1(vis.media) : "—"}
              dica={vis.n && mediaLiga ? `${signed(((vis.media - mediaLiga) / mediaLiga) * 100, 0)}% vs liga (${fmt1(mediaLiga)})` : "sem jogos no filtro"}
              cor={vis.n && mediaLiga ? divergingColor(vis.media / mediaLiga) : undefined}
            />
            <Resumo rotulo="Melhor pontuação" valor={vis.melhor ? fmt1(vis.melhor.pontos) : "—"} dica={vis.melhor ? `${vis.melhor.apelido} · R${vis.melhor.jogo.rodada}` : ""} />
            <Resumo rotulo="Fizeram 5+ / 8+" valor={vis.n ? `${pct(vis.p5)} · ${pct(vis.p8)}` : "—"} dica={vis.n ? `negativos: ${pct(vis.negativos)}` : ""} />
            <Resumo rotulo="Amostra" valor={`${vis.jogos.length} jogo${vis.jogos.length === 1 ? "" : "s"}`} dica={`${vis.n} ${vis.n === 1 ? POSITIONS[posicaoId].name.toLowerCase() : posPlural}`} />
          </div>

          {vis.scoutMedio.length > 0 && vis.n > 0 && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              <span className="text-[var(--color-ink-3)]">Média por atleta:</span>
              {vis.scoutMedio.map((s) => (
                <span key={s.k} className="chip py-0.5" title={SCOUT_LABELS[s.k as ScoutKey]}>
                  <b className="text-[var(--color-ink)]">{s.k}</b> {fmt2(s.v)}
                </span>
              ))}
            </div>
          )}

          {vis.jogos.length === 0 ? (
            <p className="rounded-xl bg-[var(--color-surface-1)] p-4 text-sm text-[var(--color-ink-3)]">
              O {adv?.nome ?? "adversário"} ainda não tem jogos {mando === "casa" ? "contra times jogando em casa" : mando === "fora" ? "contra times jogando fora" : ""} nesta temporada.
            </p>
          ) : grupos ? (
            <div className="space-y-2">
              {grupos.map(({ jogo, atletas }) => (
                <div key={jogo.rodada} className="overflow-hidden rounded-xl border border-[var(--color-line)]">
                  <div className="flex flex-wrap items-center gap-2 bg-[var(--color-surface-1)] px-3 py-2 text-xs">
                    <span className="font-display font-bold text-[var(--color-ink)]">R{jogo.rodada}</span>
                    <span className="flex items-center gap-1 text-[var(--color-ink-3)]">
                      {jogo.mando === "casa" ? <Home size={12} aria-hidden /> : <Plane size={12} aria-hidden />}
                      {jogo.mando === "casa" ? "Em casa" : "Fora"}
                    </span>
                    <span className="flex items-center gap-1.5 font-semibold">
                      <ClubBadge club={a.clubs[jogo.clubeId]} size={16} />
                      {a.clubs[jogo.clubeId]?.nome ?? "Time"}
                      {jogo.placar && (
                        <span className="tabular text-[var(--color-ink-2)]">
                          {jogo.placar[0]} x {jogo.placar[1]}
                        </span>
                      )}
                      <Swords size={12} className="text-[var(--color-ink-3)]" aria-hidden />
                      <ClubBadge club={adv} size={16} />
                      {adv?.abreviacao}
                    </span>
                    {jogo.data && <span className="ml-auto text-[var(--color-ink-3)]">{new Date(jogo.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>}
                  </div>
                  {atletas.length ? (
                    <ul className="divide-y divide-[var(--color-line)]">
                      {atletas.map((at) => linha(at, jogo))}
                    </ul>
                  ) : (
                    <p className="px-3 py-2 text-xs text-[var(--color-ink-3)]">Nenhum {POSITIONS[posicaoId].name.toLowerCase()} pontuou neste jogo.</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-[var(--color-line)] overflow-hidden rounded-xl border border-[var(--color-line)]">
              {ordenadas!.map((l) => linha(l, l.jogo, true))}
            </ul>
          )}
          {nomeReferencia && vis.n > 0 && (
            <p className="text-xs text-[var(--color-ink-3)]">
              Leitura rápida: {posPlural} que enfrentaram o {adv?.nome} {mando === "todos" ? "" : mando === "casa" ? "jogando em casa " : "jogando fora "}fizeram em média <b className="text-[var(--color-ink-2)]">{fmt1(vis.media)}</b> pontos. Use como referência para o {nomeReferencia}.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Resumo({ rotulo, valor, dica, cor }: { rotulo: string; valor: string; dica?: string; cor?: { bg: string; fg: string } }) {
  return (
    <div className="rounded-xl bg-[var(--color-surface-1)] p-2.5" style={cor ? { background: cor.bg, color: cor.fg } : undefined}>
      <div className="text-[10px] font-semibold tracking-wide uppercase opacity-80">{rotulo}</div>
      <div className="font-display tabular text-lg leading-tight font-extrabold">{valor}</div>
      {dica && <div className="truncate text-[11px] opacity-80">{dica}</div>}
    </div>
  );
}
