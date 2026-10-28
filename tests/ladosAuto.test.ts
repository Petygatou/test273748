import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "cfc-lados-"));

const { db } = await import("../src/server/db");
const L = await import("../src/server/ladosAuto");
const { newOfficialState } = await import("../src/server/escalacoes");
const { generateDemoSeason } = await import("../src/data/demoSeason");
const { computeCedencia } = await import("../src/engine/cedencia");
const { LATERAL_DIR, LATERAL_ESQ } = await import("../src/engine/types");
import type { LadoJogoRow } from "../src/server/db";

const { latent: _l, ...data } = generateDemoSeason();
void _l;
const nomes = new Map(data.athletes.map((a) => [a.id, a.apelido] as const));
const jogos = data.matches.filter((m) => m.rodada < data.rodadaAtual && m.golsCasa != null).slice(0, 24);
/** lado "verdadeiro" dos laterais nas escalações falsas: id ímpar joga na esquerda */
const ladoDe = (id: number) => (id % 2 ? "E" : "D");
const lateraisQueJogaram = (clubeId: number, rodada: number) =>
  [...new Set(data.history.filter((h) => h.rodada === rodada && h.clubeId === clubeId && h.posicaoId === 2).map((h) => h.atletaId))];

function resumoEspn(m: (typeof jogos)[number], semEscalacao = false) {
  const time = (clubeId: number, homeAway: "home" | "away") => {
    const jogaram = lateraisQueJogaram(clubeId, m.rodada);
    const reserva = data.athletes.find((a) => a.clubeId === clubeId && a.posicaoId === 2 && !jogaram.includes(a.id));
    return {
      homeAway,
      team: { displayName: data.clubs[clubeId].nome },
      roster: [
        { starter: true, subbedIn: false, athlete: { displayName: "Goleiro Qualquer" }, position: { name: "Goalkeeper", abbreviation: "G" } },
        ...jogaram.map((id) => ({
          starter: true,
          subbedIn: false,
          athlete: { displayName: nomes.get(id) },
          position: ladoDe(id) === "E" ? { name: "Left Back", abbreviation: "LB" } : { name: "Right Back", abbreviation: "RB" },
        })),
        // reserva que não entrou: não conta
        ...(reserva ? [{ starter: false, subbedIn: false, athlete: { displayName: reserva.apelido }, position: { name: "Substitute", abbreviation: "SUB" } }] : []),
        // lateral que o Cartola não conhece: vai para a lista de conferência
        { starter: true, subbedIn: false, athlete: { displayName: "Fulano Inexistente" }, position: { name: "Left Back", abbreviation: "LB" } },
      ],
    };
  };
  return { rosters: semEscalacao ? [] : [time(m.casaId, "home"), time(m.foraId, "away")] };
}

const resposta = (body: unknown, status = 200) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body }) as unknown as Response;

function fetchEspn(opts: { vazio?: number } = {}) {
  const chamadas: string[] = [];
  const f = (async (url: string) => {
    chamadas.push(url);
    if (url.includes("/scoreboard")) {
      return resposta({
        events: jogos.map((m) => ({
          id: `9${m.id}`,
          date: m.data,
          status: { type: { completed: true, state: "post" } },
          competitions: [{ competitors: [{ homeAway: "home", team: { displayName: data.clubs[m.casaId].nome } }, { homeAway: "away", team: { displayName: data.clubs[m.foraId].nome } }] }],
        })),
      });
    }
    const id = Number(new URL(url).searchParams.get("event")?.slice(1));
    const m = jogos.find((x) => x.id === id)!;
    return resposta(resumoEspn(m, id === opts.vazio));
  }) as unknown as typeof fetch;
  return { f, chamadas };
}

describe("leitura da posição", () => {
  it("entende a posição escrita da ESPN", () => {
    expect(L.ladoDaPosicao("Left Back", "LB")).toEqual({ lado: "E", forte: true });
    expect(L.ladoDaPosicao("Right Wing Back")).toEqual({ lado: "D", forte: true });
    expect(L.ladoDaPosicao("Center Left Defender", "CD-L")).toEqual({ lado: "E", forte: false });
    expect(L.ladoDaPosicao("Right Midfielder", "RM")).toEqual({ lado: "D", forte: false });
    expect(L.ladoDaPosicao("Lateral esquerdo")).toEqual({ lado: "E", forte: true });
    expect(L.ladoDaPosicao("Substitute", "SUB")).toBeNull();
    expect(L.ladoDaPosicao("Goalkeeper", "G")).toBeNull();
    expect(L.ladoDaPosicao("Defensive Midfielder", "DM")).toBeNull();
    expect(L.ladoDaPosicao("Center Defender", "CD")).toBeNull();
  });

  it("entende o grid da API-Football (coluna 1 = esquerda) e a inversão", () => {
    expect(L.ladoDoGrid([2, 1, 4])).toEqual({ lado: "E", forte: true });
    expect(L.ladoDoGrid([2, 4, 4])).toEqual({ lado: "D", forte: true });
    expect(L.ladoDoGrid([2, 2, 4])).toBeNull();
    expect(L.ladoDoGrid([2, 3, 3])).toEqual({ lado: "D", forte: false });
    expect(L.ladoDoGrid([2, 1, 4], true)).toEqual({ lado: "D", forte: true });
    expect(L.ladoDoGrid(undefined)).toBeNull();
  });
});

describe("ESPN: escalações jogo a jogo", () => {
  beforeEach(() => {
    for (const c of Object.values(db)) c._reset();
  });

  it("lê os jogos, casa os laterais e descobre o lado de cada um", async () => {
    const { f, chamadas } = fetchEspn();
    // fim da temporada: lê a lista mês a mês, de janeiro a dezembro
    const agora = Date.UTC(data.temporada, 11, 20);
    const r = await L.passoEspn(data, 100, agora, f);
    expect(r.processados).toBe(jogos.length);
    expect(r.lidos).toBe(jogos.length);
    const listas = chamadas.filter((u) => u.includes("/scoreboard"));
    expect(listas).toHaveLength(12);
    expect(listas[0]).toContain(`dates=${data.temporada}0101-${data.temporada}0131`);
    expect(listas[1]).toContain(`dates=${data.temporada}0201-${data.temporada}0228`);
    expect(db.ladosFontes.get("espn")!.eventos).toHaveLength(jogos.length);

    const rows = db.ladosJogos.all();
    expect(rows).toHaveLength(jogos.length);
    for (const row of rows) {
      const m = jogos.find((x) => row.id === `espn:9${x.id}`)!;
      expect(row.rodada).toBe(m.rodada);
      expect(row.clubes).toEqual([m.casaId, m.foraId]);
      // só quem entrou em campo como lateral; o reserva que não entrou fica de fora
      const esperados = [...lateraisQueJogaram(m.casaId, m.rodada), ...lateraisQueJogaram(m.foraId, m.rodada)].sort();
      expect(row.laterais.map((l) => l.atletaId).sort()).toEqual(esperados);
      expect(row.semPar).toContain(`Fulano Inexistente (${data.clubs[m.casaId].abreviacao})`);
    }

    const comb = L.combinarLados(rows, data.temporada);
    const ids = Object.keys(comb.porAtleta).map(Number);
    expect(ids.length).toBeGreaterThan(10);
    for (const id of ids) {
      expect(comb.porAtleta[id].lado).toBe(ladoDe(id));
      expect(comb.porAtleta[id].fontes).toEqual(["espn"]);
    }
    // lado por jogo para a cedência
    const m = jogos[0];
    for (const id of lateraisQueJogaram(m.casaId, m.rodada)) expect(comb.porJogo[`${m.rodada}:${id}`]).toBe(ladoDe(id));

    // nada novo: a próxima passada não chama de novo os jogos já lidos
    const r2 = await L.passoEspn(data, 100, agora + 60_000, f);
    expect(r2.processados).toBe(0);
    expect(L.resumoLados(data.temporada, data.athletes, true)).toMatchObject({ timesSemPar: [], jogosSemRodada: 0 });
  });

  it("jogo sem escalação publicada volta para a fila mais tarde", async () => {
    const vazio = jogos[2].id;
    const { f } = fetchEspn({ vazio });
    const agora = Date.UTC(data.temporada, 11, 20);
    await L.passoEspn(data, 100, agora, f);
    const row = db.ladosJogos.get(`espn:9${vazio}`)!;
    expect(row.vazio).toBe(true);
    // logo depois: não tenta de novo; 7 h depois: tenta
    expect((await L.passoEspn(data, 100, agora + 60_000, f)).processados).toBe(0);
    db.ladosJogos.put({ ...row, lidoEm: new Date(agora - 7 * 3600_000).toISOString() });
    expect((await L.passoEspn(data, 100, agora + 60_000, f)).processados).toBe(1);
  });

  it("um jogo com erro não derruba os outros: fica para depois", async () => {
    const { f: base } = fetchEspn();
    const ruim = jogos[1].id;
    const f = (async (url: string) => (new URL(url).searchParams.get("event") === `9${ruim}` ? resposta({}, 500) : (base as unknown as (u: string) => Promise<Response>)(url))) as unknown as typeof fetch;
    const agora = Date.UTC(data.temporada, 11, 20);
    const r = await L.passoEspn(data, 100, agora, f);
    expect(r.lidos).toBe(jogos.length - 1);
    expect(db.ladosJogos.get(`espn:9${ruim}`)?.vazio).toBe(true);
    expect(db.ladosFontes.get("espn")!.erro).toBeNull();
  });

  it("fonte fora do ar: guarda o erro e espera 15 min", async () => {
    const f = (async () => resposta({}, 503)) as unknown as typeof fetch;
    const agora = Date.now();
    expect((await L.passoEspn(data, 10, agora, f)).lidos).toBe(0);
    const fonte = db.ladosFontes.get("espn")!;
    expect(fonte.erro).toMatch(/ESPN: HTTP 503/);
    expect(fonte.bloqueadoAte).toBeGreaterThan(agora + 14 * 60_000);
  });
});

describe("combinação das escalações", () => {
  const row = (id: string, p: Partial<LadoJogoRow>): LadoJogoRow => ({
    id,
    fonte: "espn",
    temporada: 2026,
    rodada: 1,
    em: "2026-04-01T20:00:00Z",
    clubes: [1, 2],
    laterais: [],
    semPar: [],
    lidoEm: "2026-04-02T00:00:00Z",
    ...p,
  });
  const ev = (atletaId: number, posicao: string, grid?: [number, number, number]) => ({ atletaId, clubeId: 1, posicao, titular: true, grid });

  it("maioria dos jogos decide; dividido vira 'dois lados'; pouca evidência não decide", () => {
    const rows = [
      row("espn:1", { rodada: 1, laterais: [ev(10, "Left Back"), ev(20, "Left Back")] }),
      row("espn:2", { rodada: 2, laterais: [ev(10, "Left Back"), ev(20, "Right Back")] }),
      row("espn:3", { rodada: 3, laterais: [ev(10, "Left Back"), ev(20, "Right Back")] }),
      row("espn:4", { rodada: 4, laterais: [ev(10, "Right Back"), ev(20, "Left Back")] }),
      // temporada passada: um jogo só (peso 0,5) não basta; dois bastam
      row("apif:1", { fonte: "apifootball", temporada: 2024, rodada: null, laterais: [ev(30, "grid 2:4 de 4", [2, 4, 4]), ev(40, "grid 2:1 de 4", [2, 1, 4])] }),
      row("apif:2", { fonte: "apifootball", temporada: 2024, rodada: null, laterais: [ev(40, "grid 2:1 de 4", [2, 1, 4])] }),
    ];
    const c = L.combinarLados(rows, 2026);
    expect(c.porAtleta[10].lado).toBe("E");
    expect(c.porAtleta[10].atual).toEqual({ E: 3, D: 1 });
    expect(c.porAtleta[20].lado).toBeUndefined();
    expect(c.porAtleta[20].ambos).toBe(true);
    expect(c.porAtleta[30].lado).toBeUndefined();
    expect(c.porAtleta[40].lado).toBe("E");
    expect(c.porAtleta[40].temporadasAnteriores).toEqual([2024]);
    // o lado por jogo é o daquele jogo, mesmo quando o atleta costuma jogar do outro lado
    expect(c.porJogo["4:10"]).toBe("D");
    expect(c.porJogo["2:20"]).toBe("D");
    // temporada passada não entra no lado por jogo (não é jogo desta temporada)
    expect(Object.keys(c.porJogo).every((k) => !k.startsWith("null"))).toBe(true);
  });

  it("dividido na temporada, mas os últimos jogos de um lado só: vale o lado de agora", () => {
    const lados = ["Left Back", "Left Back", "Left Back", "Left Back", "Right Back", "Right Back", "Right Back", "Right Back"];
    const rows = lados.map((pos, i) => row(`espn:${i}`, { rodada: i + 1, laterais: [ev(50, pos)] }));
    const c = L.combinarLados(rows, 2026);
    expect(c.porAtleta[50]).toMatchObject({ ambos: true, lado: "D", pelosUltimos: true });
    expect(c.porJogo["1:50"]).toBe("E");
  });

  it("no mesmo jogo, a posição escrita da ESPN vale mais que o desenho da API-Football", () => {
    const rows = [
      row("apif:9", { fonte: "apifootball", rodada: 5, laterais: [ev(10, "grid 2:4 de 4", [2, 4, 4])] }),
      row("espn:9", { rodada: 5, laterais: [ev(10, "Left Back")] }),
    ];
    const c = L.combinarLados(rows, 2026);
    expect(c.porJogo["5:10"]).toBe("E");
    expect(c.porAtleta[10].jogosAtual).toBe(1);
  });

  it("confere a orientação do grid pelas camisas 2 e 6 e inverte se os dados mandarem", () => {
    const normal = [row("apif:1", { fonte: "apifootball", camisas: { c2esq: 0, c2dir: 9, c6esq: 8, c6dir: 1 }, laterais: [ev(10, "grid 2:1 de 4", [2, 1, 4])] })];
    expect(L.orientacaoGrid(normal)).toEqual({ invertido: false, confirmam: 17, contrariam: 1 });
    expect(L.combinarLados(normal, 2026).porAtleta[10].atual).toEqual({ E: 1, D: 0 });
    const invertida = [row("apif:1", { fonte: "apifootball", camisas: { c2esq: 9, c2dir: 1, c6esq: 0, c6dir: 7 }, laterais: [ev(10, "grid 2:1 de 4", [2, 1, 4])] })];
    expect(L.orientacaoGrid(invertida).invertido).toBe(true);
    expect(L.combinarLados(invertida, 2026).porAtleta[10].atual).toEqual({ E: 0, D: 1 });
  });
});

describe("API-Football: temporada liberada e escalações em lote", () => {
  beforeEach(() => {
    for (const c of Object.values(db)) c._reset();
    process.env.API_FOOTBALL_KEY = "chave-de-teste";
  });

  it("acha a temporada que o plano libera, lista os jogos e lê 20 por chamada", async () => {
    const of = newOfficialState(false);
    const urls: string[] = [];
    const m = jogos[0];
    const [e1, d1] = [...lateraisQueJogaram(m.casaId, m.rodada), 0, 0];
    const f = (async (url: string) => {
      urls.push(url);
      if (url.includes(`season=${data.temporada}`) || url.includes(`season=${data.temporada - 1}`))
        return resposta({ errors: { plan: "Free plans do not have access to this season, try from 2022 to 2024." }, response: [] });
      if (url.includes("league=71")) return resposta({ errors: [], response: [{ fixture: { id: 5001, date: "2024-05-01T20:00:00Z" }, teams: { home: { name: data.clubs[m.casaId].nome }, away: { name: "Time Rebaixado" } } }] });
      if (url.includes("league=72")) return resposta({ errors: [], response: [] });
      if (url.includes("ids=5001"))
        return resposta({
          errors: [],
          response: [
            {
              fixture: { id: 5001, date: "2024-05-01T20:00:00Z" },
              teams: { home: { name: data.clubs[m.casaId].nome }, away: { name: "Time Rebaixado" } },
              lineups: [
                {
                  team: { name: data.clubs[m.casaId].nome },
                  startXI: [
                    { player: { name: "Goleiro", number: 1, pos: "G", grid: "1:1" } },
                    { player: { name: nomes.get(e1) ?? "x", number: 6, pos: "D", grid: "2:1" } },
                    { player: { name: "Zagueiro Um", number: 3, pos: "D", grid: "2:2" } },
                    { player: { name: "Zagueiro Dois", number: 4, pos: "D", grid: "2:3" } },
                    { player: { name: d1 ? nomes.get(d1)! : "Lateral Dir", number: 2, pos: "D", grid: "2:4" } },
                    ...[1, 2, 3].map((c) => ({ player: { name: `Meia ${c}`, number: 5 + c * 2, pos: "M", grid: `3:${c}` } })),
                    ...[1, 2, 3].map((c) => ({ player: { name: `Atacante ${c}`, number: 9 + c, pos: "F", grid: `4:${c}` } })),
                  ],
                },
              ],
            },
          ],
        });
      throw new Error(`url inesperada ${url}`);
    }) as unknown as typeof fetch;

    const passo = () => L.passoApiFootball(data, of, Date.now(), f);
    await passo(); // 2026 negada
    await passo(); // 2025 negada
    expect(db.ladosFontes.get("apifootball")).toMatchObject({ temporadaApi: data.temporada - 2, negadas: [data.temporada, data.temporada - 1] });
    await passo(); // lista Série A 2024
    await passo(); // lista Série B 2024
    expect(db.ladosFontes.get("apifootball")!.eventos).toEqual([{ id: "5001", em: "2024-05-01T20:00:00Z" }]);
    expect(await passo()).toBe(1); // escalações em lote
    expect(urls.at(-1)).toContain("/fixtures?ids=5001");
    expect(of.quota.usadas).toBe(5);

    const row = db.ladosJogos.get("apif:5001")!;
    expect(row).toMatchObject({ fonte: "apifootball", temporada: data.temporada - 2, rodada: null, camisas: { c2esq: 0, c2dir: 1, c6esq: 1, c6dir: 0 } });
    expect(row.laterais.find((l) => l.atletaId === e1)?.grid).toEqual([2, 1, 4]);
    // nada mais a ler: não gasta cota
    expect(await passo()).toBe(0);
    expect(of.quota.usadas).toBe(5);
  });

  it("se o lote não trouxer escalações, passa a ler um jogo por chamada", async () => {
    const of = newOfficialState(false);
    db.ladosFontes.put({ id: "apifootball", temporada: data.temporada, temporadaApi: 2024, ligasLidas: [71, 72], eventos: [{ id: "7001", em: "2024-06-01T20:00:00Z" }, { id: "7002", em: "2024-06-02T20:00:00Z" }], listaEm: new Date().toISOString(), erro: null, bloqueadoAte: 0, tentativas: {} });
    const urls: string[] = [];
    const f = (async (url: string) => {
      urls.push(url);
      if (url.includes("/fixtures?ids=")) return resposta({ errors: [], response: [{ fixture: { id: 7001, date: "x" }, teams: { home: { name: "A" }, away: { name: "B" } } }] });
      if (url.includes("/fixtures/lineups?fixture=7001")) return resposta({ errors: [], response: [] });
      throw new Error(url);
    }) as unknown as typeof fetch;
    expect(await L.passoApiFootball(data, of, Date.now(), f)).toBe(0);
    expect(db.ladosFontes.get("apifootball")!.semLote).toBe(true);
    await L.passoApiFootball(data, of, Date.now(), f);
    expect(urls.at(-1)).toContain("/fixtures/lineups?fixture=7001");
    expect(db.ladosJogos.get("apif:7001")?.vazio).toBe(true);
  });

  it("sem cota sobrando, não chama", async () => {
    const of = newOfficialState(false);
    of.quota = { dia: new Date().toISOString().slice(0, 10), usadas: 80, restantes: null };
    const f = (async () => {
      throw new Error("não devia chamar");
    }) as unknown as typeof fetch;
    expect(await L.passoApiFootball(data, of, Date.now(), f)).toBe(0);
  });
});

describe("cedência com o lado de cada jogo", () => {
  it("o jogo em que o lateral atuou do outro lado vai para a coluna daquele lado", () => {
    const pr = data.history.find((h) => h.posicaoId === 2 && h.rodada > 3 && h.rodada < data.rodadaAtual)!;
    const clubIds = Object.keys(data.clubs).map(Number);
    const base = computeCedencia(data.history, data.matches, clubIds, data.rodadaAtual, 8, 10, { [pr.atletaId]: "D" });
    const porJogo = computeCedencia(data.history, data.matches, clubIds, data.rodadaAtual, 8, 10, { [pr.atletaId]: "D" }, { [`${pr.rodada}:${pr.atletaId}`]: "E" });
    const m = data.matches.find((x) => x.rodada === pr.rodada && (x.casaId === pr.clubeId || x.foraId === pr.clubeId))!;
    const opp = m.casaId === pr.clubeId ? m.foraId : m.casaId;
    const antes = base.rows.find((r) => r.clubeId === opp)!.geral;
    const depois = porJogo.rows.find((r) => r.clubeId === opp)!.geral;
    expect(depois[LATERAL_ESQ].jogos).toBe(antes[LATERAL_ESQ].jogos + 1);
    expect(depois[LATERAL_DIR].jogos).toBe(antes[LATERAL_DIR].jogos - 1);
  });
});
