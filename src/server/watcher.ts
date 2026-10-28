/**
 * Vigia dos dados (somente servidor).
 *
 * A cada minuto relê o mercado do Cartola e as notícias, compara com a leitura
 * anterior e, se algo mudou (status de atleta, preço, rodada, mercado
 * abrindo/fechando, notícia de desfalque), limpa os caches, guarda o status
 * (snapshot) e avisa todos os navegadores abertos por SSE. Ninguém precisa
 * recarregar a página nem confirmar nada.
 */
import type { Athlete, SeasonData } from "../engine/types";
import { STATUS_LABELS } from "../engine/rules";
import { invalidate } from "./cache";
import { emit } from "./db";
import { probableXI } from "../engine/lineup";
import { currentOfficialOverrides, fixturesSummary, medicaoResumo, newOfficialState, officialEnabled, persistOfficial, quotaStatus, stepOfficial, type OfficialState } from "./escalacoes";
import { loadNews, type NewsItem } from "./news";

export interface Mudanca {
  id: string;
  em: string;
  tipo: "status" | "mercado" | "rodada" | "noticia" | "escalacao";
  texto: string;
  atletaId?: number;
  link?: string;
}

const TICK_MS = Number(process.env.WATCH_INTERVAL_MS ?? 60_000);
const MAX = 60;

interface State {
  started: boolean;
  timer: ReturnType<typeof setInterval> | null;
  last: Map<number, { status: number; preco: number; nome: string }> | null;
  rodada: number | null;
  mercado: number | null;
  mudancas: Mudanca[];
  noticias: Set<string>;
  sinais: Record<number, number>;
  oficial: OfficialState;
  ultimaLeitura: string | null;
  ultimoErro: string | null;
  tickRunning: boolean;
}

const g = globalThis as unknown as { __tropaWatcher?: State };
const st: State = (g.__tropaWatcher ??= {
  started: false,
  timer: null,
  last: null,
  rodada: null,
  mercado: null,
  mudancas: [],
  noticias: new Set(),
  sinais: {},
  oficial: newOfficialState(),
  ultimaLeitura: null,
  ultimoErro: null,
  tickRunning: false,
});

let seq = 0;
const push = (m: Omit<Mudanca, "id" | "em">) => {
  st.mudancas.unshift({ id: `${Date.now()}-${seq++}`, em: new Date().toISOString(), ...m });
  st.mudancas.length = Math.min(st.mudancas.length, MAX);
};

export const recentChanges = (n = 30) => st.mudancas.slice(0, n);
export const newsSignals = () => st.sinais;
export const officialFixtures = (clubs: Parameters<typeof fixturesSummary>[1]) => fixturesSummary(st.oficial, clubs);
export const medicaoOficial = () => medicaoResumo(st.oficial);
export const officialOverrides = () => currentOfficialOverrides(st.oficial);
/** Cota da API-Football compartilhada (escalações oficiais, lados dos laterais). */
export const oficialState = () => st.oficial;
export const watcherStatus = () => ({
  ativo: st.started,
  ultimaLeitura: st.ultimaLeitura,
  ultimoErro: st.ultimoErro,
  intervaloMs: TICK_MS,
  escalacaoOficial: { ligada: officialEnabled(), jogosComEscalacao: st.oficial.porJogo.size, ...quotaStatus(st.oficial), jogosOficiais: [...st.oficial.porJogo.values()].map((j) => j.clubes), ultimaChamada: st.oficial.ultimaChamada, erro: st.oficial.erro },
});

/** Impressão digital do que muda a análise: rodada, mercado, status e preço de cada atleta. */
export function fingerprint(d: Pick<SeasonData, "rodadaAtual" | "mercadoStatus" | "athletes">, sinais: Record<number, number> = {}): string {
  let h = 5381;
  const mix = (s: string) => {
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  };
  mix(`${d.rodadaAtual}:${d.mercadoStatus}`);
  for (const a of d.athletes) mix(`${a.id}:${a.statusId}:${a.preco}`);
  for (const [k, v] of Object.entries(sinais)) mix(`s${k}:${v}`);
  return `${d.athletes.length}-${(h >>> 0).toString(36)}`;
}

/** Compara duas leituras do mercado e descreve o que mudou. */
export function diffMarket(
  prev: Map<number, { status: number; preco: number; nome: string }>,
  next: Athlete[],
  clubName: (id: number) => string,
): Array<Omit<Mudanca, "id" | "em">> {
  const out: Array<Omit<Mudanca, "id" | "em">> = [];
  for (const a of next) {
    const p = prev.get(a.id);
    if (!p || p.status === a.statusId) continue;
    if (a.posicaoId === 6) continue;
    const de = STATUS_LABELS[p.status] ?? "—";
    const para = STATUS_LABELS[a.statusId] ?? "—";
    out.push({ tipo: "status", atletaId: a.id, texto: `${a.apelido} (${clubName(a.clubeId)}): ${de} → ${para}` });
  }
  return out;
}

const NEG_STRONG = /\b(desfalque|les[aã]o|lesionad|cortad|vetad|suspens|fora d[oa]|n[aã]o joga|n[aã]o enfrenta|desfalcad)/i;
const NEG_SOFT = /\b(d[uú]vida|poupad|pode ficar de fora|inc[eê]rto)/i;

/**
 * Sinais das notícias (últimas 36 h): só manchetes que citam o atleta pelo
 * nome no TÍTULO e trazem palavra clara de ausência. O efeito é um
 * deslocamento pequeno na chance de jogar, e cada sinal vira uma "mudança"
 * visível (com o link), para ninguém ser surpreendido.
 */
export function signalsFromNews(items: NewsItem[], now = Date.now()): Record<number, { shift: number; item: NewsItem }> {
  const out: Record<number, { shift: number; item: NewsItem }> = {};
  for (const it of items) {
    if (it.categoria !== "Desfalques" && it.categoria !== "Escalações") continue;
    if (it.publicadoEm && now - new Date(it.publicadoEm).getTime() > 36 * 3600_000) continue;
    const titulo = it.titulo;
    const strong = NEG_STRONG.test(titulo);
    const soft = !strong && NEG_SOFT.test(titulo);
    if (!strong && !soft) continue;
    const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const t = ` ${norm(titulo)} `;
    for (const a of it.atletas) {
      if (!t.includes(` ${norm(a.apelido)} `) && !t.includes(` ${norm(a.apelido)},`) && !t.includes(` ${norm(a.apelido)}:`)) continue;
      const shift = strong ? -1.6 : -0.9;
      if (!out[a.id] || shift < out[a.id].shift) out[a.id] = { shift, item: it };
    }
  }
  return out;
}

async function tick() {
  if (st.tickRunning) return;
  st.tickRunning = true;
  try {
    // lazy para evitar ciclo de importação com season.ts
    const { loadSeason, refreshSeason } = await import("./season");
    const raw = await refreshSeason();
    const data = raw.data;
    st.ultimaLeitura = new Date().toISOString();
    st.ultimoErro = null;
    let mudou = false;
    const clubName = (id: number) => data.clubs[id]?.abreviacao ?? "?";

    if (st.rodada != null && st.rodada !== data.rodadaAtual) {
      push({ tipo: "rodada", texto: `Nova rodada: ${data.rodadaAtual}` });
      mudou = true;
    }
    if (st.mercado != null && st.mercado !== data.mercadoStatus) {
      push({ tipo: "mercado", texto: data.mercadoStatus === 1 ? "Mercado aberto" : data.mercadoStatus === 2 ? "Mercado fechado: bola rolando" : "Mercado em manutenção" });
      mudou = true;
    }
    if (st.last) {
      const diff = diffMarket(st.last, data.athletes, clubName);
      for (const d of diff) push(d);
      if (diff.length) mudou = true;
    }
    st.rodada = data.rodadaAtual;
    st.mercado = data.mercadoStatus;
    st.last = new Map(data.athletes.map((a) => [a.id, { status: a.statusId, preco: a.preco, nome: a.apelido }]));

    // notícias
    try {
      const news = await loadNews(data.athletes, data.clubs);
      const sig = signalsFromNews(news.items);
      const novos: Record<number, number> = {};
      for (const [id, { shift, item }] of Object.entries(sig)) {
        novos[Number(id)] = shift;
        if (!st.noticias.has(`${id}:${item.id}`)) {
          st.noticias.add(`${id}:${item.id}`);
          const a = data.athletes.find((x) => x.id === Number(id));
          push({ tipo: "noticia", atletaId: Number(id), texto: `${a?.apelido ?? "Atleta"}: ${item.titulo}`, link: item.link });
          mudou = true;
        }
      }
      if (JSON.stringify(novos) !== JSON.stringify(st.sinais)) {
        st.sinais = novos;
        mudou = true;
      }
    } catch {
      /* sem feed: segue só com o Cartola */
    }

    // escalações oficiais (API-Football): de 100 min antes do jogo até 20 min depois
    if (officialEnabled()) {
      // previsão ANTES da súmula (análise atual, sem os ajustes oficiais deste jogo)
      const pre = await import("./season").then((m) => m.loadAnalysis()).catch(() => null);
      const novos = await stepOfficial(st.oficial, data.athletes, data.clubs, data.temporada);
      for (const n of novos) {
        if (pre) {
          for (const t of n.times) {
            const xi = probableXI(pre.analysis.players, t.clubeId);
            const previstos = new Set([...xi.lines.gol, ...xi.lines.def, ...xi.lines.mei, ...xi.lines.ata].map((p) => p.atletaId));
            const oficiais = new Set(t.titulares);
            const acertos = [...previstos].filter((id) => oficiais.has(id)).length;
            const acimaDe50 = pre.analysis.players.filter((p) => oficiais.has(p.atletaId) && p.pJogar >= 0.5).length;
            if (oficiais.size >= 10) {
              st.oficial.medicoes.push({ em: new Date().toISOString(), clube: data.clubs[t.clubeId]?.abreviacao ?? "?", acertos, acimaDe50 });
              st.oficial.medicoes = st.oficial.medicoes.slice(-300);
            }
          }
        }
        persistOfficial(st.oficial);
        push({ tipo: "escalacao", texto: `Escalação oficial: ${n.clubes[0]} x ${n.clubes[1]}` });
        mudou = true;
      }
    }

    // lado dos laterais: escalações jogo a jogo (ESPN e, com cota sobrando, API-Football)
    try {
      const { ladosAutoLigado, passoLados } = await import("./ladosAuto");
      if (ladosAutoLigado(data.source)) {
        await passoLados(data, officialEnabled() ? st.oficial : null);
        if (officialEnabled()) persistOfficial(st.oficial);
      }
    } catch {
      /* fonte fora do ar: tenta no próximo minuto */
    }

    // rostos não são mais exibidos (o site usa a camisa do clube): a cota da API-Football
    // fica inteira para as escalações oficiais

    void loadSeason;
    if (mudou) {
      invalidate("analysis:");
      invalidate("provaveis-acerto:");
      emit("dados");
    }
  } catch (e) {
    st.ultimoErro = e instanceof Error ? e.message : String(e);
  } finally {
    st.tickRunning = false;
  }
}

/** Liga o vigia (uma vez por processo). */
export function ensureWatcher() {
  if (st.started || process.env.WATCH_DISABLED === "1") return;
  st.started = true;
  setTimeout(tick, 1500);
  st.timer = setInterval(tick, TICK_MS);
  st.timer.unref?.();
}

export const __testing = { st };
