/**
 * O Comandante — assistente tático (somente servidor).
 *
 * Princípio: a matemática decide os números. O modelo nunca recebe permissão
 * para estimar métricas: todo número vem das ferramentas abaixo, que leem a
 * análise do motor. O texto do Comandante interpreta, compara e recomenda.
 *
 * Proteções: limite de uso por IP, circuito de proteção (após falhas seguidas
 * da API, responde em modo offline por um tempo) e resposta determinística
 * quando não há chave configurada.
 */
import Anthropic from "@anthropic-ai/sdk";
import { optimizeLineup } from "../engine/optimizer";
import { FORMATION_KEYS, POSITIONS, type FormationKey, type PositionId } from "../engine/rules";
import { simulateLineup } from "../engine/simulate";
import type { PlayerProjection, ProfileKey, RoundAnalysis } from "../engine/types";
import { compactPlayer, confrontoFor, roundBrief } from "../lib/derive";

const MODEL = "claude-opus-5-5";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatTurn[];
  contexto?: unknown;
  prefs?: { tom?: "agressivo" | "conservador"; foco?: "pontos" | "cartoletas"; nome?: string };
}

export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; label: string }
  | { type: "done"; offline?: boolean }
  | { type: "error"; message: string };

/* --------------------------- prompt (estável p/ cache) --------------------------- */

const SYSTEM = `Você é o Comandante, o assistente tático da plataforma Comandante FC para o Cartola FC (fantasy game do Brasileirão).

Como você trabalha:
- Os números vêm do motor analítico da plataforma, que você consulta pelas ferramentas. Nunca estime, arredonde de cabeça ou invente métricas (pontos esperados, probabilidades, preços, MPV). Se precisar de um número que não está no contexto, chame a ferramenta adequada. Se a ferramenta não tiver o dado, diga que não tem.
- Quando a mensagem trouxer um bloco <contexto_da_tela>, ele contém números do motor para aquilo que o cartoleiro está vendo. Use-o como fonte primária e só chame ferramentas para complementar.
- Interprete: explique de onde vêm os pontos (scouts), riscos (chance de jogar, piso, confronto, correlação entre atletas do mesmo time), custo-benefício e valorização. Compare alternativas com números.
- Seja direto e prático, em português do Brasil, com o vocabulário do cartoleiro (mitar, tropa, capitão, cartoletas, SG, scouts). Prefira listas curtas e recomendações claras. Sem enrolação e sem repetir a pergunta.
- Probabilidades são probabilidades: diga "boa chance", "risco alto" etc. com o número, sem prometer resultado.

Glossário do motor (para você interpretar corretamente):
- xP: pontos esperados já multiplicados pela chance de jogar. xPJogando: pontos esperados se entrar em campo.
- piso = percentil 15 e teto = percentil 85 da simulação de Monte Carlo (dado que joga); pAcima12 = chance de 12+ pontos.
- fatores: ataque (gols esperados do time no jogo vs. contra adversário médio), cedencia (quanto o adversário cede do scout principal da posição), mando, forma (recente vs. temporada). 1,10 = +10%.
- mpv: mínimo para valorizar; valorizacaoEsperada: variação de preço esperada em C$.
- Capitão pontua 1,5×. Técnico pontua a média dos atletas do clube que entraram + 1 se vencer.
- Banco: um reserva por posição, com preço ≤ titular mais barato da posição; o reserva de luxo substitui o titular que pontuar menos que ele.
- Perfis do montador: mitada (teto), equilibrada (média com penalidade de risco), valorizacao (patrimônio).`;

function prefsBlock(p: ChatRequest["prefs"]): string {
  const tom = p?.tom === "agressivo" ? "agressivo: aceita mais risco atrás de teto e diferenciais" : "conservador: prioriza segurança, regularidade e chance alta de jogar";
  const foco = p?.foco === "cartoletas" ? "ganhar cartoletas (valorização)" : "fazer pontos";
  return `Preferências do cartoleiro${p?.nome ? ` (${p.nome})` : ""}: tom ${tom}; foco em ${foco}. Adapte as recomendações a isso.`;
}

/* --------------------------------- ferramentas --------------------------------- */

const POS_BY_ABBR: Record<string, PositionId> = { GOL: 1, LAT: 2, ZAG: 3, MEI: 4, ATA: 5, TEC: 6 };

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "buscar_atletas",
    description:
      "Lista atletas do mercado com as projeções do motor. Use para encontrar opções por posição, clube, preço ou ranking (xP, teto, piso, valorização, custo-benefício). Retorna no máximo 15 atletas.",
    input_schema: {
      type: "object",
      properties: {
        consulta: { type: "string", description: "Trecho do apelido do atleta (opcional)" },
        posicao: { type: "string", enum: ["GOL", "LAT", "ZAG", "MEI", "ATA", "TEC"] },
        clube: { type: "string", description: "Nome ou sigla do clube (opcional)" },
        preco_max: { type: "number", description: "Preço máximo em cartoletas" },
        ordenar_por: { type: "string", enum: ["xP", "teto", "piso", "valorizacao", "custo_beneficio", "chance_12"] },
        so_quem_joga: { type: "boolean", description: "Filtra quem tem chance de jogar ≥ 50% (padrão: true)" },
        limite: { type: "integer", minimum: 1, maximum: 15 },
      },
      additionalProperties: false,
    },
    eager_input_streaming: true,
  },
  {
    name: "detalhar_atleta",
    description: "Projeção completa de um atleta: scouts esperados, fatores do confronto, distribuição, MPV, últimas rodadas e próximos jogos do clube.",
    input_schema: {
      type: "object",
      properties: { atleta: { type: "string", description: "Apelido ou id do atleta" } },
      required: ["atleta"],
      additionalProperties: false,
    },
    eager_input_streaming: true,
  },
  {
    name: "comparar_atletas",
    description: "Compara dois atletas lado a lado com as métricas do motor (duelo X1).",
    input_schema: {
      type: "object",
      properties: { atleta_a: { type: "string" }, atleta_b: { type: "string" } },
      required: ["atleta_a", "atleta_b"],
      additionalProperties: false,
    },
    eager_input_streaming: true,
  },
  {
    name: "jogos_da_rodada",
    description: "Todos os jogos da rodada com gols esperados, probabilidades de vitória/empate/derrota, chance de SG e classificação do confronto (fácil/neutro/alto risco).",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    eager_input_streaming: true,
  },
  {
    name: "cedencia_do_time",
    description: "Quanto um time cede de pontos por posição (geral, em casa, fora, últimos 5), relativo à média da liga.",
    input_schema: {
      type: "object",
      properties: { clube: { type: "string", description: "Nome ou sigla do clube" } },
      required: ["clube"],
      additionalProperties: false,
    },
    eager_input_streaming: true,
  },
  {
    name: "montar_tropa",
    description:
      "Roda o otimizador exato e devolve a melhor tropa para o orçamento e o perfil, com capitão, banco, reserva de luxo e a distribuição simulada de pontos. Use para sugerir ou testar escalações.",
    input_schema: {
      type: "object",
      properties: {
        orcamento: { type: "number", description: "Cartoletas disponíveis" },
        perfil: { type: "string", enum: ["mitada", "equilibrada", "valorizacao"] },
        esquema: { type: "string", enum: ["auto", ...FORMATION_KEYS] },
        fixar: { type: "array", items: { type: "string" }, description: "Atletas que devem entrar" },
        banir: { type: "array", items: { type: "string" }, description: "Atletas que não podem entrar" },
      },
      required: ["orcamento", "perfil"],
      additionalProperties: false,
    },
    eager_input_streaming: true,
  },
  {
    name: "precisao_do_modelo",
    description: "Resultado do backtest walk-forward: erro, ordenação, calibração do intervalo e pontos reais da tropa do modelo vs. escalar pela média.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    eager_input_streaming: true,
  },
];

const TOOL_LABELS: Record<string, string> = {
  buscar_atletas: "Consultando o mercado",
  detalhar_atleta: "Abrindo a projeção do atleta",
  comparar_atletas: "Rodando o X1",
  jogos_da_rodada: "Lendo os jogos da rodada",
  cedencia_do_time: "Consultando a matriz de cedência",
  montar_tropa: "Rodando o otimizador",
  precisao_do_modelo: "Conferindo o backtest",
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function findPlayer(a: RoundAnalysis, q: string): PlayerProjection | null {
  const id = Number(q);
  if (Number.isInteger(id) && id > 0) return a.players.find((p) => p.atletaId === id) ?? null;
  const n = norm(q);
  return a.players.find((p) => norm(p.apelido) === n) ?? a.players.filter((p) => norm(p.apelido).includes(n)).sort((x, y) => y.xP - x.xP)[0] ?? null;
}

function findClub(a: RoundAnalysis, q: string): number | null {
  const n = norm(q);
  const c = Object.values(a.clubs).find((c) => norm(c.nome) === n || norm(c.abreviacao) === n) ?? Object.values(a.clubs).find((c) => norm(c.nome).includes(n));
  return c?.id ?? null;
}

type Json = Record<string, unknown>;

async function runTool(name: string, input: Json, a: RoundAnalysis, loadBacktest: () => Promise<unknown>): Promise<unknown> {
  const cp = compactPlayer(a);
  switch (name) {
    case "buscar_atletas": {
      const pos = typeof input.posicao === "string" ? POS_BY_ABBR[input.posicao] : undefined;
      const club = typeof input.clube === "string" ? findClub(a, input.clube) : null;
      const q = typeof input.consulta === "string" ? norm(input.consulta) : "";
      const max = typeof input.preco_max === "number" ? input.preco_max : Infinity;
      const onlyPlaying = input.so_quem_joga !== false;
      const key = (p: PlayerProjection) => {
        switch (input.ordenar_por) {
          case "teto":
            return p.teto * p.pJogar;
          case "piso":
            return p.piso * p.pJogar;
          case "valorizacao":
            return p.valorizacaoEsperada;
          case "custo_beneficio":
            return p.preco > 0 ? p.xP / p.preco : 0;
          case "chance_12":
            return p.pAcima12 * p.pJogar;
          default:
            return p.xP;
        }
      };
      const limit = Math.min(15, Math.max(1, Number(input.limite) || 10));
      return a.players
        .filter((p) => (pos ? p.posicaoId === pos : true) && (club ? p.clubeId === club : true) && p.preco <= max && (q ? norm(p.apelido).includes(q) : true))
        .filter((p) => (onlyPlaying ? p.pJogar >= 0.5 && p.matchId != null : true))
        .sort((x, y) => key(y) - key(x))
        .slice(0, limit)
        .map(cp);
    }
    case "detalhar_atleta": {
      const p = findPlayer(a, String(input.atleta ?? ""));
      if (!p) return { erro: `Atleta "${input.atleta}" não encontrado no mercado desta rodada.` };
      return { ...cp(p), scouts: p.scouts, ultimas: p.ultimas, proximosDoClube: a.proximos[p.clubeId] ?? [], mediaCasa: p.mediaCasa, mediaFora: p.mediaFora, regularidade: p.regularidade, pNegativo: p.pNegativo };
    }
    case "comparar_atletas": {
      const pa = findPlayer(a, String(input.atleta_a ?? ""));
      const pb = findPlayer(a, String(input.atleta_b ?? ""));
      if (!pa || !pb) return { erro: "Um dos atletas não foi encontrado." };
      return { a: { ...cp(pa), scouts: pa.scouts }, b: { ...cp(pb), scouts: pb.scouts } };
    }
    case "jogos_da_rodada":
      return a.fixtures.map((f) => ({
        jogo: `${a.clubs[f.casaId]?.nome} x ${a.clubs[f.foraId]?.nome}`,
        golsEsperados: { casa: +f.lambdaCasa.toFixed(2), fora: +f.lambdaFora.toFixed(2) },
        probabilidades: { casa: +f.pCasa.toFixed(3), empate: +f.pEmpate.toFixed(3), fora: +f.pFora.toFixed(3) },
        chanceSG: { casa: +f.sgCasa.toFixed(3), fora: +f.sgFora.toFixed(3) },
        placarMaisProvavel: f.placarProvavel.join("-"),
        classificacao: { casa: confrontoFor(f, true).label, fora: confrontoFor(f, false).label },
      }));
    case "cedencia_do_time": {
      const club = findClub(a, String(input.clube ?? ""));
      const row = a.cedencia.find((r) => r.clubeId === club);
      if (!row) return { erro: `Clube "${input.clube}" não encontrado.` };
      const fmt = (cells: typeof row.geral) =>
        Object.fromEntries(Object.entries(cells).map(([pos, c]) => [POSITIONS[Number(pos) as PositionId].abbr, { pontosPorAtleta: c.pontos, fatorVsLiga: c.fator, amostras: c.jogos }]));
      return { clube: a.clubs[row.clubeId]?.nome, geral: fmt(row.geral), emCasa: fmt(row.casa), fora: fmt(row.fora), ultimos5: fmt(row.ultimos5) };
    }
    case "montar_tropa": {
      const ids = (xs: unknown) =>
        (Array.isArray(xs) ? xs : [])
          .map((s) => findPlayer(a, String(s)))
          .filter((p): p is PlayerProjection => !!p)
          .map((p) => p.atletaId);
      const esquema: FormationKey | "auto" = typeof input.esquema === "string" && (FORMATION_KEYS as string[]).includes(input.esquema) ? (input.esquema as FormationKey) : "auto";
      const req = {
        formation: esquema,
        budget: Math.max(0, Number(input.orcamento) || 100),
        profile: (["mitada", "equilibrada", "valorizacao"].includes(String(input.perfil)) ? input.perfil : "equilibrada") as ProfileKey,
        fixed: ids(input.fixar),
        banned: ids(input.banir),
      };
      const res = optimizeLineup(a, req);
      if (!res.lineup) return { erro: res.erro ?? "Não foi possível montar a tropa." };
      const l = res.lineup;
      const byId = new Map(a.players.map((p) => [p.atletaId, p] as const));
      const sim = simulateLineup(a.sim, {
        titulares: l.slots.map((s) => s.atletaId),
        captainId: l.captainId,
        reservas: l.banco.map((b) => ({ atletaId: b.atletaId, posicaoId: b.posicaoId })),
        luxoId: l.banco.find((b) => b.luxo)?.atletaId ?? null,
      }, 2000);
      return {
        esquema: l.formation,
        perfil: l.profile,
        custo: l.custo,
        sobra: l.sobra,
        xP: l.xP,
        xPComCapitao: l.xPComCapitao,
        valorizacaoEsperada: l.valorizacaoEsperada,
        capitao: byId.get(l.captainId)?.apelido,
        titulares: l.slots.map((s) => cp(byId.get(s.atletaId)!)),
        banco: l.banco.map((b) => ({ atleta: byId.get(b.atletaId)?.apelido, posicao: POSITIONS[b.posicaoId].abbr, luxo: Boolean(b.luxo), preco: b.preco })),
        alternativasDeCapitao: l.capitaes.map((c) => ({ atleta: byId.get(c.atletaId)?.apelido, xP: c.xP, justificativa: c.justificativa })),
        simulacao: { p10: +sim.p10.toFixed(1), mediana: +sim.p50.toFixed(1), p90: +sim.p90.toFixed(1), chanceDePassar: sim.pAcima },
        comparativoDeEsquemas: res.porEsquema.slice(0, 4),
        explicacao: l.explicacao,
      };
    }
    case "precisao_do_modelo":
      return loadBacktest();
    default:
      return { erro: `Ferramenta desconhecida: ${name}` };
  }
}

/* ------------------------------ limites e proteção ------------------------------ */

const buckets = new Map<string, { tokens: number; at: number }>();
const RATE = { capacity: 12, refillPerMin: 1.2 };

export function allowRequest(ip: string): boolean {
  const now = Date.now();
  const b = buckets.get(ip) ?? { tokens: RATE.capacity, at: now };
  b.tokens = Math.min(RATE.capacity, b.tokens + ((now - b.at) / 60000) * RATE.refillPerMin);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(ip, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(ip, b);
  return true;
}

const circuit = { failures: 0, openUntil: 0 };

function apiKeyAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/* --------------------------------- modo offline --------------------------------- */

function offlineAnswer(a: RoundAnalysis, reason: string): string {
  const brief = roundBrief(a);
  const caps = brief.capitaes.slice(0, 3).map((c) => `${c.atleta} (${c.clube}) — xP ${c.xP.toFixed(1).replace(".", ",")}, ${Math.round(c.pAcima12 * 100)}% de chance de 12+`);
  const sg = [...a.fixtures]
    .flatMap((f) => [
      { c: f.casaId, p: f.sgCasa },
      { c: f.foraId, p: f.sgFora },
    ])
    .sort((x, y) => y.p - x.p)
    .slice(0, 3)
    .map((x) => `${a.clubs[x.c]?.nome} (${Math.round(x.p * 100)}%)`);
  return [
    `**Comandante em modo offline** — ${reason}. Enquanto isso, a leitura direta do motor para a rodada ${a.rodada}:`,
    "",
    `**Capitães mais fortes:**\n${caps.map((c) => `- ${c}`).join("\n")}`,
    "",
    `**Maiores chances de SG:** ${sg.join(", ")}.`,
    "",
    "Use o Montador para a tropa ótima e a Central de Estatísticas para comparar atletas.",
  ].join("\n");
}

/* --------------------------------- loop agêntico --------------------------------- */

export async function* runComandante(
  req: ChatRequest,
  deps: { analysis: RoundAnalysis; loadBacktest: () => Promise<unknown> },
): AsyncGenerator<ChatEvent> {
  const a = deps.analysis;
  if (!apiKeyAvailable()) {
    yield { type: "text", text: offlineAnswer(a, "a chave da API de IA não está configurada no servidor (ANTHROPIC_API_KEY)") };
    yield { type: "done", offline: true };
    return;
  }
  if (Date.now() < circuit.openUntil) {
    yield { type: "text", text: offlineAnswer(a, "o serviço de IA está instável e o circuito de proteção foi acionado; tente de novo em instantes") };
    yield { type: "done", offline: true };
    return;
  }

  const history = req.messages.slice(-16).filter((m) => m.content.trim().length > 0);
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m, i) => {
    const isLast = i === history.length - 1;
    if (m.role === "user" && isLast && req.contexto !== undefined) {
      return {
        role: "user",
        content: `<contexto_da_tela>\n${JSON.stringify(req.contexto).slice(0, 60000)}\n</contexto_da_tela>\n\n${m.content}`,
      };
    }
    return { role: m.role, content: m.content.slice(0, 8000) };
  });
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    yield { type: "error", message: "A conversa precisa terminar com uma mensagem do cartoleiro." };
    return;
  }
  // preferências e rodada como mensagem de sistema no meio da conversa: não invalida o cache do prefixo
  messages.push({ role: "system", content: `${prefsBlock(req.prefs)} Rodada analisada: ${a.rodada} (${a.source === "demo" ? "modo demonstração, dados sintéticos" : "dados oficiais"}).` });

  const client = new Anthropic();
  for (let step = 0; step < 8; step++) {
    let final: Anthropic.Beta.BetaMessage;
    try {
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        messages,
      });
      for await (const ev of stream) {
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") yield { type: "text", text: ev.delta.text };
      }
      final = await stream.finalMessage();
      circuit.failures = 0;
    } catch (err) {
      circuit.failures++;
      if (circuit.failures >= 3) circuit.openUntil = Date.now() + 60_000;
      if (err instanceof Anthropic.RateLimitError) {
        yield { type: "error", message: "Muitas consultas ao Comandante agora. Tente de novo em alguns segundos." };
      } else if (err instanceof Anthropic.AuthenticationError) {
        yield { type: "text", text: offlineAnswer(a, "a chave da API de IA foi recusada") };
        yield { type: "done", offline: true };
      } else if (err instanceof Anthropic.APIError) {
        yield { type: "error", message: `Falha no serviço de IA (${err.status ?? "rede"}).` };
      } else {
        yield { type: "error", message: "Falha ao processar a resposta do Comandante." };
      }
      return;
    }

    if (final.stop_reason === "refusal") {
      yield { type: "text", text: "\n\nNão consigo ajudar com esse pedido. Posso analisar atletas, jogos, a sua tropa ou o mercado da rodada." };
      break;
    }
    const toolUses = final.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    // max_tokens com tool_use = entrada possivelmente truncada: não executa
    if (final.stop_reason !== "tool_use" || !toolUses.length) break;

    messages.push({ role: "assistant", content: final.content as Anthropic.Beta.BetaContentBlockParam[] });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      yield { type: "tool", name: tu.name, label: TOOL_LABELS[tu.name] ?? tu.name };
      const input = tu.input && typeof tu.input === "object" && !Array.isArray(tu.input) ? (tu.input as Json) : null;
      // com eager streaming o servidor não valida a entrada: conferimos os campos obrigatórios
      const schema = TOOLS.find((t) => t.name === tu.name)?.input_schema;
      const required = (schema?.required as string[] | undefined) ?? [];
      if (!input || required.some((k) => input[k] === undefined || input[k] === "")) {
        results.push({ type: "tool_result", tool_use_id: tu.id, is_error: true, content: "INVALID_JSON" });
        continue;
      }
      try {
        const out = await runTool(tu.name, input, a, deps.loadBacktest);
        results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out).slice(0, 50000) });
      } catch (e) {
        results.push({ type: "tool_result", tool_use_id: tu.id, is_error: true, content: e instanceof Error ? e.message : "erro" });
      }
    }
    messages.push({ role: "user", content: results });
  }
  yield { type: "done" };
}

export { runTool as _runToolForTests };
