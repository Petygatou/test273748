/**
 * Verificação das fontes do Cartola, do servidor onde o site roda (somente servidor).
 *
 * Chama cada endpoint público, mede o tempo, confere os campos que o site usa e diz,
 * em linguagem simples, para que serve e o que veio. É o teste real das fontes: roda
 * sob demanda no Painel ADM / Cruzamento de Scout e fica registrado no log de sincronização.
 */
import { pointsFromScouts, type Scouts } from "../engine/rules";
import { CartolaError, activeHost, cartola } from "./cartolaHttp";
import { registrarLog } from "./scoutStore";

export interface VerificacaoEndpoint {
  endpoint: string;
  ok: boolean;
  /** "nao-se-aplica": o endpoint só tem dados em outro momento (ex.: parciais com o mercado aberto) */
  situacao: "ok" | "falhou" | "campos-faltando" | "nao-se-aplica";
  http: number | null;
  ms: number;
  host: string | null;
  campos: string[];
  faltando: string[];
  observacao: string;
  uso: string;
}

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => Boolean(x) && typeof x === "object" && !Array.isArray(x);
const faltam = (o: unknown, campos: string[]) => (isObj(o) ? campos.filter((c) => !(c in o)) : campos);

async function chamar(path: string): Promise<{ json: unknown; http: number | null; ms: number; erro?: string }> {
  const t0 = Date.now();
  try {
    const json = await cartola<unknown>(path, { timeoutMs: 8000 });
    return { json, http: 200, ms: Date.now() - t0 };
  } catch (e) {
    const http = e instanceof CartolaError ? e.status : null;
    const msg = e instanceof Error ? `${e.message}${e.cause instanceof Error ? ` ${e.cause.message}` : ""}` : String(e);
    const erro =
      e instanceof Error && e.name === "AbortError"
        ? "Sem resposta em 8 s."
        : http === 403 || http === 401
          ? `A Globo bloqueou este servidor (HTTP ${http}).`
          : http === 429
            ? "Limite de requisições da Globo (HTTP 429): tente em alguns minutos."
            : http && http >= 500
              ? `Erro do lado da Globo (HTTP ${http}).`
              : /fetch failed|ENOTFOUND|getaddrinfo|ECONN|EAI_AGAIN|network/i.test(msg)
                ? "Sem conexão deste servidor com a API da Globo (rede ou DNS)."
                : msg;
    return { json: null, http, ms: Date.now() - t0, erro };
  }
}

export async function verificarEndpoints(): Promise<{ em: string; resultados: VerificacaoEndpoint[] }> {
  const out: VerificacaoEndpoint[] = [];
  const add = (v: Omit<VerificacaoEndpoint, "situacao" | "host"> & { situacao?: VerificacaoEndpoint["situacao"] }) =>
    out.push({ ...v, situacao: v.situacao ?? (v.ok ? (v.faltando.length ? "campos-faltando" : "ok") : "falhou"), host: v.ok ? activeHost() : null });

  // 1) status
  const st = await chamar("/mercado/status");
  const s = st.json as Obj | null;
  const camposStatus = ["rodada_atual", "status_mercado", "temporada"];
  const R = isObj(s) && typeof s.rodada_atual === "number" ? s.rodada_atual : null;
  const mercado = isObj(s) ? Number(s.status_mercado) : null;
  add({
    endpoint: "/mercado/status",
    ok: Boolean(s),
    http: st.http,
    ms: st.ms,
    campos: camposStatus,
    faltando: s ? faltam(s, camposStatus) : [],
    observacao: s ? `Temporada ${s.temporada}, rodada ${R}, mercado ${mercado === 1 ? "aberto" : mercado === 2 ? "fechado" : String(mercado)}.` : (st.erro ?? "sem resposta"),
    uso: "Rodada atual e situação do mercado.",
  });

  // 2) mercado
  const me = await chamar("/atletas/mercado");
  const m = me.json as Obj | null;
  const atletas = isObj(m) && Array.isArray(m.atletas) ? (m.atletas as Obj[]) : [];
  const camposAtleta = ["atleta_id", "apelido", "clube_id", "posicao_id", "status_id", "preco_num", "media_num", "jogos_num"];
  add({
    endpoint: "/atletas/mercado",
    ok: atletas.length > 0,
    http: me.http,
    ms: me.ms,
    campos: [...camposAtleta, "clubes"],
    faltando: atletas.length ? [...faltam(atletas[0], camposAtleta), ...(isObj(m) && "clubes" in m ? [] : ["clubes"])] : [],
    observacao: atletas.length
      ? `${atletas.length} atletas.${atletas.some((a) => isObj(a.scout)) ? " O campo scout aqui é o acumulado da temporada: não serve como histórico por jogo." : ""}`
      : (me.erro ?? "resposta sem atletas"),
    uso: "Atletas, preço, status e clube; cadastro de atletas da temporada.",
  });

  // 3) e 4) partidas
  const camposPartida = ["partida_id", "clube_casa_id", "clube_visitante_id", "placar_oficial_mandante", "placar_oficial_visitante"];
  for (const path of ["/partidas", ...(R && R > 1 ? [`/partidas/${R - 1}`] : [])]) {
    const pa = await chamar(path);
    const p = pa.json as Obj | null;
    const lista = isObj(p) && Array.isArray(p.partidas) ? (p.partidas as Obj[]) : [];
    const comPlacar = lista.filter((x) => x.placar_oficial_mandante != null && x.placar_oficial_visitante != null).length;
    add({
      endpoint: path,
      ok: lista.length > 0,
      http: pa.http,
      ms: pa.ms,
      campos: camposPartida,
      faltando: lista.length ? faltam(lista[0], camposPartida) : [],
      observacao: lista.length ? `${lista.length} partidas, ${comPlacar} com placar oficial.` : (pa.erro ?? "resposta sem partidas"),
      uso: path === "/partidas" ? "Confrontos da rodada atual (adversário e mando)." : "Jogos e placares de cada rodada passada.",
    });
  }

  // 5) parciais ao vivo
  const pv = await chamar("/atletas/pontuados");
  const pvAtletas = isObj(pv.json) && isObj(pv.json.atletas) ? Object.keys(pv.json.atletas).length : 0;
  add({
    endpoint: "/atletas/pontuados",
    ok: pvAtletas > 0,
    situacao: pvAtletas > 0 ? "ok" : mercado === 1 ? "nao-se-aplica" : "falhou",
    http: pv.http,
    ms: pv.ms,
    campos: ["atletas"],
    faltando: [],
    observacao: pvAtletas ? `${pvAtletas} atletas com parcial.` : mercado === 1 ? "Com o mercado aberto não há parciais (só durante a rodada)." : (pv.erro ?? "sem parciais"),
    uso: "Parciais ao vivo. Nunca entram no histórico (são provisórias).",
  });

  // 6) scouts por jogo de uma rodada encerrada
  if (R && R > 1) {
    const pr = await chamar(`/atletas/pontuados/${R - 1}`);
    const mapa = isObj(pr.json) && isObj(pr.json.atletas) ? (pr.json.atletas as Record<string, Obj>) : {};
    const linhas = Object.values(mapa);
    const camposPontuado = ["scout", "pontuacao", "posicao_id", "clube_id"];
    let conferidas = 0;
    let batem = 0;
    for (const a of linhas) {
      if (a.posicao_id === 6 || !isObj(a.scout) || typeof a.pontuacao !== "number") continue;
      conferidas++;
      if (Math.abs(pointsFromScouts(a.scout as Scouts) - a.pontuacao) < 0.051) batem++;
    }
    add({
      endpoint: `/atletas/pontuados/${R - 1}`,
      ok: linhas.length > 0,
      http: pr.http,
      ms: pr.ms,
      campos: camposPontuado,
      faltando: linhas.length ? faltam(linhas[0], camposPontuado) : [],
      observacao: linhas.length
        ? `${linhas.length} atletas com scouts da rodada ${R - 1}. Pontos recalculados pelos scouts batem com os oficiais em ${conferidas ? Math.round((batem / conferidas) * 100) : 0}% (${batem}/${conferidas}): são scouts por jogo, não acumulados.`
        : (pr.erro ?? "rodada sem atletas"),
      uso: "Histórico por jogo: a base do Cruzamento de Scout (uma chamada por rodada encerrada).",
    });
  }

  // 7) clubes
  const cl = await chamar("/clubes");
  const clubes = isObj(cl.json) ? Object.values(cl.json).filter(isObj) : [];
  add({
    endpoint: "/clubes",
    ok: clubes.length > 0,
    http: cl.http,
    ms: cl.ms,
    campos: ["id", "nome", "abreviacao"],
    faltando: clubes.length ? faltam(clubes[0], ["id", "nome", "abreviacao"]) : [],
    observacao: clubes.length ? `${clubes.length} clubes. O site usa os clubes que vêm junto do mercado.` : (cl.erro ?? "sem clubes"),
    uso: "Conferência; os nomes e escudos já chegam em /atletas/mercado.",
  });

  // 8) rodadas
  const ro = await chamar("/rodadas");
  const rodadas = Array.isArray(ro.json) ? (ro.json as Obj[]) : [];
  add({
    endpoint: "/rodadas",
    ok: rodadas.length > 0,
    http: ro.http,
    ms: ro.ms,
    campos: ["rodada_id", "inicio", "fim"],
    faltando: rodadas.length ? faltam(rodadas[0], ["rodada_id", "inicio", "fim"]) : [],
    observacao: rodadas.length ? `${rodadas.length} rodadas no calendário.` : (ro.erro ?? "sem rodadas"),
    uso: "Calendário de rodadas (conferência; o site usa as datas das partidas).",
  });

  const falhas = out.filter((v) => v.situacao === "falhou" || v.situacao === "campos-faltando");
  registrarLog({
    fonte: "Verificação dos endpoints do Cartola",
    operacao: "verificacao",
    resultado: !falhas.length ? "ok" : falhas.length === out.length ? "erro" : "parcial",
    registros: out.filter((v) => v.situacao === "ok").length,
    novos: 0,
    revisados: 0,
    mensagem: falhas.length ? `Com problema: ${falhas.map((f) => `${f.endpoint} (${f.http ?? "rede"})`).join(", ")}` : `Todos os ${out.length} endpoints responderam.`,
    duracaoMs: out.reduce((s, v) => s + v.ms, 0),
  });
  return { em: new Date().toISOString(), resultados: out };
}
