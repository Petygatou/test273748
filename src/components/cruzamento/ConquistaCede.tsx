import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Flame, House, Info, MapPin, Target } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { valorMetrica, type BlocoPos, type ColunaPos, type LinhaPos, type MetricaPos, type SomaPos } from "../../engine/cruzamento";
import { DEF_POR_CODIGO } from "../../engine/scoutDefs";
import type { Club } from "../../engine/types";
import { fmt1, fmt2, pct, signed } from "../../lib/format";
import { KEYS, useLocal } from "../../lib/storage";
import { fetchConquistaCede, fetchConquistaCedeDetalhe, fetchCruzamentoOpcoes, type ConquistaCede as Dados } from "../../server/fnsCruzamento";
import { divergingColor } from "../charts";
import { Sheet } from "../Sheet";
import { Card, ClubBadge, ErrorBox, SectionTitle, Seg, Skeleton } from "../ui";

type Tabela = "mandantes" | "visitantes";
interface Filtros {
  tabela: Tabela;
  metrica: MetricaPos;
  recorte: "3" | "5" | "10" | "todos";
}
const PADRAO: Filtros = { tabela: "mandantes", metrica: "pontos", recorte: "3" };

const METRICAS: Array<{ value: MetricaPos; label: string; unidade: string }> = [
  { value: "pontos", label: "Pontos", unidade: "pontos" },
  { value: "DS", label: "Desarmes", unidade: "desarmes" },
  { value: "FIN", label: "Finalizações", unidade: "finalizações" },
  { value: "GA", label: "G+A", unidade: "gols + assistências" },
  { value: "FS", label: "Faltas sofridas", unidade: "faltas sofridas" },
  { value: "DE", label: "Defesas", unidade: "defesas" },
];

const COL_INFO: Record<ColunaPos, { pos: number; plural: string }> = {
  GOL: { pos: 1, plural: "Goleiros" },
  LAT: { pos: 2, plural: "Laterais" },
  LD: { pos: 2, plural: "Laterais direitos" },
  LE: { pos: 2, plural: "Laterais esquerdos" },
  ZAG: { pos: 3, plural: "Zagueiros" },
  MEI: { pos: 4, plural: "Meias" },
  ATA: { pos: 5, plural: "Atacantes" },
  TEC: { pos: 6, plural: "Técnicos" },
};

/** Colunas da tabela: laterais por lado quando as escalações dizem o lado; só posições em que a métrica existe. */
function colunasPara(temLados: boolean, m: MetricaPos): ColunaPos[] {
  const todas: ColunaPos[] = temLados ? ["GOL", "LD", "LE", "ZAG", "MEI", "ATA", "TEC"] : ["GOL", "LAT", "ZAG", "MEI", "ATA", "TEC"];
  if (m === "pontos") return todas;
  const posicoes = DEF_POR_CODIGO.get(m)?.posicoes ?? [];
  // desarme de goleiro existe na tabela do Cartola, mas é raríssimo: a coluna só mostraria zeros
  return todas.filter((c) => posicoes.includes(COL_INFO[c].pos as 1) && !(m === "DS" && c === "GOL"));
}

const media = (s: SomaPos | undefined, m: MetricaPos) => (s && s.n ? s[m] / s.n : null);
const formatar = (v: number, m: MetricaPos) => (m === "pontos" ? fmt1(v) : fmt2(v));

/** Os dois lados de cada linha da tabela escolhida: quem conquista (time analisado) e quem cede. */
function lados(l: LinhaPos, t: Tabela) {
  return t === "mandantes"
    ? { esquerda: l.mandante.conquista, direita: l.visitante.cede, conquista: l.mandante.conquista, cede: l.visitante.cede }
    : { esquerda: l.mandante.cede, direita: l.visitante.conquista, conquista: l.visitante.conquista, cede: l.mandante.cede };
}

/**
 * Conquistado × cedido por posição, no formato das tabelas de mandantes e visitantes:
 * em cada jogo da rodada, a média por atleta de cada posição que o time faz no mando
 * dele × a que o adversário cede no mando oposto.
 */
export function ConquistaCede() {
  const [temporada, setTemporada] = useState<number | undefined>();
  const [rodadaEscolhida, setRodada] = useState<number | undefined>();
  const [salvos, setSalvos] = useLocal<Filtros>(KEYS.conquistaCede, PADRAO);
  const f = { ...PADRAO, ...salvos };
  const set = (p: Partial<Filtros>) => setSalvos((s) => ({ ...PADRAO, ...s, ...p }));
  const [aberta, setAberta] = useState<{ matchId: number; coluna: ColunaPos } | null>(null);

  const opcoes = useQuery({ queryKey: ["cruz-opcoes", temporada ?? 0], queryFn: () => fetchCruzamentoOpcoes({ data: { temporada } }), staleTime: 5 * 60_000 });
  const o = opcoes.data;
  const rodada = rodadaEscolhida ?? o?.rodadaPadrao;
  const params = { temporada: o && !o.atual ? o.temporada : undefined, rodada, recorte: f.recorte === "todos" ? undefined : Number(f.recorte) };
  const q = useQuery({ queryKey: ["conquista-cede", params], queryFn: () => fetchConquistaCede({ data: params }), enabled: rodada != null, placeholderData: keepPreviousData, staleTime: 5 * 60_000 });
  const r = q.data;
  const clubes = useMemo(() => Object.fromEntries((o?.clubes ?? []).map((c) => [c.id, c as Club])) as Record<number, Club>, [o]);
  const sigla = (id: number) => clubes[id]?.abreviacao ?? `#${id}`;
  const colunas = colunasPara((r?.ladosCobertura ?? 0) > 0, f.metrica);
  const metricaInfo = METRICAS.find((m) => m.value === f.metrica)!;
  const recorteN = f.recorte === "todos" ? null : Number(f.recorte);
  const janela = recorteN ? `últimos ${recorteN} jogos` : "todos os jogos";
  // referência: média da liga das atuações no mesmo mando dos dois lados da tabela
  // (mandantes: quem jogou em casa; visitantes: quem jogou fora)
  const ref = r ? (f.tabela === "mandantes" ? r.referencia.casa : r.referencia.fora) : null;
  const fator = (s: SomaPos, c: ColunaPos) => {
    const v = media(s, f.metrica);
    const base = ref ? media(ref[c], f.metrica) : null;
    return v == null || !base ? null : v / base;
  };
  const encolhido = (s: SomaPos, c: ColunaPos) => {
    const base = ref ? media(ref[c], f.metrica) : null;
    if (!s.n || !base) return null;
    const k = 4; // atuações "emprestadas" da média da liga
    return (s[f.metrica] + base * k) / (s.n + k) / base;
  };

  // melhores encaixes: o time analisado faz muito na posição E o adversário cede muito a ela
  const encaixes = useMemo(() => {
    if (!r) return [];
    const out: Array<{ l: LinhaPos; c: ColunaPos; conq: number; ced: number; nota: number }> = [];
    for (const l of r.linhas) {
      const { conquista, cede } = lados(l, f.tabela);
      for (const c of colunas) {
        if (c === "TEC" || conquista.cols[c].n < 2 || cede.cols[c].n < 2) continue;
        // encolhe para a média da liga: 3 atuações de goleiro não pesam como 9 de meia
        const fc = encolhido(conquista.cols[c], c);
        const fd = encolhido(cede.cols[c], c);
        if (fc == null || fd == null) continue;
        out.push({ l, c, conq: media(conquista.cols[c], f.metrica)!, ced: media(cede.cols[c], f.metrica)!, nota: (fc + fd) / 2 });
      }
    }
    return out.sort((a, b) => b.nota - a.nota).slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, f.tabela, f.metrica, colunas.join()]);

  if (opcoes.isLoading)
    return (
      <div className="space-y-3" aria-busy="true">
        <span className="sr-only">Carregando…</span>
        <Skeleton className="h-40" />
        <Skeleton className="h-96" />
      </div>
    );
  if (opcoes.error || !o) return <ErrorBox error={opcoes.error} retry={() => opcoes.refetch()} />;

  const mandantes = f.tabela === "mandantes";
  const tituloEsq = mandantes ? "Conquistado · mandantes em casa" : "Cedido · mandantes em casa";
  const tituloDir = mandantes ? "Cedido · visitantes fora" : "Conquistado · visitantes fora";
  const linhaAberta = aberta && r?.linhas.find((l) => l.matchId === aberta.matchId);

  return (
    <div className="space-y-4">
      <Card className="p-3 sm:p-4">
        <SectionTitle
          title="Conquistado × Cedido"
          subtitle="Em cada jogo da rodada: a média por atleta de cada posição que o time faz no mando dele × a que o adversário cede no mando oposto."
          icon={<Target size={18} className="text-[var(--color-brand)]" />}
        />
        <div className="space-y-3">
          <div className="seg-cheio sm:max-w-md">
            <Seg
              label="Tabela"
              value={f.tabela}
              onChange={(v) => set({ tabela: v })}
              options={[
                {
                  value: "mandantes",
                  label: (
                    <span className="flex items-center gap-1.5">
                      <House size={14} aria-hidden /> Mandantes
                    </span>
                  ),
                },
                {
                  value: "visitantes",
                  label: (
                    <span className="flex items-center gap-1.5">
                      <MapPin size={14} aria-hidden /> Visitantes
                    </span>
                  ),
                },
              ]}
            />
          </div>
          <p className="text-xs text-[var(--color-ink-2)]">
            {mandantes ? (
              <>
                <b className="text-[var(--color-ink)]">Mandantes:</b> o que cada posição do mandante <b>conquista em casa</b> × o que o visitante <b>cede fora</b>.
              </>
            ) : (
              <>
                <b className="text-[var(--color-ink)]">Visitantes:</b> o que o mandante <b>cede em casa</b> × o que cada posição do visitante <b>conquista fora</b>.
              </>
            )}
          </p>
          <div className="-mx-3 flex items-center gap-2 overflow-x-auto px-3 pb-1 scrollbar-none sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0" role="group" aria-label="Métrica">
            {METRICAS.map((m) => (
              <button
                key={m.value}
                type="button"
                aria-pressed={f.metrica === m.value}
                onClick={() => set({ metrica: m.value })}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  f.metrica === m.value
                    ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-[#1a0a00]"
                    : "border-[var(--color-line)] text-[var(--color-ink-2)] hover:border-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="seg-cheio min-w-0 sm:w-auto">
              <Seg
                label="Recorte"
                value={f.recorte}
                onChange={(v) => set({ recorte: v })}
                options={[
                  { value: "3", label: "Últ. 3" },
                  { value: "5", label: "Últ. 5" },
                  { value: "10", label: "Últ. 10" },
                  { value: "todos", label: "Todos" },
                ]}
              />
            </div>
            <div className="flex gap-2 *:flex-1 sm:*:flex-none">
              {o.temporadas.length > 1 && (
                <select
                  className="input h-9 w-auto py-1 text-xs"
                  value={o.temporada}
                  onChange={(e) => {
                    setTemporada(Number(e.target.value));
                    setRodada(undefined);
                  }}
                  aria-label="Temporada"
                >
                  {o.temporadas.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              )}
              <select className="input h-9 w-auto py-1 text-xs" value={rodada} onChange={(e) => setRodada(Number(e.target.value))} aria-label="Rodada">
                {Array.from({ length: Math.max(0, (o.atual ? o.rodadaAtual : o.rodadaAtual - 1) - 1) }, (_, i) => i + 2)
                  .reverse()
                  .map((x) => (
                    <option key={x} value={x}>
                      R{x}
                      {o.atual && x === o.rodadaAtual ? " · próxima" : ""}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          {r && r.ladosCobertura > 0 && r.ladosCobertura < 0.9 && (
            <p className="text-[11px] text-[var(--color-ink-3)]">LD/LE: {pct(r.ladosCobertura)} das atuações de laterais têm o lado identificado; a média de cada lado usa essas atuações.</p>
          )}
        </div>
      </Card>

      {q.error && <ErrorBox error={q.error} retry={() => q.refetch()} />}
      {(q.isLoading || (!r && !q.error)) && <Skeleton className="h-96" />}

      {r && encaixes.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[var(--color-ink-3)] uppercase">
            <Flame size={13} className="text-[var(--color-brand)]" aria-hidden /> Melhores encaixes · {metricaInfo.label.toLowerCase()}
          </div>
          <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0">
            {encaixes.map((e) => {
              const { conquista, cede } = lados(e.l, f.tabela);
              return (
                <button
                  key={`${e.l.matchId}:${e.c}`}
                  type="button"
                  onClick={() => setAberta({ matchId: e.l.matchId, coluna: e.c })}
                  className="card flex w-[78%] shrink-0 snap-start items-center gap-3 p-3 text-left transition-colors hover:border-[var(--color-ink-3)] sm:w-auto"
                >
                  <ClubBadge club={clubes[conquista.clubeId]} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {COL_INFO[e.c].plural} do {sigla(conquista.clubeId)}
                    </span>
                    <span className="block truncate text-[11px] text-[var(--color-ink-3)]">
                      fazem {formatar(e.conq, f.metrica)} {conquista.casa ? "em casa" : "fora"} · {sigla(cede.clubeId)} cede {formatar(e.ced, f.metrica)}
                    </span>
                  </span>
                  <span className="font-display text-lg font-extrabold text-[var(--color-brand)] tabular">{signed((e.nota - 1) * 100, 0)}%</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {r && (
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 pt-3 sm:px-4 sm:pt-4">
            <h3 className="font-display text-lg font-bold">
              {mandantes ? "Tabela dos mandantes" : "Tabela dos visitantes"} · R{r.rodada}
            </h3>
            <span className="text-xs text-[var(--color-ink-3)]">
              {metricaInfo.label} por atleta · {janela} respeitando o mando
            </span>
          </div>
          {!r.linhas.length ? (
            <p className="py-10 text-center text-sm text-[var(--color-ink-3)]">Sem jogos cadastrados nesta rodada.</p>
          ) : (
            <>
              <TabelaLarga
                r={r}
                tabela={f.tabela}
                colunas={colunas}
                metrica={f.metrica}
                recorte={recorteN}
                fator={fator}
                clubes={clubes}
                tituloEsq={tituloEsq}
                tituloDir={tituloDir}
                onAbrir={(matchId, coluna) => setAberta({ matchId, coluna })}
              />
              <ListaCelular
                r={r}
                tabela={f.tabela}
                colunas={colunas}
                metrica={f.metrica}
                recorte={recorteN}
                fator={fator}
                clubes={clubes}
                onAbrir={(matchId, coluna) => setAberta({ matchId, coluna })}
              />
            </>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--color-line)] bg-[var(--color-surface-1)] px-3 py-3 text-xs text-[var(--color-ink-3)] sm:px-4">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-5 rounded-sm" style={{ background: divergingColor(0.7).bg }} aria-hidden /> abaixo da média
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-5 rounded-sm" style={{ background: divergingColor(1).bg }} aria-hidden /> na média
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-5 rounded-sm" style={{ background: divergingColor(1.3).bg }} aria-hidden /> acima da média
            </span>
            <span>
              Laranja nos dois lados = bom encaixe para o {mandantes ? "mandante" : "visitante"}. Média = {metricaInfo.unidade} da posição ÷ atuações (cada atleta em cada jogo). Toque num número para
              ver jogo a jogo.
            </span>
          </div>
        </Card>
      )}
      {r && (
        <p className="flex items-start gap-1.5 text-[11px] text-[var(--color-ink-3)]">
          <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
          Fonte: pontuação oficial do Cartola, jogo a jogo, só rodadas encerradas. A cor compara com a média de todos os times no mesmo recorte e mando. Jogo que faltou na fonte não conta como zero: o
          recorte usa o jogo anterior.
        </p>
      )}

      {aberta && linhaAberta && (
        <Detalhe
          linha={linhaAberta}
          colunaInicial={aberta.coluna}
          colunas={colunas}
          tabela={f.tabela}
          metrica={f.metrica}
          params={{ ...params, rodada: r!.rodada }}
          janela={janela}
          clubes={clubes}
          onClose={() => setAberta(null)}
        />
      )}
    </div>
  );
}

/* --------------------------------- células --------------------------------- */

function Numero({
  s,
  c,
  metrica,
  fator,
  onClick,
  titulo,
  grande,
}: {
  s: SomaPos;
  c: ColunaPos;
  metrica: MetricaPos;
  fator: (s: SomaPos, c: ColunaPos) => number | null;
  onClick: () => void;
  titulo: string;
  grande?: boolean;
}) {
  const v = media(s, metrica);
  if (v == null)
    return (
      <span className="flex h-full items-center justify-center rounded-md bg-[var(--color-surface-1)] py-1.5 text-xs text-[var(--color-ink-3)]" title="Sem atuações dessa posição no recorte">
        —
      </span>
    );
  const f = fator(s, c);
  const cor = divergingColor(f ?? 1);
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      className={`tabular block w-full rounded-md text-center font-semibold hover:ring-2 hover:ring-white/40 focus-visible:ring-2 ${grande ? "px-1 py-2 text-sm" : "px-0.5 py-1.5 text-xs"}`}
      style={{ background: cor.bg, color: cor.fg }}
    >
      {formatar(v, metrica)}
    </button>
  );
}

const descrever = (b: BlocoPos, c: ColunaPos, metrica: MetricaPos, sigla: (id: number) => string) => {
  const v = media(b.cols[c], metrica);
  const mando = b.casa ? "em casa" : "fora";
  const quem = b.tipo === "conquista" ? `${COL_INFO[c].plural} do ${sigla(b.clubeId)} ${mando}` : `${sigla(b.clubeId)} ${mando} cede aos ${COL_INFO[c].plural.toLowerCase()}`;
  return `${quem}: ${v == null ? "—" : formatar(v, metrica)} por atleta (${b.cols[c].n} atuações em ${b.jogos.length} jogos). Toque para ver jogo a jogo.`;
};

function Jogos({ b, recorte }: { b: BlocoPos; recorte: number | null }) {
  const curto = recorte != null && b.jogos.length < recorte;
  return (
    <span className={`tabular ${curto ? "font-semibold text-[var(--color-warning)]" : ""}`} title={curto ? "Menos jogos que o recorte nesse mando" : undefined}>
      {b.jogos.length}j
    </span>
  );
}

/* ----------------------- computador: tabela espelhada ----------------------- */

interface PropsTabela {
  r: Dados;
  tabela: Tabela;
  colunas: ColunaPos[];
  metrica: MetricaPos;
  recorte: number | null;
  fator: (s: SomaPos, c: ColunaPos) => number | null;
  clubes: Record<number, Club>;
  onAbrir: (matchId: number, c: ColunaPos) => void;
}

function TabelaLarga({ r, tabela, colunas, metrica, recorte, fator, clubes, tituloEsq, tituloDir, onAbrir }: PropsTabela & { tituloEsq: string; tituloDir: string }) {
  const sigla = (id: number) => clubes[id]?.abreviacao ?? `#${id}`;
  const espelho = [...colunas].reverse();
  const placar = new Map(r.partidas.map((p) => [p.matchId, p] as const));
  return (
    <div className="hidden overflow-x-auto px-4 pt-3 pb-4 lg:block">
      <table className="w-full border-separate border-spacing-[3px] text-sm">
        <thead>
          <tr className="text-[11px] font-bold tracking-wide uppercase">
            <th colSpan={colunas.length} className="pb-1 text-center text-[var(--color-ink-2)]">
              {tituloEsq}
            </th>
            <th rowSpan={2} className="px-2 align-bottom text-[11px] text-[var(--color-ink-3)]">
              Rodada {r.rodada}
            </th>
            <th colSpan={colunas.length} className="pb-1 text-center text-[var(--color-ink-2)]">
              {tituloDir}
            </th>
          </tr>
          <tr className="text-[11px] text-[var(--color-ink-3)]">
            {[...colunas, ...espelho].map((c, i) => (
              <th key={i} className="min-w-[46px] border-b-2 pb-1 font-semibold" style={{ borderColor: corPos(c) }} title={COL_INFO[c].plural}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {r.linhas.map((l) => {
            const { esquerda, direita } = lados(l, tabela);
            const p = placar.get(l.matchId);
            return (
              <tr key={l.matchId}>
                {colunas.map((c) => (
                  <td key={c} className="p-0">
                    <Numero s={esquerda.cols[c]} c={c} metrica={metrica} fator={fator} grande onClick={() => onAbrir(l.matchId, c)} titulo={descrever(esquerda, c, metrica, sigla)} />
                  </td>
                ))}
                <td className="px-2 whitespace-nowrap">
                  <div className="flex items-center justify-center gap-1.5 text-xs font-bold">
                    <span className="w-9 text-right">{sigla(l.casaId)}</span>
                    <ClubBadge club={clubes[l.casaId]} size={24} />
                    <span className="w-8 text-center font-normal text-[var(--color-ink-3)]">{p?.golsCasa != null && p.golsFora != null ? `${p.golsCasa}×${p.golsFora}` : "×"}</span>
                    <ClubBadge club={clubes[l.foraId]} size={24} />
                    <span className="w-9">{sigla(l.foraId)}</span>
                  </div>
                  <div className="mt-0.5 flex justify-center gap-6 text-[10px] text-[var(--color-ink-3)]">
                    <Jogos b={esquerda} recorte={recorte} />
                    <Jogos b={direita} recorte={recorte} />
                  </div>
                </td>
                {espelho.map((c) => (
                  <td key={c} className="p-0">
                    <Numero s={direita.cols[c]} c={c} metrica={metrica} fator={fator} grande onClick={() => onAbrir(l.matchId, c)} titulo={descrever(direita, c, metrica, sigla)} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Cor de cada grupo de posição (fio sob o título da coluna). */
function corPos(c: ColunaPos) {
  return { GOL: "#d6c08a", LAT: "#5aa9e6", LD: "#5aa9e6", LE: "#5aa9e6", ZAG: "#a98bd8", MEI: "#5cc98a", ATA: "#f08a4b", TEC: "#9a9a92" }[c];
}

/* ------------------------- celular: um bloco por jogo ------------------------- */

function ListaCelular({ r, tabela, colunas, metrica, recorte, fator, clubes, onAbrir }: PropsTabela) {
  const sigla = (id: number) => clubes[id]?.abreviacao ?? `#${id}`;
  const grade = { gridTemplateColumns: `52px repeat(${colunas.length}, minmax(0, 1fr))` };
  const placar = new Map(r.partidas.map((p) => [p.matchId, p] as const));
  return (
    <ul className="space-y-2 px-3 pt-3 pb-3 sm:px-4 lg:hidden">
      {r.linhas.map((l) => {
        const { conquista, cede } = lados(l, tabela);
        const p = placar.get(l.matchId);
        const linha = (b: BlocoPos, rotulo: string) => (
          <div className="grid items-center gap-[3px]" style={grade}>
            <span className="min-w-0 leading-tight">
              <span className="flex items-center gap-1 text-xs font-bold">
                <ClubBadge club={clubes[b.clubeId]} size={14} />
                {sigla(b.clubeId)}
              </span>
              <span className="block text-[10px] whitespace-nowrap text-[var(--color-ink-3)]">
                {rotulo}
                {recorte != null && b.jogos.length < recorte && (
                  <>
                    {" · "}
                    <Jogos b={b} recorte={recorte} />
                  </>
                )}
              </span>
            </span>
            {colunas.map((c) => (
              <Numero key={c} s={b.cols[c]} c={c} metrica={metrica} fator={fator} onClick={() => onAbrir(l.matchId, c)} titulo={descrever(b, c, metrica, sigla)} />
            ))}
          </div>
        );
        return (
          <li key={l.matchId} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2">
            <div className="mb-1 grid items-end gap-[3px]" style={grade}>
              <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--color-ink-3)]">
                <ClubBadge club={clubes[l.casaId]} size={13} />
                {p?.golsCasa != null && p.golsFora != null ? `${p.golsCasa}×${p.golsFora}` : "×"}
                <ClubBadge club={clubes[l.foraId]} size={13} />
              </span>
              {colunas.map((c) => (
                <span key={c} className="border-b-2 pb-0.5 text-center text-[10px] font-semibold text-[var(--color-ink-3)]" style={{ borderColor: corPos(c) }}>
                  {c}
                </span>
              ))}
            </div>
            <div className="space-y-[3px]">
              {linha(conquista, `faz ${conquista.casa ? "casa" : "fora"}`)}
              {linha(cede, `cede ${cede.casa ? "casa" : "fora"}`)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------- jogo a jogo ------------------------------- */

function Detalhe({
  linha,
  colunaInicial,
  colunas,
  tabela,
  metrica,
  params,
  janela,
  clubes,
  onClose,
}: {
  linha: LinhaPos;
  colunaInicial: ColunaPos;
  colunas: ColunaPos[];
  tabela: Tabela;
  metrica: MetricaPos;
  params: { temporada?: number; rodada?: number; recorte?: number };
  janela: string;
  clubes: Record<number, Club>;
  onClose: () => void;
}) {
  const [coluna, setColuna] = useState<ColunaPos>(colunas.includes(colunaInicial) ? colunaInicial : colunas[0]);
  const pedido = { ...params, matchId: linha.matchId, tabela };
  const q = useQuery({ queryKey: ["conquista-cede-detalhe", pedido], queryFn: () => fetchConquistaCedeDetalhe({ data: pedido }), staleTime: 5 * 60_000 });
  const sigla = (id: number) => clubes[id]?.abreviacao ?? `#${id}`;
  const { conquista, cede } = lados(linha, tabela);
  const unidade = METRICAS.find((m) => m.value === metrica)!.unidade;
  return (
    <Sheet
      title={`${sigla(linha.casaId)} × ${sigla(linha.foraId)} · ${COL_INFO[coluna].plural}`}
      subtitle={`${unidade[0].toUpperCase() + unidade.slice(1)} por atleta · ${janela} respeitando o mando`}
      icon={<ClubBadge club={clubes[conquista.clubeId]} size={26} />}
      onClose={onClose}
    >
      <div className="mb-3">
        <Seg label="Posição" value={coluna} onChange={setColuna} options={colunas.map((c) => ({ value: c, label: c }))} />
      </div>
      {q.error && <ErrorBox error={q.error} retry={() => q.refetch()} />}
      {q.isLoading && <Skeleton className="h-64" />}
      {q.data && (
        <div className="grid gap-3 md:grid-cols-2">
          <BlocoDetalhe
            titulo={`${sigla(conquista.clubeId)} ${conquista.casa ? "em casa" : "fora"} · conquistou`}
            resumo={conquista}
            d={q.data.conquista}
            coluna={coluna}
            metrica={metrica}
            nomes={q.data.nomes}
            clubes={clubes}
          />
          <BlocoDetalhe
            titulo={`${sigla(cede.clubeId)} ${cede.casa ? "em casa" : "fora"} · cedeu`}
            resumo={cede}
            d={q.data.cede}
            coluna={coluna}
            metrica={metrica}
            nomes={q.data.nomes}
            clubes={clubes}
          />
        </div>
      )}
    </Sheet>
  );
}

type BlocoDet = Awaited<ReturnType<typeof fetchConquistaCedeDetalhe>>["conquista"];

function BlocoDetalhe({
  titulo,
  resumo,
  d,
  coluna,
  metrica,
  nomes,
  clubes,
}: {
  titulo: string;
  resumo: BlocoPos;
  d: BlocoDet;
  coluna: ColunaPos;
  metrica: MetricaPos;
  nomes: Record<number, string>;
  clubes: Record<number, Club>;
}) {
  const sigla = (id: number) => clubes[id]?.abreviacao ?? `#${id}`;
  const s = resumo.cols[coluna];
  const m = media(s, metrica);
  const linhas: ReactNode[] = d.jogos.map((j) => {
    const atu = j.atuacoes.filter((a) => a.cols.includes(coluna)).map((a) => ({ ...a, v: valorMetrica(a.scout, a.pontos, metrica) }));
    atu.sort((a, b) => b.v - a.v);
    const res = j.golsPro > j.golsContra ? "V" : j.golsPro < j.golsContra ? "D" : "E";
    const soma = atu.reduce((x, a) => x + a.v, 0);
    return (
      <li key={j.rodada} className="border-t border-[var(--color-line)] pt-2 first:border-t-0 first:pt-0">
        <div className="flex items-center gap-2 text-xs">
          <span className="w-8 text-[var(--color-ink-3)] tabular">R{j.rodada}</span>
          <span
            className={`flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold ${res === "V" ? "bg-[var(--color-good)]/20 text-[var(--color-good-ink)]" : res === "D" ? "bg-[var(--color-critical)]/20 text-[var(--color-critical-ink)]" : "bg-[var(--color-surface-1)] text-[var(--color-ink-3)]"}`}
          >
            {res}
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-1 font-semibold">
            {sigla(d.clubeId)} {j.golsPro}×{j.golsContra} <ClubBadge club={clubes[j.adversarioId]} size={13} /> {sigla(j.adversarioId)}
          </span>
          <span className="text-[var(--color-ink-3)] tabular">{atu.length ? `${formatar(soma / atu.length, metrica)}/at.` : "—"}</span>
        </div>
        {atu.length > 0 ? (
          <ul className="mt-1 flex flex-wrap gap-1 pl-10">
            {atu.map((a) => (
              <li key={a.atletaId} className="rounded-md bg-[var(--color-surface-1)] px-1.5 py-0.5 text-[11px]">
                {nomes[a.atletaId] ?? a.atletaId} <b className="tabular">{metrica === "pontos" ? fmt1(a.v) : a.v}</b>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 pl-10 text-[11px] text-[var(--color-ink-3)]">Nenhum atleta dessa posição entrou em campo.</p>
        )}
      </li>
    );
  });
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] p-2.5">
      <div className="mb-2 flex items-center gap-2">
        <ClubBadge club={clubes[d.clubeId]} size={20} />
        <span className="flex-1 text-xs font-semibold">{titulo}</span>
        <span className="font-display text-lg font-extrabold tabular">{m == null ? "—" : formatar(m, metrica)}</span>
      </div>
      {!d.jogos.length ? <p className="text-xs text-[var(--color-ink-3)]">Sem jogos nesse mando ainda.</p> : <ul className="space-y-2">{linhas}</ul>}
      {s.n > 0 && (
        <p className="mt-2 border-t border-[var(--color-line)] pt-2 text-[11px] text-[var(--color-ink-3)]">
          Soma {formatar(s[metrica], metrica)} ÷ {s.n} {s.n === 1 ? "atuação" : "atuações"} = <b className="text-[var(--color-ink)]">{formatar(m!, metrica)}</b> por atleta
        </p>
      )}
    </div>
  );
}
