import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, House, MapPin } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { LadoTimes, LinhaTimes } from "../../engine/cruzamento";
import { DEF_POR_CODIGO, type CruzScout } from "../../engine/scoutDefs";
import type { Club } from "../../engine/types";
import { fmt1 } from "../../lib/format";
import { KEYS, useLocal } from "../../lib/storage";
import { fetchCruzamentoTimes, type CruzamentoOpcoes } from "../../server/fnsCruzamento";
import { Card, ClubBadge, ErrorBox, Seg, Skeleton } from "../ui";

/** Scouts na ordem de uso (os mais procurados primeiro). */
const CHIPS: Array<{ codigo: CruzScout; rotulo: string }> = [
  { codigo: "G", rotulo: "Gols" },
  { codigo: "A", rotulo: "Assistências" },
  { codigo: "GA", rotulo: "Participações" },
  { codigo: "FIN", rotulo: "Finalizações" },
  { codigo: "DS", rotulo: "Desarmes" },
  { codigo: "DE", rotulo: "Defesas" },
  { codigo: "SG", rotulo: "Sem sofrer gol" },
  { codigo: "FS", rotulo: "Faltas sofridas" },
  { codigo: "FD", rotulo: "Fin. defendidas" },
  { codigo: "FF", rotulo: "Fin. para fora" },
  { codigo: "FT", rotulo: "Fin. na trave" },
  { codigo: "FC", rotulo: "Faltas cometidas" },
  { codigo: "CA", rotulo: "Cartões amarelos" },
  { codigo: "GS", rotulo: "Gols sofridos" },
  { codigo: "PS", rotulo: "Pênaltis sofridos" },
  { codigo: "I", rotulo: "Impedimentos" },
  { codigo: "CV", rotulo: "Cartões vermelhos" },
  { codigo: "PC", rotulo: "Pênaltis cometidos" },
  { codigo: "DP", rotulo: "Defesas de pênalti" },
  { codigo: "PP", rotulo: "Pênaltis perdidos" },
  { codigo: "GC", rotulo: "Gols contra" },
];

type SetorUi = "time" | "1" | "2" | "3" | "4" | "5" | "LE" | "LD";
const SETORES: Array<{ value: SetorUi; rotulo: string; plural: string }> = [
  { value: "5", rotulo: "Atacantes", plural: "atacantes" },
  { value: "4", rotulo: "Meias", plural: "meias" },
  { value: "3", rotulo: "Zagueiros", plural: "zagueiros" },
  { value: "2", rotulo: "Laterais", plural: "laterais" },
  { value: "LE", rotulo: "Laterais esquerdos", plural: "laterais esquerdos" },
  { value: "LD", rotulo: "Laterais direitos", plural: "laterais direitos" },
  { value: "1", rotulo: "Goleiros", plural: "goleiros" },
  { value: "time", rotulo: "Time inteiro", plural: "time inteiro" },
];

interface Filtros {
  scout: CruzScout;
  setor: SetorUi;
  recorte: "3" | "5" | "10" | "todos";
  lado: "mandantes" | "visitantes";
  valor: "total" | "media";
  ordem: "rodada" | "conquistado" | "cedido" | "soma";
}
const PADRAO: Filtros = { scout: "G", setor: "5", recorte: "5", lado: "mandantes", valor: "total", ordem: "rodada" };

/** Posição que faz sentido para o scout (defesas só de goleiro, por exemplo). */
function setorValido(scout: CruzScout, setor: SetorUi): SetorUi {
  if (scout === "SG" || setor === "time") return setor;
  const pos = DEF_POR_CODIGO.get(scout)?.posicoes ?? [];
  const num = setor === "LE" || setor === "LD" ? 2 : Number(setor);
  if (pos.includes(num as 1)) return setor;
  return pos.includes(5) ? "5" : pos.includes(1) ? "1" : "time";
}

/** Cor de fundo da célula: um tom só, do fraco (menor) ao forte (maior incidência). */
const fundo = (t: number) => ({ background: `rgb(34 197 94 / ${(0.06 + 0.42 * t).toFixed(3)})`, borderColor: `rgb(34 197 94 / ${(0.15 + 0.45 * t).toFixed(3)})` });

/**
 * Cruzamento por times: em cada jogo da rodada, o que o setor do time analisado fez no
 * mesmo mando (Conquistado) × o que o adversário permitiu a esse setor no mando oposto (Cedido).
 */
export function PorTimes({ o, clubes, rodada, setRodada }: { o: CruzamentoOpcoes; clubes: Record<number, Club>; rodada: number; setRodada: (r: number) => void }) {
  const [salvos, setSalvos] = useLocal<Filtros>(KEYS.cruzamentoTimes, PADRAO);
  const f = { ...PADRAO, ...salvos };
  const set = (p: Partial<Filtros>) => setSalvos((s) => ({ ...PADRAO, ...s, ...p }));
  const setor = setorValido(f.scout, f.setor);
  const [fora, setFora] = useState<Set<number>>(new Set());
  const [aberta, setAberta] = useState<number | null>(null);
  useEffect(() => setFora(new Set()), [rodada]);
  const params = { temporada: o.atual ? undefined : o.temporada, rodada, scout: f.scout, setor, recorte: f.recorte === "todos" ? undefined : Number(f.recorte), lado: f.lado };
  const q = useQuery({ queryKey: ["cruz-times", params], queryFn: () => fetchCruzamentoTimes({ data: params }), placeholderData: keepPreviousData, staleTime: 5 * 60_000 });
  const r = q.data;
  const def = DEF_POR_CODIGO.get(f.scout)!;
  const nomeSetor = f.scout === "SG" ? "por jogo" : SETORES.find((s) => s.value === setor)!.rotulo;
  const sigla = (id: number) => clubes[id]?.abreviacao ?? `#${id}`;
  const mandoTime = f.lado === "mandantes" ? "em casa" : "fora";
  const mandoAdv = f.lado === "mandantes" ? "fora" : "em casa";
  const janela = f.recorte === "todos" ? "todos os jogos" : `últimos ${f.recorte} jogos`;

  const linhas = useMemo(() => {
    const ls = (r?.linhas ?? []).filter((l) => !fora.has(l.matchId));
    const v = (x: LadoTimes) => (f.valor === "total" ? x.total : x.media);
    if (f.ordem === "conquistado") return [...ls].sort((a, b) => v(b.conquistado) - v(a.conquistado));
    if (f.ordem === "cedido") return [...ls].sort((a, b) => v(b.cedido) - v(a.cedido));
    if (f.ordem === "soma") return [...ls].sort((a, b) => v(b.conquistado) + v(b.cedido) - v(a.conquistado) - v(a.cedido));
    return ls;
  }, [r, fora, f.ordem, f.valor]);
  const maximo = Math.max(1e-9, ...linhas.flatMap((l) => (f.valor === "total" ? [l.conquistado.total, l.cedido.total] : [l.conquistado.media, l.cedido.media])));
  const recorteN = f.recorte === "todos" ? null : Number(f.recorte);

  return (
    <div className="space-y-4">
      <Card className="p-3 sm:p-4">
        <div className="mb-2 text-[11px] font-semibold tracking-wide text-[var(--color-ink-3)] uppercase">Escolha o scout</div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none" role="group" aria-label="Scout">
          {CHIPS.map((c) => (
            <button
              key={c.codigo}
              type="button"
              aria-pressed={f.scout === c.codigo}
              onClick={() => set({ scout: c.codigo })}
              className={`flex shrink-0 items-center gap-2 rounded-xl border px-2.5 py-2 text-xs font-semibold transition-colors ${
                f.scout === c.codigo ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-[#1a0a00]" : "border-[var(--color-line)] text-[var(--color-ink-2)] hover:border-[var(--color-ink-3)]"
              }`}
            >
              <span className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] ${f.scout === c.codigo ? "bg-black/15" : "bg-[var(--color-surface-1)]"}`}>{c.codigo === "GA" ? "G+A" : c.codigo}</span>
              {c.rotulo}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold tracking-wide text-[var(--color-ink-3)] uppercase">Posição analisada</span>
            <select className="input" value={setor} onChange={(e) => set({ setor: e.target.value as SetorUi })} disabled={f.scout === "SG"} aria-label="Posição analisada">
              {SETORES.map((s) => (
                <option key={s.value} value={s.value} disabled={setorValido(f.scout, s.value) !== s.value}>
                  {s.rotulo}
                </option>
              ))}
            </select>
            {f.scout === "SG" && <span className="mt-1 block text-[11px] text-[var(--color-ink-3)]">SG conta jogos: vale para goleiro, laterais e zagueiros.</span>}
          </label>
          <div>
            <span className="mb-1 block text-[11px] font-semibold tracking-wide text-[var(--color-ink-3)] uppercase">Recorte</span>
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
          <div>
            <span className="mb-1 block text-[11px] font-semibold tracking-wide text-[var(--color-ink-3)] uppercase">Quem analisar</span>
            <Seg
              label="Quem analisar"
              value={f.lado}
              onChange={(v) => set({ lado: v })}
              options={[
                {
                  value: "mandantes",
                  label: (
                    <span className="flex items-center gap-1">
                      <House size={13} aria-hidden /> Mandantes
                    </span>
                  ),
                },
                {
                  value: "visitantes",
                  label: (
                    <span className="flex items-center gap-1">
                      <MapPin size={13} aria-hidden /> Visitantes
                    </span>
                  ),
                },
              ]}
            />
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold tracking-wide text-[var(--color-ink-3)] uppercase">Rodada</span>
            <select className="input" value={rodada} onChange={(e) => setRodada(Number(e.target.value))} aria-label="Rodada">
              {Array.from({ length: Math.max(0, (o.atual ? o.rodadaAtual : o.rodadaAtual - 1) - 1) }, (_, i) => i + 2)
                .reverse()
                .map((x) => (
                  <option key={x} value={x}>
                    Rodada {x}
                    {o.atual && x === o.rodadaAtual ? " (próxima)" : " (já jogada: com o resultado)"}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </Card>

      {q.error && <ErrorBox error={q.error} retry={() => q.refetch()} />}
      {q.isLoading && <Skeleton className="h-96" />}

      {r && (
        <>
          <Card className="p-3 sm:p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-semibold tracking-wide text-[var(--color-ink-3)] uppercase">Partidas exibidas</div>
                <div className="text-xs text-[var(--color-ink-3)]">
                  {r.partidas.length - fora.size} de {r.partidas.length} confrontos selecionados
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn btn-ghost px-3 py-1 text-xs" onClick={() => setFora(new Set())} disabled={!fora.size}>
                  Todas
                </button>
                <button type="button" className="btn btn-ghost px-3 py-1 text-xs" onClick={() => setFora(new Set(r.partidas.map((p) => p.matchId)))} disabled={fora.size === r.partidas.length}>
                  Limpar
                </button>
              </div>
            </div>
            {!r.partidas.length ? (
              <p className="py-4 text-center text-sm text-[var(--color-ink-3)]">Sem jogos cadastrados nesta rodada.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
                {r.partidas.map((p) => {
                  const marcado = !fora.has(p.matchId);
                  return (
                    <button
                      key={p.matchId}
                      type="button"
                      aria-pressed={marcado}
                      onClick={() =>
                        setFora((s) => {
                          const n = new Set(s);
                          if (n.has(p.matchId)) n.delete(p.matchId);
                          else n.add(p.matchId);
                          return n;
                        })
                      }
                      className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors ${marcado ? "border-[var(--color-good)]/50 bg-[var(--color-good)]/10" : "border-[var(--color-line)] opacity-60"}`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${marcado ? "border-[var(--color-good)] bg-[var(--color-good)] text-[#06240f]" : "border-[var(--color-line-strong)]"}`}
                      >
                        {marcado && <Check size={12} strokeWidth={3} aria-hidden />}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1 text-sm font-bold">
                          <ClubBadge club={clubes[p.casaId]} size={16} /> {sigla(p.casaId)}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-[var(--color-ink-3)]">
                          x <ClubBadge club={clubes[p.foraId]} size={12} /> {sigla(p.foraId)}
                          {p.golsCasa != null && p.golsFora != null && (
                            <span className="tabular">
                              {" "}
                              · {p.golsCasa}×{p.golsFora}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-line)] p-3 sm:p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-[var(--color-brand)]/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-[var(--color-brand)] uppercase">{nomeSetor}</span>
                  <span className="font-display text-base font-bold">
                    {def.nome === "Finalizações" ? "Finalizações" : (CHIPS.find((c) => c.codigo === f.scout)?.rotulo ?? def.nome)} · {janela}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--color-ink-3)]">
                  {f.scout === "SG"
                    ? `Jogos sem sofrer gol do ${f.lado === "mandantes" ? "mandante em casa" : "visitante fora"} × jogos em que o adversário ${mandoAdv} não marcou.`
                    : `Conquistado pelo ${f.lado === "mandantes" ? "mandante em casa" : "visitante fora"} × cedido pelo adversário ${mandoAdv}.`}
                  {r.passada && " Rodada já jogada: a coluna Real mostra o que aconteceu."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Seg
                  label="Mostrar"
                  value={f.valor}
                  onChange={(v) => set({ valor: v })}
                  options={[
                    { value: "total", label: "Total" },
                    { value: "media", label: "Por jogo" },
                  ]}
                />
                <select className="input h-9 w-auto py-1 text-xs" value={f.ordem} onChange={(e) => set({ ordem: e.target.value as Filtros["ordem"] })} aria-label="Ordenar">
                  <option value="rodada">Ordem dos jogos</option>
                  <option value="conquistado">Maior conquistado</option>
                  <option value="cedido">Maior cedido</option>
                  <option value="soma">Maior soma</option>
                </select>
                <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-ink-3)]" aria-hidden>
                  menor
                  <span className="h-2 w-14 rounded-full" style={{ background: "linear-gradient(90deg, rgb(34 197 94 / 0.08), rgb(34 197 94 / 0.5))" }} />
                  maior incidência
                </span>
              </div>
            </div>

            {!linhas.length ? (
              <p className="py-8 text-center text-sm text-[var(--color-ink-3)]">{fora.size ? "Nenhuma partida selecionada." : "Sem jogos para cruzar nesta rodada."}</p>
            ) : (
              <div>
                <div className="grid grid-cols-[24px_1.2fr_1fr_1fr_1.2fr] gap-2 px-3 pt-3 pb-1 text-[10px] font-semibold tracking-wide text-[var(--color-ink-3)] uppercase sm:grid-cols-[32px_1.4fr_1fr_1fr_1.4fr] sm:px-4">
                  <span>#</span>
                  <span className="truncate">
                    <span className="sm:hidden">Time</span>
                    <span className="hidden sm:inline">Time analisado</span>
                  </span>
                  <span className="text-center">Conquistado</span>
                  <span className="text-center">Cedido</span>
                  <span className="text-right">Adversário</span>
                </div>
                <ul className="divide-y divide-[var(--color-line)]">
                  {linhas.map((l, i) => (
                    <Linha
                      key={l.matchId}
                      i={i}
                      l={l}
                      clubes={clubes}
                      valor={f.valor}
                      maximo={maximo}
                      recorte={recorteN}
                      mandoTime={mandoTime}
                      mandoAdv={mandoAdv}
                      sg={f.scout === "SG"}
                      nomes={r.nomes}
                      aberta={aberta === l.matchId}
                      onAbrir={() => setAberta((a) => (a === l.matchId ? null : l.matchId))}
                      passada={r.passada}
                    />
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="p-3">
              <div className="text-sm font-semibold">Conquistado</div>
              <p className="text-xs text-[var(--color-ink-3)]">
                {f.scout === "SG"
                  ? `Jogos sem sofrer gol do time analisado ${mandoTime}, nos ${janela}.`
                  : `Total de ${def.nome.toLowerCase()} feito pelos ${SETORES.find((s) => s.value === setor)!.plural} do time analisado ${mandoTime}, nos ${janela} dele nesse mando.`}
              </p>
            </Card>
            <Card className="p-3">
              <div className="text-sm font-semibold">Cedido</div>
              <p className="text-xs text-[var(--color-ink-3)]">
                {f.scout === "SG"
                  ? `Jogos em que o adversário, jogando ${mandoAdv}, não marcou gol: quem o enfrentou ficou com o SG.`
                  : `Total que o adversário permitiu aos ${SETORES.find((s) => s.value === setor)!.plural} de quem o enfrentou, nos ${janela} dele ${mandoAdv}.`}{" "}
                Toque num jogo para ver de onde sai cada número.
              </p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Celula({ x, valor, maximo, recorte }: { x: LadoTimes; valor: "total" | "media"; maximo: number; recorte: number | null }) {
  const v = valor === "total" ? x.total : x.media;
  const curta = recorte != null && x.jogos < recorte;
  return (
    <div className="mx-auto flex w-full max-w-28 flex-col items-center rounded-xl border px-2 py-1.5" style={fundo(x.jogos ? v / maximo : 0)}>
      <span className="font-display text-lg leading-tight font-bold tabular">{x.jogos ? (valor === "total" ? v : fmt1(v)) : "—"}</span>
      <span
        className={`text-[10px] ${curta ? "text-[var(--color-warning)]" : "text-[var(--color-ink-3)]"}`}
        title={curta ? "Menos jogos que o recorte: o time não tem tantos jogos nesse mando" : undefined}
      >
        {x.jogos} {x.jogos === 1 ? "jogo" : "jogos"}
        {valor === "total" && x.jogos ? <span className="hidden sm:inline"> · {fmt1(x.media)}/j</span> : ""}
      </span>
    </div>
  );
}

function Linha({
  i,
  l,
  clubes,
  valor,
  maximo,
  recorte,
  mandoTime,
  mandoAdv,
  sg,
  nomes,
  aberta,
  onAbrir,
  passada,
}: {
  i: number;
  l: LinhaTimes;
  clubes: Record<number, Club>;
  valor: "total" | "media";
  maximo: number;
  recorte: number | null;
  mandoTime: string;
  mandoAdv: string;
  sg: boolean;
  nomes: Record<number, string>;
  aberta: boolean;
  onAbrir: () => void;
  passada: boolean;
}) {
  const sigla = (id: number) => clubes[id]?.abreviacao ?? `#${id}`;
  const IconeTime = mandoTime === "em casa" ? House : MapPin;
  const IconeAdv = mandoAdv === "em casa" ? House : MapPin;
  return (
    <li>
      <button
        type="button"
        onClick={onAbrir}
        aria-expanded={aberta}
        className="grid w-full grid-cols-[24px_1.2fr_1fr_1fr_1.2fr] items-center gap-2 px-3 py-2.5 text-left hover:bg-[var(--color-surface-1)] sm:grid-cols-[32px_1.4fr_1fr_1fr_1.4fr] sm:px-4"
      >
        <span className="text-xs text-[var(--color-ink-3)] tabular">{String(i + 1).padStart(2, "0")}</span>
        <span className="flex min-w-0 items-center gap-2">
          <ClubBadge club={clubes[l.timeId]} size={30} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{sigla(l.timeId)}</span>
            <span className="flex items-center gap-1 text-[10px] whitespace-nowrap text-[var(--color-ink-3)] uppercase">
              <IconeTime size={11} aria-hidden /> <span className="sm:hidden">{mandoTime === "em casa" ? "casa" : "fora"}</span>
              <span className="hidden sm:inline">{mandoTime}</span>
            </span>
            {passada && l.real !== undefined && (
              <span className="block text-[10px] text-[var(--color-ink-2)]">
                Real: <b className="text-[var(--color-ink)]">{l.real == null ? "—" : sg ? (l.real ? "não sofreu gol" : "sofreu gol") : l.real}</b>
              </span>
            )}
          </span>
        </span>
        <Celula x={l.conquistado} valor={valor} maximo={maximo} recorte={recorte} />
        <Celula x={l.cedido} valor={valor} maximo={maximo} recorte={recorte} />
        <span className="flex min-w-0 items-center justify-end gap-2 text-right">
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{sigla(l.adversarioId)}</span>
            <span className="flex items-center justify-end gap-1 text-[10px] whitespace-nowrap text-[var(--color-ink-3)] uppercase">
              <IconeAdv size={11} aria-hidden /> <span className="sm:hidden">{mandoAdv === "em casa" ? "casa" : "fora"}</span>
              <span className="hidden sm:inline">{mandoAdv}</span>
            </span>
          </span>
          <ClubBadge club={clubes[l.adversarioId]} size={30} />
          <ChevronDown size={14} className={`hidden shrink-0 text-[var(--color-ink-3)] transition-transform sm:block ${aberta ? "rotate-180" : ""}`} aria-hidden />
        </span>
      </button>
      {aberta && (
        <div className="grid gap-3 bg-[var(--color-surface-1)] px-3 py-3 sm:grid-cols-2 sm:px-4">
          <Detalhe titulo={`${sigla(l.timeId)} ${mandoTime}: conquistado`} x={l.conquistado} clubes={clubes} nomes={nomes} sg={sg} tipo="conquistado" />
          <Detalhe titulo={`${sigla(l.adversarioId)} ${mandoAdv}: cedido`} x={l.cedido} clubes={clubes} nomes={nomes} sg={sg} tipo="cedido" />
        </div>
      )}
    </li>
  );
}

/** De onde sai cada número: jogo a jogo, com os atletas que fizeram o scout. */
function Detalhe({ titulo, x, clubes, nomes, sg, tipo }: { titulo: string; x: LadoTimes; clubes: Record<number, Club>; nomes: Record<number, string>; sg: boolean; tipo: "conquistado" | "cedido" }) {
  const sigla = (id: number) => clubes[id]?.abreviacao ?? `#${id}`;
  return (
    <div>
      <div className="mb-1 text-xs font-semibold">
        {titulo} · {x.total} em {x.jogos} {x.jogos === 1 ? "jogo" : "jogos"}
      </div>
      {!x.lista.length ? (
        <p className="text-xs text-[var(--color-ink-3)]">Sem jogos nesse mando ainda.</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {x.lista.map((j) => (
            <li key={j.rodada} className="flex gap-2">
              <span className="w-9 shrink-0 text-[var(--color-ink-3)] tabular">R{j.rodada}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1">
                  vs <ClubBadge club={clubes[j.adversarioId]} size={13} /> {sigla(j.adversarioId)}
                  <span className="text-[var(--color-ink-3)] tabular">
                    ({j.golsPro}×{j.golsContra})
                  </span>
                </span>
                {!sg && j.atletas.length > 0 && (
                  <span className="block text-[var(--color-ink-3)]">
                    {j.atletas.map((a) => `${nomes[a.atletaId] ?? a.atletaId} ${a.valor}`).join(" · ")}
                    {tipo === "cedido" ? ` (${sigla(j.adversarioId)})` : ""}
                  </span>
                )}
              </span>
              <span className="w-6 shrink-0 text-right font-bold tabular">{j.valor}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
