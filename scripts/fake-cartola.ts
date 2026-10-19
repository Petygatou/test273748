/** Globo falsa para testar o tempo real: npx tsx scripts/fake-cartola.ts e rode o site com CARTOLA_API_HOSTS=http://127.0.0.1:9100 DATA_MODE=live WATCH_INTERVAL_MS=3000. Mude o status de um atleta com GET /__set?id=ID&status=5. */
import { createServer } from "node:http";
import { generateDemoSeason } from "../src/data/demoSeason";
const { latent, ...d } = generateDemoSeason();
void latent;
const R = d.rodadaAtual;
const status = new Map(d.athletes.map((a) => [a.id, a.statusId]));
const body = (x: unknown) => JSON.stringify(x);
createServer((req, res) => {
  const url = new URL(req.url!, "http://x");
  const path = url.pathname;
  const send = (x: unknown, code = 200) => { res.writeHead(code, { "content-type": "application/json" }); res.end(body(x)); };
  if (path === "/__set") { status.set(Number(url.searchParams.get("id")), Number(url.searchParams.get("status"))); return send({ ok: true }); }
  if (path === "/mercado/status") return send({ rodada_atual: R, status_mercado: 1, temporada: 2026, times_escalados: 4_000_000, fechamento: { timestamp: Math.floor(Date.now() / 1000) + 86400 } });
  if (path === "/atletas/mercado") {
    const clubes: Record<string, unknown> = {};
    for (const c of Object.values(d.clubs)) clubes[c.id] = { id: c.id, nome: c.nome, abreviacao: c.abreviacao, nome_fantasia: c.nome };
    return send({
      clubes,
      atletas: d.athletes.map((a) => ({ atleta_id: a.id, apelido: a.apelido, nome: a.apelido, foto: null, clube_id: a.clubeId, posicao_id: a.posicaoId, status_id: status.get(a.id), pontos_num: a.pontosUltima, media_num: a.media, variacao_num: a.variacao, preco_num: a.preco, jogos_num: a.jogos })),
    });
  }
  const m = path.match(/^\/partidas(?:\/(\d+))?$/);
  if (m) {
    const r = Number(m[1] ?? R);
    return send({ rodada: r, partidas: d.matches.filter((x) => x.rodada === r).map((x) => ({ partida_id: x.id, clube_casa_id: x.casaId, clube_visitante_id: x.foraId, placar_oficial_mandante: x.golsCasa ?? null, placar_oficial_visitante: x.golsFora ?? null, timestamp: x.data ? Math.floor(new Date(x.data).getTime() / 1000) : undefined, local: x.local, valida: true })) });
  }
  const p = path.match(/^\/atletas\/pontuados(?:\/(\d+))?$/);
  if (p) {
    const r = p[1] ? Number(p[1]) : R;
    const atletas: Record<string, unknown> = {};
    for (const h of d.history.filter((x) => x.rodada === r)) atletas[h.atletaId] = { apelido: "", pontuacao: h.pontos, scout: h.scout, posicao_id: h.posicaoId, clube_id: h.clubeId, entrou_em_campo: true };
    return send({ rodada: r, atletas });
  }
  if (path === "/mercado/destaques") return send([]);
  send({ mensagem: "não encontrado" }, 404);
}).listen(9100, () => console.log("fake globo :9100"));
// atleta de teste: titular provável do primeiro jogo da rodada atual
const jogo = d.matches.find((x) => x.rodada === R)!;
const gk = d.athletes.filter((a) => a.clubeId === jogo.casaId && a.posicaoId === 1 && status.get(a.id) === 7).sort((x, y) => y.jogos - x.jogos)[0];
console.log("ALVO", gk.id, gk.apelido, jogo.casaId);
