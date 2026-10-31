import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Flame, House, Info, MapPin, ShieldAlert, Swords, Target } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { LadoTimes, LinhaTimes } from "../../engine/cruzamento";
import { DEF_POR_CODIGO, type CruzScout } from "../../engine/scoutDefs";
import type { Club } from "../../engine/types";
import { fmt1, pct } from "../../lib/format";
import { KEYS, useLocal } from "../../lib/storage";
import { fetchCruzamentoTimes, type CruzamentoOpcoes } from "../../server/fnsCruzamento";
import { Alert, Card, ClubBadge, ErrorBox, Seg, Skeleton } from "../ui";

/** Os scouts mais usados ficam à vista; o resto vai no menu "Mais scouts". */
const PRINCIPAIS: Array<{ codigo: CruzScout; rotulo: string }> = [
  { codigo: "G", rotulo: "Gols" },
  { codigo: "A", rotulo: "Assistências" },
  { codigo: "GA", rotulo: "Participações" },
  { codigo: "FIN", rotulo: "Finalizações" },
  { codigo: "DS", rotulo: "Desarmes" },
  { codigo: "DE", rotulo: "Defesas" },
  { codigo: "SG", rotulo: "Sem sofrer gol" },
  { codigo: "FS", rotulo: "Faltas sofridas" },
];
const OUTROS: Array<{ codigo: CruzScout; rotulo: string }> = [
  { codigo: "FD", rotulo: "Finalizações defendidas" },
  { codigo: "FF", rotulo: "Finalizações para fora" },
  { codigo: "FT", rotulo: "Finalizações na trave" },
  { codigo: "FC", rotulo: "Faltas cometidas" },
  { codigo: "CA", rotulo: "Cartões amarelos" },
  { codigo: "CV", rotulo: "Cartões vermelhos" },
  { codigo: "GS", rotulo: "Gols sofridos" },
  { codigo: "PS", rotulo: "Pênaltis sofridos" },
  { codigo: "PC", rotulo: "Pênaltis cometidos" },
  { codigo: "I", rotulo: "Impedimentos" },
  { codigo: "DP", rotulo: "Defesas de pênalti" },
  { codigo: "PP", rotulo: "Pênaltis perdidos" },
  { codigo: "GC", rotulo: "Gols contra" },
];
const rotuloScout = (c: CruzScout) => [...PRINCIPAIS, ...OUTROS].find((x) => x.codigo === c)?.rotulo ?? DEF_POR_CODIGO.get(c)?.nome ?? c;

type SetorUi = "time" | "1" | "2" | "3" | "4" | "5" | "LE" | "LD";
const SETORES: Array<{ value: SetorUi; rotulo: string; plural: string }> = [
  { value: "5", rotulo: "Atacantes", plural: "atacantes" },
  { value: "4", rotulo: "Meias", plural: "meias" },
  { value: "3", rotulo: "Zagueiros", plural: "zagueiros" },
  { value: "2", rotulo: "Laterais", plural: "laterais" },
  { value: "LE", rotulo: "Laterais esquerdos", plural: "laterais esquerdos" },
  { value: "LD", rotulo: "Laterais direitos", plural: "laterais direitos" },
  { value: "1", rotulo: "Goleiros", plural: "goleiros" },
  { value: "time", rotulo: "Time inteiro", plural: "jogadores" },
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

/** Intensidade da célula: um tom só, do fraco (menor) ao forte (maior incidência). */
const VERDE = "34 197 94";
const fundo = (t: number) => ({ background: `rgb(${VERDE} / ${(0.05 + 0.4 * t).toFixed(3)})`, borderColor: `rgb(${VERDE} / ${(0.14 + 0.46 * t).toFixed(3)})` });

const ROTULO = "mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[var(--color-ink-3)] uppercase";

/** grade das linhas: # · time · conquistado · × · cedido · adversário */
const GRADE = "grid grid-cols-[18px_minmax(0,1fr)_58px_10px_58px_minmax(0,1fr)] items-center gap-1.5 px-3 sm:grid-cols-[28px_minmax(0,1.3fr)_104px_14px_104px_minmax(0,1.3fr)] sm:gap-3 sm:px-4";

/**
 * Cruzamento por times: em cada jogo da rodada, o que a posição do time analisado fez no
 * mesmo mando (Conquistado) × o que o adversário permitiu a essa posição no mando oposto (Cedido).
 */
export function PorTimes({
  o,
  clubes,
  rodada,
  setRodada,
  setTemporada,
}: {
  o: CruzamentoOpcoes;
  clubes: Record<number, Club>;
  rodada: number;
  setRodada: (r: number) => void;
  setTemporada: (t: number) => void;
}) {
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
  const sg = f.scout === "SG";
  const sigla = (id: number) => clubes[id]?.abreviacao ?? `#${id}`;
  const mandoTime = f.lado === "mandantes" ? "em casa" : "fora";
  const mandoAdv = f.lado === "mandantes" ? "fora" : "em casa";
  const janela = f.recorte === "todos" ? "todos os jogos" : `últimos ${f.recorte} jogos`;
  const setorInfo = SETORES.find((s) => s.value === setor)!;
  const porLado = setor === "LE" || setor === "LD";
  const val = (x: LadoTimes) => (f.valor === "total" ? x.total : x.media);

  const linhas = useMemo(() => {
    const ls = (r?.linhas ?? []).filter((l) => !fora.has(l.matchId));
    if (f.ordem === "conquistado") return [...ls].sort((a, b) => val(b.conquistado) - val(a.conquistado));
    if (f.ordem === "cedido") return [...ls].sort((a, b) => val(b.cedido) - val(a.cedido));
    if (f.ordem === "soma") return [...ls].sort((a, b) => val(b.conquistado) + val(b.cedido) - val(a.conquistado) - val(a.cedido));
    return ls;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, fora, f.ordem, f.valor]);
  const maximo = Math.max(1e-9, ...linhas.flatMap((l) => [val(l.conquistado), val(l.cedido)]));
  const recorteN = f.recorte === "todos" ? null : Number(f.recorte);

  // destaques: sempre pela média por jogo (justo quando os times têm números de jogos diferentes)
  const destaques = useMemo(() => {
    const comJogos = linhas.filter((l) => l.conquistado.jogos && l.cedido.jogos);
    if (!comJogos.length) return null;
    const max = (fn: (l: LinhaTimes) => number) => comJogos.reduce((a, b) => (fn(b) > fn(a) ? b : a));
    return { conquista: max((l) => l.conquistado.media), cede: max((l) => l.cedido.media), cruzamento: max((l) => l.conquistado.media + l.cedido.media) };
  }, [linhas]);

  const abrir = (matchId: number) => {
    setAberta(matchId);
    requestAnimationFrame(() => document.getElementById(`cruz-jogo-${matchId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden p-0">
        <div className="space-y-4 p-3 sm:p-4">
          <div>
            <div className={ROTULO}>
              <Target size={13} aria-hidden /> Scout
            </div>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Scout">
              {PRINCIPAIS.map((c) => (
                <button
                  key={c.codigo}
                  type="button"
                  aria-pressed={f.scout === c.codigo}
                  onClick={() => set({ scout: c.codigo })}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    f.scout === c.codigo
                      ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-[#1a0a00]"
                      : "border-[var(--color-line)] text-[var(--color-ink-2)] hover:border-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
                  }`}
                >
                  <span className={`font-mono text-[10px] ${f.scout === c.codigo ? "opacity-70" : "text-[var(--color-ink-3)]"}`}>{c.codigo === "GA" ? "G+A" : c.codigo}</span>
                  {c.rotulo}
                </button>
              ))}
              <select
                className={`input h-[34px] w-auto rounded-full py-0 text-xs ${OUTROS.some((x) => x.codigo === f.scout) ? "border-[var(--color-brand)] font-semibold text-[var(--color-brand)]" : ""}`}
                value={OUTROS.some((x) => x.codigo === f.scout) ? f.scout : ""}
                onChange={(e) => e.target.value && set({ scout: e.target.value as CruzScout })}
                aria-label="Mais scouts"
              >
                <option value="">Mais scouts…</option>
                {OUTROS.map((c) => (
                  <option key={c.codigo} value={c.codigo}>
                    {c.rotulo} ({c.codigo})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <label className="block min-w-0">
              <span className={ROTULO}>Posição analisada</span>
              <select className="input" value={setor} onChange={(e) => set({ setor: e.target.value as SetorUi })} disabled={sg} aria-label="Posição analisada">
                {SETORES.map((s) => (
                  <option key={s.value} value={s.value} disabled={setorValido(f.scout, s.value) !== s.value || ((s.value === "LE" || s.value === "LD") && r != null && r.ladosCobertura === 0)}>
                    {s.rotulo}
                  </option>
                ))}
              </select>
            </label>
            {o.temporadas.length > 1 && (
              <label className="block min-w-0">
                <span className={ROTULO}>Temporada</span>
                <select className="input" value={o.temporada} onChange={(e) => setTemporada(Number(e.target.value))} aria-label="Temporada">
                  {o.temporadas.map((t) => (
                    <option key={t} value={t}>
                      {t}
                      {t === o.temporadas[0] && o.atual ? " (atual)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block min-w-0">
              <span className={ROTULO}>Rodada</span>
              <select className="input" value={rodada} onChange={(e) => setRodada(Number(e.target.value))} aria-label="Rodada">
                {Array.from({ length: Math.max(0, (o.atual ? o.rodadaAtual : o.rodadaAtual - 1) - 1) }, (_, i) => i + 2)
                  .reverse()
                  .map((x) => (
                    <option key={x} value={x}>
                      Rodada {x}
                      {o.atual && x === o.rodadaAtual ? " · próxima" : " · com resultado"}
                    </option>
                  ))}
              </select>
            </label>
            <div className="min-w-0">
              <span className={ROTULO}>Recorte</span>
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
            <div className="min-w-0">
              <span className={ROTULO}>Quem analisar</span>
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
          </div>
          {sg && <p className="text-xs text-[var(--color-ink-3)]">Sem sofrer gol conta jogos (vale para goleiro, laterais e zagueiros), por isso a posição não muda o número.</p>}
          {porLado && r && r.ladosCobertura < 0.9 && (
            <Alert tone="warning">
              Só {pct(r.ladosCobertura)} das atuações de laterais têm o lado (esquerdo/direito) identificado até agora. Os totais por lado ficam abaixo do real até as escalações dos jogos serem lidas
              (Painel ADM → Laterais).
            </Alert>
          )}
        </div>

        {r && (
          <div className="border-t border-[var(--color-line)] bg-[var(--color-surface-1)] px-3 py-3 sm:px-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className={`${ROTULO} mb-0`}>
                <Swords size={13} aria-hidden /> Partidas da rodada {r.rodada}
                <span className="font-normal tracking-normal normal-case">
                  · {r.partidas.length - fora.size} de {r.partidas.length}
                </span>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-[var(--color-ink-2)] hover:text-[var(--color-ink)] disabled:opacity-40"
                  onClick={() => setFora(new Set())}
                  disabled={!fora.size}
                >
                  Todas
                </button>
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-[var(--color-ink-2)] hover:text-[var(--color-ink)] disabled:opacity-40"
                  onClick={() => setFora(new Set(r.partidas.map((p) => p.matchId)))}
                  disabled={fora.size === r.partidas.length}
                >
                  Limpar
                </button>
              </div>
            </div>
            {!r.partidas.length ? (
              <p className="py-2 text-sm text-[var(--color-ink-3)]">Sem jogos cadastrados nesta rodada.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {r.partidas.map((p) => {
                  const marcado = !fora.has(p.matchId);
                  return (
                    <button
                      key={p.matchId}
                      type="button"
                      aria-pressed={marcado}
                      aria-label={`${sigla(p.casaId)} x ${sigla(p.foraId)}`}
                      onClick={() =>
                        setFora((s) => {
                          const n = new Set(s);
                          if (n.has(p.matchId)) n.delete(p.matchId);
                          else n.add(p.matchId);
                          return n;
                        })
                      }
                      className={`flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1.5 text-xs font-semibold transition-colors ${
                        marcado
                          ? "border-[rgb(34_197_94/0.45)] bg-[rgb(34_197_94/0.12)] text-[var(--color-ink)]"
                          : "border-[var(--color-line)] text-[var(--color-ink-3)] line-through decoration-[var(--color-ink-3)]/60"
                      }`}
                    >
                      <span className={`flex h-4 w-4 items-center justify-center rounded-full ${marcado ? "bg-[rgb(34_197_94)] text-[#06240f]" : "border border-[var(--color-line-strong)]"}`}>
                        {marcado && <Check size={10} strokeWidth={3.5} aria-hidden />}
                      </span>
                      <ClubBadge club={clubes[p.casaId]} size={15} />
                      {sigla(p.casaId)}
                      <span className="font-normal text-[var(--color-ink-3)]">{p.golsCasa != null && p.golsFora != null ? `${p.golsCasa}×${p.golsFora}` : "×"}</span>
                      {sigla(p.foraId)}
                      <ClubBadge club={clubes[p.foraId]} size={15} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Card>

      {q.error && <ErrorBox error={q.error} retry={() => q.refetch()} />}
      {q.isLoading && (
        <div className="space-y-3" aria-busy="true">
          <div className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <Skeleton className="h-96" />
        </div>
      )}

      {r && destaques && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Destaque
            icone={<Flame size={15} aria-hidden />}
            titulo="Quem mais conquista"
            time={destaques.conquista.timeId}
            texto={`${sigla(destaques.conquista.timeId)} ${mandoTime}`}
            valor={fmt1(destaques.conquista.conquistado.media)}
            detalhe={`por jogo · ${destaques.conquista.conquistado.total} em ${destaques.conquista.conquistado.jogos} jogos`}
            clubes={clubes}
            onClick={() => abrir(destaques.conquista.matchId)}
          />
          <Destaque
            icone={<ShieldAlert size={15} aria-hidden />}
            titulo="Quem mais cede"
            time={destaques.cede.adversarioId}
            texto={`${sigla(destaques.cede.adversarioId)} ${mandoAdv} (vs ${sigla(destaques.cede.timeId)})`}
            valor={fmt1(destaques.cede.cedido.media)}
            detalhe={`por jogo · ${destaques.cede.cedido.total} em ${destaques.cede.cedido.jogos} jogos`}
            clubes={clubes}
            onClick={() => abrir(destaques.cede.matchId)}
          />
          <Destaque
            icone={<Swords size={15} aria-hidden />}
            titulo="Melhor cruzamento"
            time={destaques.cruzamento.timeId}
            texto={`${sigla(destaques.cruzamento.timeId)} × ${sigla(destaques.cruzamento.adversarioId)}`}
            valor={fmt1(destaques.cruzamento.conquistado.media + destaques.cruzamento.cedido.media)}
            detalhe={`soma por jogo · ${fmt1(destaques.cruzamento.conquistado.media)} conquistado + ${fmt1(destaques.cruzamento.cedido.media)} cedido`}
            clubes={clubes}
            onClick={() => abrir(destaques.cruzamento.matchId)}
          />
        </div>
      )}

      {r && (
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-end justify-between gap-3 p-3 sm:p-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-[var(--color-brand)]/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-[var(--color-brand)] uppercase">{sg ? "Por jogo" : setorInfo.rotulo}</span>
                <h3 className="font-display text-lg font-bold">
                  {rotuloScout(f.scout)} · {janela}
                </h3>
              </div>
              <p className="mt-0.5 text-xs text-[var(--color-ink-3)]">
                {sg
                  ? `Jogos sem sofrer gol do ${f.lado === "mandantes" ? "mandante em casa" : "visitante fora"} × jogos em que o adversário ${mandoAdv} não marcou.`
                  : `Conquistado pelo ${f.lado === "mandantes" ? "mandante em casa" : "visitante fora"} × cedido pelo adversário ${mandoAdv}.`}
                {r.passada ? " Rodada já jogada: “Real” é o que aconteceu na partida." : " Toque num jogo para ver de onde sai cada número."}
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
            </div>
          </div>

          {!linhas.length ? (
            <p className="border-t border-[var(--color-line)] py-10 text-center text-sm text-[var(--color-ink-3)]">
              {fora.size ? "Nenhuma partida selecionada. Toque em “Todas” acima." : "Sem jogos para cruzar nesta rodada."}
            </p>
          ) : (
            <>
              <div className={`${GRADE} border-y border-[var(--color-line)] bg-[var(--color-surface-1)] py-2 text-[10px] font-semibold tracking-wide text-[var(--color-ink-3)] uppercase`}>
                <span>#</span>
                <span>
                  <span className="sm:hidden">Time</span>
                  <span className="hidden sm:inline">Time analisado</span>
                </span>
                <span className="text-center">
                  <span className="sm:hidden">Conq.</span>
                  <span className="hidden sm:inline">Conquistado</span>
                </span>
                <span aria-hidden />
                <span className="text-center">Cedido</span>
                <span className="text-right">
                  <span className="sm:hidden">Adv.</span>
                  <span className="hidden sm:inline">Adversário</span>
                </span>
              </div>
              <ul className="divide-y divide-[var(--color-line)]">
                {linhas.map((l, i) => (
                  <LinhaJogo
                    key={l.matchId}
                    i={i}
                    l={l}
                    clubes={clubes}
                    valor={f.valor}
                    maximo={maximo}
                    recorte={recorteN}
                    mandoTime={mandoTime}
                    mandoAdv={mandoAdv}
                    sg={sg}
                    nomes={r.nomes}
                    aberta={aberta === l.matchId}
                    onAbrir={() => setAberta((a) => (a === l.matchId ? null : l.matchId))}
                    passada={r.passada}
                  />
                ))}
              </ul>
            </>
          )}

          <div className="grid gap-3 border-t border-[var(--color-line)] bg-[var(--color-surface-1)] p-3 text-xs sm:grid-cols-[1fr_1fr_auto] sm:items-center sm:p-4">
            <p className="text-[var(--color-ink-2)]">
              <b className="text-[var(--color-ink)]">Conquistado:</b>{" "}
              {sg
                ? `jogos sem sofrer gol do time analisado ${mandoTime}, nos ${janela} dele nesse mando.`
                : `total de ${rotuloScout(f.scout).toLowerCase()} dos ${setorInfo.plural} do time analisado nos ${janela} dele ${mandoTime}.`}
            </p>
            <p className="text-[var(--color-ink-2)]">
              <b className="text-[var(--color-ink)]">Cedido:</b>{" "}
              {sg ? `jogos em que o adversário, ${mandoAdv}, não marcou gol.` : `total que o adversário permitiu aos ${setorInfo.plural} de quem o enfrentou, nos ${janela} dele ${mandoAdv}.`}
            </p>
            <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-ink-3)]" aria-hidden>
              menor
              <span className="h-2 w-16 rounded-full" style={{ background: `linear-gradient(90deg, rgb(${VERDE} / 0.07), rgb(${VERDE} / 0.5))` }} />
              maior incidência
            </span>
          </div>
        </Card>
      )}
      {r && (
        <p className="flex items-start gap-1.5 text-[11px] text-[var(--color-ink-3)]">
          <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
          Fonte: pontuação oficial do Cartola, jogo a jogo, só rodadas encerradas. Jogo que faltou na fonte não conta como zero: o recorte usa o jogo anterior. Número de jogos em amarelo = o time tem
          menos jogos que o recorte nesse mando.
        </p>
      )}
    </div>
  );
}

function Destaque({
  icone,
  titulo,
  time,
  texto,
  valor,
  detalhe,
  clubes,
  onClick,
}: {
  icone: ReactNode;
  titulo: string;
  time: number;
  texto: string;
  valor: string;
  detalhe: string;
  clubes: Record<number, Club>;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="card flex items-center gap-3 p-3 text-left transition-colors hover:border-[var(--color-ink-3)]">
      <ClubBadge club={clubes[time]} size={36} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-[11px] font-semibold tracking-wide text-[var(--color-brand)] uppercase">
          {icone} {titulo}
        </span>
        <span className="block truncate text-sm font-semibold">{texto}</span>
        <span className="block truncate text-[11px] text-[var(--color-ink-3)]">{detalhe}</span>
      </span>
      <span className="font-display text-2xl font-extrabold tabular">{valor}</span>
    </button>
  );
}

function Celula({ x, valor, maximo, recorte }: { x: LadoTimes; valor: "total" | "media"; maximo: number; recorte: number | null }) {
  const v = valor === "total" ? x.total : x.media;
  const t = x.jogos ? v / maximo : 0;
  const curta = recorte != null && x.jogos < recorte;
  return (
    <div className="relative flex w-full flex-col items-center overflow-hidden rounded-xl border py-1.5" style={fundo(t)}>
      <span className="font-display text-lg leading-tight font-bold tabular sm:text-xl">{x.jogos ? (valor === "total" ? v : fmt1(v)) : "—"}</span>
      <span
        className={`text-[10px] leading-tight ${curta ? "font-semibold text-[var(--color-warning)]" : "text-[var(--color-ink-3)]"}`}
        title={curta ? "Menos jogos que o recorte: o time não tem tantos jogos nesse mando" : undefined}
      >
        {x.jogos} {x.jogos === 1 ? "jogo" : "jogos"}
        {valor === "total" && x.jogos ? <span className="hidden sm:inline"> · {fmt1(x.media)}/j</span> : null}
      </span>
      <span className="absolute bottom-0 left-0 h-[3px] rounded-r-full" style={{ width: `${Math.max(0, t) * 100}%`, background: `rgb(${VERDE})` }} aria-hidden />
    </div>
  );
}

function Mando({ casa, alinhar }: { casa: boolean; alinhar?: "direita" }) {
  const Icone = casa ? House : MapPin;
  return (
    <span className={`flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap text-[var(--color-ink-3)] uppercase ${alinhar === "direita" ? "justify-end" : ""}`}>
      <Icone size={11} aria-hidden />
      <span className="sm:hidden">{casa ? "casa" : "fora"}</span>
      <span className="hidden sm:inline">{casa ? "em casa" : "fora"}</span>
    </span>
  );
}

function LinhaJogo({
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
  return (
    <li id={`cruz-jogo-${l.matchId}`}>
      <button
        type="button"
        onClick={onAbrir}
        aria-expanded={aberta}
        className={`${GRADE} w-full py-2.5 text-left transition-colors hover:bg-[var(--color-surface-1)] ${aberta ? "bg-[var(--color-surface-1)]" : ""}`}
      >
        <span className="text-[11px] text-[var(--color-ink-3)] tabular">{String(i + 1).padStart(2, "0")}</span>
        <span className="flex min-w-0 items-center gap-2">
          <ClubBadge club={clubes[l.timeId]} size={30} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{sigla(l.timeId)}</span>
            <Mando casa={mandoTime === "em casa"} />
            {passada && l.real !== undefined && (
              <span className="mt-0.5 inline-block rounded bg-[var(--color-brand)]/15 px-1 text-[10px] font-semibold text-[var(--color-brand)]">
                Real: {l.real == null ? "—" : sg ? (l.real ? "sem gol sofrido" : "sofreu gol") : l.real}
              </span>
            )}
          </span>
        </span>
        <Celula x={l.conquistado} valor={valor} maximo={maximo} recorte={recorte} />
        <span className="text-center text-xs text-[var(--color-ink-3)]" aria-hidden>
          ×
        </span>
        <Celula x={l.cedido} valor={valor} maximo={maximo} recorte={recorte} />
        <span className="flex min-w-0 items-center justify-end gap-2 text-right">
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{sigla(l.adversarioId)}</span>
            <Mando casa={mandoAdv === "em casa"} alinhar="direita" />
          </span>
          <ClubBadge club={clubes[l.adversarioId]} size={30} />
          <ChevronDown size={14} className={`hidden shrink-0 text-[var(--color-ink-3)] transition-transform sm:block ${aberta ? "rotate-180" : ""}`} aria-hidden />
        </span>
      </button>
      {aberta && (
        <div className="grid gap-3 border-t border-[var(--color-line)] bg-[var(--color-surface-1)] px-3 py-3 sm:grid-cols-2 sm:px-4">
          <Detalhe time={l.timeId} mando={mandoTime} rotulo="conquistou" x={l.conquistado} clubes={clubes} nomes={nomes} sg={sg} />
          <Detalhe time={l.adversarioId} mando={mandoAdv} rotulo="cedeu" x={l.cedido} clubes={clubes} nomes={nomes} sg={sg} cedido />
        </div>
      )}
    </li>
  );
}

/** De onde sai cada número: jogo a jogo, com o placar e os atletas que fizeram o scout. */
function Detalhe({
  time,
  mando,
  rotulo,
  x,
  clubes,
  nomes,
  sg,
  cedido,
}: {
  time: number;
  mando: string;
  rotulo: string;
  x: LadoTimes;
  clubes: Record<number, Club>;
  nomes: Record<number, string>;
  sg: boolean;
  cedido?: boolean;
}) {
  const sigla = (id: number) => clubes[id]?.abreviacao ?? `#${id}`;
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] p-2.5">
      <div className="mb-2 flex items-center gap-2">
        <ClubBadge club={clubes[time]} size={20} />
        <span className="text-xs font-semibold">
          {sigla(time)} {mando} {rotulo}{" "}
          <b className="tabular">
            {x.total} em {x.jogos} {x.jogos === 1 ? "jogo" : "jogos"}
          </b>
        </span>
      </div>
      {!x.lista.length ? (
        <p className="text-xs text-[var(--color-ink-3)]">Sem jogos nesse mando ainda.</p>
      ) : (
        <ul className="space-y-1.5">
          {x.lista.map((j) => {
            const res = j.golsPro > j.golsContra ? "V" : j.golsPro < j.golsContra ? "D" : "E";
            return (
              <li key={j.rodada} className="flex items-start gap-2 text-xs">
                <span className="w-8 shrink-0 pt-0.5 text-[var(--color-ink-3)] tabular">R{j.rodada}</span>
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-bold ${res === "V" ? "bg-[var(--color-good)]/20 text-[var(--color-good-ink)]" : res === "D" ? "bg-[var(--color-critical)]/20 text-[var(--color-critical-ink)]" : "bg-[var(--color-surface-1)] text-[var(--color-ink-3)]"}`}
                  title={res === "V" ? `Vitória do ${sigla(time)}` : res === "D" ? `Derrota do ${sigla(time)}` : "Empate"}
                >
                  {res}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1">
                    {sigla(time)}
                    <b className="tabular">
                      {j.golsPro}×{j.golsContra}
                    </b>
                    <ClubBadge club={clubes[j.adversarioId]} size={13} /> {sigla(j.adversarioId)}
                  </span>
                  {!sg && j.atletas.length > 0 && (
                    <span className="block text-[11px] text-[var(--color-ink-3)]">
                      {j.atletas.map((a) => `${nomes[a.atletaId] ?? a.atletaId} ${a.valor}`).join(" · ")}
                      {cedido ? ` (do ${sigla(j.adversarioId)})` : ""}
                    </span>
                  )}
                </span>
                <span
                  className={`flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular ${j.valor ? "bg-[rgb(34_197_94/0.22)] text-[var(--color-ink)]" : "text-[var(--color-ink-3)]"}`}
                >
                  {j.valor}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
