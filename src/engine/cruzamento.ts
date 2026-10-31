/**
 * Cruzamento de Scout por times, jogo a jogo da rodada.
 *
 * Para cada partida da rodada analisada:
 *  - Conquistado: o que a posição escolhida do time analisado fez nos últimos N jogos
 *    dele no MESMO mando desta partida;
 *  - Cedido: o que o adversário permitiu a essa posição nos últimos N jogos dele no
 *    mando OPOSTO.
 * Tudo vem do histórico real (scouts por jogo das rodadas encerradas); nada é estimado.
 */
import { buildContextIndex } from "./cedencia";
import { valorScout, type CruzScout } from "./scoutDefs";
import type { PositionId, Scouts } from "./rules";
import type { LadoLateral, Match, PlayerRound, SeasonData } from "./types";

export interface Linha {
  atletaId: number;
  rodada: number;
  clubeId: number;
  opp: number;
  casa: boolean;
  pos: PositionId;
  pontos: number;
  scout: Scouts;
  golsPro: number | null;
  golsContra: number | null;
  lado?: LadoLateral;
}

export interface JogoClube {
  rodada: number;
  opp: number;
  casa: boolean;
  golsPro: number;
  golsContra: number;
}

export interface BaseCruzamento {
  temporada: number;
  /** a projeção é para esta rodada; o histórico usa só rodadas anteriores */
  rodadaAlvo: number;
  linhas: Linha[];
  porAtleta: Map<number, Linha[]>;
  /** jogos com placar de cada clube, do mais recente para o mais antigo */
  jogosClube: Map<number, JogoClube[]>;
  matches: Match[];
  memo: Map<string, unknown>;
}

type DadosBase = Pick<SeasonData, "temporada" | "history" | "matches"> & Partial<Pick<SeasonData, "lados" | "ladosJogo">>;

/** Monta o histórico até a rodada anterior à `rodadaAlvo` (nada de jogo futuro ou parcial). */
export function prepararBase(data: DadosBase, rodadaAlvo: number): BaseCruzamento {
  const ctx = buildContextIndex(data.matches);
  const placar = new Map<string, { pro: number; contra: number }>();
  const jogosClube = new Map<number, JogoClube[]>();
  for (const m of data.matches) {
    if (m.rodada >= rodadaAlvo || m.golsCasa == null || m.golsFora == null) continue;
    placar.set(`${m.rodada}:${m.casaId}`, { pro: m.golsCasa, contra: m.golsFora });
    placar.set(`${m.rodada}:${m.foraId}`, { pro: m.golsFora, contra: m.golsCasa });
    for (const [c, opp, casa, pro, contra] of [
      [m.casaId, m.foraId, true, m.golsCasa, m.golsFora],
      [m.foraId, m.casaId, false, m.golsFora, m.golsCasa],
    ] as const) {
      const l = jogosClube.get(c) ?? [];
      l.push({ rodada: m.rodada, opp, casa, golsPro: pro, golsContra: contra });
      jogosClube.set(c, l);
    }
  }
  for (const l of jogosClube.values()) l.sort((a, b) => b.rodada - a.rodada);
  const linhas: Linha[] = [];
  const porAtleta = new Map<number, Linha[]>();
  for (const pr of data.history) {
    if (pr.rodada >= rodadaAlvo) continue;
    const g = ctx.get(`${pr.rodada}:${pr.clubeId}`);
    if (!g) continue;
    const pl = placar.get(`${pr.rodada}:${pr.clubeId}`);
    const lado = pr.posicaoId === 2 ? (data.ladosJogo?.[`${pr.rodada}:${pr.atletaId}`] ?? data.lados?.[pr.atletaId]) : undefined;
    const l: Linha = {
      atletaId: pr.atletaId,
      rodada: pr.rodada,
      clubeId: pr.clubeId,
      opp: g.opp,
      casa: g.home,
      pos: pr.posicaoId,
      pontos: pr.pontos,
      scout: pr.scout,
      golsPro: pl?.pro ?? null,
      golsContra: pl?.contra ?? null,
      lado,
    };
    linhas.push(l);
    const lista = porAtleta.get(pr.atletaId) ?? [];
    lista.push(l);
    porAtleta.set(pr.atletaId, lista);
  }
  for (const l of porAtleta.values()) l.sort((a, b) => a.rodada - b.rodada);
  return { temporada: data.temporada, rodadaAlvo, linhas, porAtleta, jogosClube, matches: data.matches, memo: new Map() };
}

function memo<T>(base: BaseCruzamento, key: string, fn: () => T): T {
  if (base.memo.has(key)) return base.memo.get(key) as T;
  const v = fn();
  base.memo.set(key, v);
  return v;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/* ------------------------- cruzamento por times ------------------------- */

/** Setor analisado: uma posição, laterais por lado, ou o time inteiro (sem técnico). */
export type SetorTimes = "time" | 1 | 2 | 3 | 4 | 5 | "LE" | "LD";

export interface JogoTimes {
  rodada: number;
  /** quem estava do outro lado nesse jogo */
  adversarioId: number;
  casa: boolean;
  golsPro: number;
  golsContra: number;
  valor: number;
  atletas: Array<{ atletaId: number; valor: number }>;
}

export interface LadoTimes {
  total: number;
  jogos: number;
  media: number;
  lista: JogoTimes[];
}

export interface LinhaTimes {
  matchId: number;
  timeId: number;
  adversarioId: number;
  /** o time analisado joga em casa nesta partida */
  timeEmCasa: boolean;
  /** o que o setor do time analisado fez nos últimos jogos no mesmo mando */
  conquistado: LadoTimes;
  /** o que o adversário permitiu ao mesmo setor nos últimos jogos no mando oposto */
  cedido: LadoTimes;
  /** rodada passada: o que o setor do time analisado fez nesta partida */
  real?: number | null;
}

export interface OpcoesTimes {
  scout: CruzScout;
  setor: SetorTimes;
  /** últimos N jogos no mando; null = todos */
  recorte: number | null;
  lado: "mandantes" | "visitantes";
}

const doSetor = (setor: SetorTimes) => (l: Linha) =>
  setor === "time" ? l.pos !== 6 : setor === "LE" ? l.pos === 2 && l.lado === "E" : setor === "LD" ? l.pos === 2 && l.lado === "D" : l.pos === setor;

/**
 * Cruzamento por times, jogo a jogo da rodada:
 *  - Conquistado: soma do scout feita pelo setor do time analisado nos últimos N jogos
 *    dele no MESMO mando desta partida (visitante → jogos fora);
 *  - Cedido: soma do scout feita pelo mesmo setor dos times que enfrentaram o adversário,
 *    nos últimos N jogos do adversário no mando OPOSTO (adversário em casa → jogos em casa).
 * SG conta jogos: conquistado = jogos sem sofrer gol; cedido = jogos em que o adversário não marcou.
 * Jogo sem nenhum registro do time no histórico (rodada que faltou na fonte) fica fora da conta
 * e o recorte busca o jogo anterior no lugar dele.
 */
export function cruzarTimes(base: BaseCruzamento, opts: OpcoesTimes, historicoRodada?: PlayerRound[]): LinhaTimes[] {
  const noSetor = doSetor(opts.setor);
  const porJogo = memo(base, "times:porJogo", () => {
    const m = new Map<string, Linha[]>();
    for (const l of base.linhas) {
      const k = `${l.rodada}:${l.clubeId}`;
      const a = m.get(k);
      if (a) a.push(l);
      else m.set(k, [l]);
    }
    return m;
  });
  const sg = opts.scout === "SG";
  /** o que o time `quem` fez em cada jogo da lista */
  const somar = (quem: (j: JogoClube) => number, jogos: JogoClube[], semGol: (j: JogoClube) => boolean): LadoTimes => {
    const lista: JogoTimes[] = [];
    for (const j of jogos) {
      const linhas = porJogo.get(`${j.rodada}:${quem(j)}`);
      if (!linhas?.length) continue; // sem dados da fonte nesse jogo
      const doLado = linhas.filter(noSetor);
      const atletas = doLado.map((l) => ({ atletaId: l.atletaId, valor: valorScout(l.scout, opts.scout) })).filter((a) => a.valor);
      const valor = sg ? (semGol(j) ? 1 : 0) : atletas.reduce((s, a) => s + a.valor, 0);
      lista.push({ rodada: j.rodada, adversarioId: j.opp, casa: j.casa, golsPro: j.golsPro, golsContra: j.golsContra, valor, atletas: sg ? [] : atletas.sort((a, b) => b.valor - a.valor) });
    }
    const total = lista.reduce((s, x) => s + x.valor, 0);
    return { total, jogos: lista.length, media: lista.length ? r3(total / lista.length) : 0, lista };
  };
  /** últimos N jogos do clube no mando, contando só jogos com dados da fonte (o que faltar é trocado pelo anterior) */
  const ultimos = (clube: number, casa: boolean, quem: (j: JogoClube) => number) => {
    const js = (base.jogosClube.get(clube) ?? []).filter((j) => j.casa === casa && porJogo.get(`${j.rodada}:${quem(j)}`)?.length);
    return opts.recorte ? js.slice(0, opts.recorte) : js;
  };
  const out: LinhaTimes[] = [];
  for (const m of base.matches.filter((x) => x.rodada === base.rodadaAlvo).sort((a, b) => (a.data ?? "").localeCompare(b.data ?? "") || a.id - b.id)) {
    const emCasa = opts.lado === "mandantes";
    const time = emCasa ? m.casaId : m.foraId;
    const adv = emCasa ? m.foraId : m.casaId;
    // conquistado: jogos do time no mesmo mando; o próprio time é quem faz o scout
    const conquistado = somar(
      () => time,
      ultimos(time, emCasa, () => time),
      (j) => j.golsContra === 0,
    );
    // cedido: jogos do adversário no mando oposto; quem faz o scout é o time que o enfrentou
    const cedido = somar(
      (j) => j.opp,
      ultimos(adv, !emCasa, (j) => j.opp),
      (j) => j.golsPro === 0,
    );
    let real: number | null | undefined;
    if (historicoRodada) {
      const linhas = historicoRodada.filter((h) => h.clubeId === time);
      if (!linhas.length) real = null;
      else if (sg) {
        const gc = emCasa ? m.golsFora : m.golsCasa;
        real = gc == null ? null : gc === 0 ? 1 : 0;
      } else {
        const lado = (h: PlayerRound) => (h.posicaoId === 2 ? base.porAtleta.get(h.atletaId)?.find((l) => l.lado)?.lado : undefined);
        real = linhas.filter((h) => noSetor({ pos: h.posicaoId, lado: lado(h) } as Linha)).reduce((s, h) => s + valorScout(h.scout, opts.scout), 0);
      }
    }
    out.push({ matchId: m.id, timeId: time, adversarioId: adv, timeEmCasa: emCasa, conquistado, cedido, real });
  }
  return out;
}
