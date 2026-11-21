/**
 * Campinhos (somente servidor): partidas da temporada vindas do Cartola e gols lançados
 * à mão pela equipe. As funções de servidor (fnsCampinhos.ts) validam e chamam este módulo.
 */
import { FORMAS_GOL, POSICOES_CAMPINHO, type FormaGol, type GolLancado, type PartidaCampinho, type PosCampinho } from "../engine/campinhos";
import type { Club } from "../engine/types";
import { db, emit } from "./db";
import { matchClub, norm } from "./escalacoes";

type Temporada = Awaited<ReturnType<typeof import("./season").loadSeason>>["data"];

/** Jogos do Cartola + partidas criadas à mão pela equipe na temporada. */
export function partidasDaTemporada(data: Pick<Temporada, "matches" | "temporada">): PartidaCampinho[] {
  const doCartola: PartidaCampinho[] = data.matches
    .filter((m) => m.valida !== false)
    .map((m) => ({ matchId: m.id, rodada: m.rodada, casaId: m.casaId, foraId: m.foraId, golsCasa: m.golsCasa ?? null, golsFora: m.golsFora ?? null }));
  const manuais: PartidaCampinho[] = db.partidasManuais
    .filter((p) => p.temporada === data.temporada)
    .map((p) => ({ matchId: p.matchId, rodada: p.rodada, casaId: p.casaId, foraId: p.foraId, golsCasa: p.golsCasa, golsFora: p.golsFora, manual: true }));
  return [...doCartola, ...manuais].sort((a, b) => a.rodada - b.rodada || Number(Boolean(a.manual)) - Number(Boolean(b.manual)) || a.matchId - b.matchId);
}

export async function base() {
  const { loadSeason } = await import("./season");
  const { data } = await loadSeason();
  const partidas = partidasDaTemporada(data);
  const gols = db.gols.filter((g) => g.temporada === data.temporada).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  return {
    temporada: data.temporada,
    rodadaAtual: data.rodadaAtual,
    demo: data.source === "demo",
    clubes: Object.values(data.clubs).map((c) => ({ id: c.id, nome: c.nome, abreviacao: c.abreviacao, escudo: c.escudo })),
    partidas,
    gols,
  };
}

export interface NovoGol {
  matchId: number;
  clubeId: number;
  forma: FormaGol;
  gol: PosCampinho | null;
  assist: PosCampinho | null;
}

async function partida(matchId: number) {
  const { loadSeason } = await import("./season");
  const { data } = await loadSeason();
  const m = partidasDaTemporada(data).find((x) => x.matchId === matchId);
  if (!m) throw new Error("Partida não encontrada.");
  return { temporada: data.temporada, m: { ...m, id: m.matchId } };
}

export interface NovaPartida {
  rodada: number;
  casaId: number;
  foraId: number;
  golsCasa: number;
  golsFora: number;
}

/** Cria uma partida à mão (jogo que falta no Cartola ou com dados errados). */
export async function criarPartida(n: NovaPartida, por: string): Promise<PartidaCampinho> {
  const { loadSeason } = await import("./season");
  const { data } = await loadSeason();
  if (!Number.isInteger(n.rodada) || n.rodada < 1 || n.rodada > 38) throw new Error("Rodada inválida (1 a 38).");
  if (!data.clubs[n.casaId] || !data.clubs[n.foraId]) throw new Error("Escolha os dois times.");
  if (n.casaId === n.foraId) throw new Error("Mandante e visitante precisam ser times diferentes.");
  for (const g of [n.golsCasa, n.golsFora]) if (!Number.isInteger(g) || g < 0 || g > 20) throw new Error("Placar inválido.");
  const repetida = db.partidasManuais.find((p) => p.temporada === data.temporada && p.rodada === n.rodada && p.casaId === n.casaId && p.foraId === n.foraId);
  if (repetida) throw new Error("Essa partida manual já existe nessa rodada.");
  const menor = Math.min(0, ...db.partidasManuais.all().map((p) => p.matchId));
  const matchId = menor - 1;
  const row = { id: String(matchId), matchId, temporada: data.temporada, ...n, criadoEm: new Date().toISOString(), por };
  db.partidasManuais.put(row);
  emit("campinhos");
  return { matchId, rodada: n.rodada, casaId: n.casaId, foraId: n.foraId, golsCasa: n.golsCasa, golsFora: n.golsFora, manual: true };
}

/** Apaga uma partida manual e os gols lançados nela. */
export function apagarPartida(matchId: number) {
  const p = db.partidasManuais.get(String(matchId));
  if (!p) throw new Error("Só dá para apagar partidas criadas à mão.");
  for (const g of db.gols.filter((x) => x.matchId === matchId)) db.gols.remove(g.id);
  db.partidasManuais.remove(p.id);
  emit("campinhos");
}

export async function lancar(g: NovoGol, por: string): Promise<GolLancado> {
  const { temporada, m } = await partida(g.matchId);
  if (g.clubeId !== m.casaId && g.clubeId !== m.foraId) throw new Error("Esse time não joga essa partida.");
  if (g.forma !== "contra" && !g.gol) throw new Error("Escolha no campinho a posição de quem fez o gol.");
  const row: GolLancado = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    temporada,
    rodada: m.rodada,
    matchId: m.id,
    clubeId: g.clubeId,
    adversarioId: g.clubeId === m.casaId ? m.foraId : m.casaId,
    casa: g.clubeId === m.casaId,
    forma: g.forma,
    gol: g.forma === "contra" ? null : g.gol,
    assist: g.forma === "contra" ? null : g.assist,
    criadoEm: new Date().toISOString(),
    por,
  };
  db.gols.put(row);
  emit("campinhos");
  return row;
}

export function apagar(id: string) {
  if (!db.gols.get(id)) throw new Error("Gol não encontrado.");
  db.gols.remove(id);
  emit("campinhos");
}

/* ------------------------------ importar ------------------------------ */

const FORMA_TEXTO: Array<[RegExp, FormaGol]> = [
  [/contra/, "contra"],
  [/penal/, "penalti"],
  [/cabec/, "cabeca"],
  [/falta/, "falta"],
  [/fora/, "fora"],
  [/dentro|area/, "dentro"],
];
export function lerForma(t: string): FormaGol | null {
  const n = norm(t);
  if ((FORMAS_GOL as readonly string[]).includes(n)) return n as FormaGol;
  for (const [re, f] of FORMA_TEXTO) if (re.test(n)) return f;
  return null;
}

export function lerPosicao(t: string): PosCampinho | null | "invalida" {
  const n = norm(t).replace(/\s+/g, "");
  if (!n || n === "sem" || n === "semassistencia" || n === "nenhuma" || n === "-") return null;
  const alias: Record<string, PosCampinho> = {
    centroavante: "CENTRO",
    ca: "CENTRO",
    pontaesquerda: "PONTE",
    pontadireita: "PONTD",
    meia: "MEI",
    volante: "VOL",
    lateralesquerdo: "LATE",
    le: "LATE",
    lateraldireito: "LATD",
    ld: "LATD",
    zagueiro: "ZAG",
  };
  const up = n.toUpperCase();
  if ((POSICOES_CAMPINHO as readonly string[]).includes(up)) return up as PosCampinho;
  return alias[n] ?? "invalida";
}

function acharClube(t: string, clubs: Record<number, Club>): Club | null {
  const n = norm(t);
  return Object.values(clubs).find((c) => norm(c.abreviacao) === n || norm(c.nome) === n) ?? matchClub(t, clubs);
}

/**
 * Importa gols de um texto CSV: rodada, time que fez, adversário, forma, posição do gol,
 * posição da assistência (vazia = sem assistência). Uma linha por gol; cabeçalho opcional.
 */
export async function importar(texto: string, por: string, simular: boolean) {
  const { loadSeason } = await import("./season");
  const { data } = await loadSeason();
  const ok: GolLancado[] = [];
  const erros: Array<{ linha: number; texto: string; motivo: string }> = [];
  const linhas = texto.split(/\r?\n/);
  const todas = partidasDaTemporada(data);
  linhas.forEach((bruta, i) => {
    const l = bruta.trim();
    if (!l) return;
    const c = l.split(/[;,\t]/).map((x) => x.trim());
    if (i === 0 && /rodada/i.test(c[0] ?? "")) return; // cabeçalho
    const falha = (motivo: string) => erros.push({ linha: i + 1, texto: l.slice(0, 120), motivo });
    if (c.length < 5) return falha("faltam colunas (rodada, time, adversário, forma, gol, assistência)");
    const rodada = Number(c[0]);
    if (!Number.isInteger(rodada) || rodada < 1 || rodada > 38) return falha("rodada inválida");
    const time = acharClube(c[1], data.clubs);
    const adv = acharClube(c[2], data.clubs);
    if (!time) return falha(`time “${c[1]}” não encontrado`);
    if (!adv) return falha(`adversário “${c[2]}” não encontrado`);
    const m = todas.find((x) => x.rodada === rodada && ((x.casaId === time.id && x.foraId === adv.id) || (x.casaId === adv.id && x.foraId === time.id)));
    if (!m) return falha(`não há ${time.abreviacao} × ${adv.abreviacao} na rodada ${rodada}`);
    const forma = lerForma(c[3]);
    if (!forma) return falha(`forma “${c[3]}” desconhecida`);
    const gol = lerPosicao(c[4] ?? "");
    const assist = lerPosicao(c[5] ?? "");
    if (gol === "invalida") return falha(`posição do gol “${c[4]}” desconhecida`);
    if (assist === "invalida") return falha(`posição da assistência “${c[5]}” desconhecida`);
    if (forma !== "contra" && !gol) return falha("falta a posição de quem fez o gol");
    ok.push({
      id: `${Date.now().toString(36)}${i.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      temporada: data.temporada,
      rodada,
      matchId: m.matchId,
      clubeId: time.id,
      adversarioId: adv.id,
      casa: m.casaId === time.id,
      forma,
      gol: forma === "contra" ? null : gol,
      assist: forma === "contra" ? null : assist,
      criadoEm: new Date().toISOString(),
      por,
    });
  });
  if (!simular && ok.length) {
    for (const g of ok) db.gols.put(g);
    emit("campinhos");
  }
  return { importados: simular ? 0 : ok.length, validos: ok.length, erros };
}
