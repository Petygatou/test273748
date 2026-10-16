/**
 * Central de Notícias: agrega feeds RSS no servidor (cache de 5 min),
 * classifica cada manchete por regras determinísticas e cruza com o mercado
 * para apontar quais atletas e clubes são citados — e o possível impacto.
 */
import type { Athlete, Club } from "../engine/types";
import { cached, pool } from "./cache";

export type NewsCategory = "Desfalques" | "Escalações" | "Mercado" | "Cartola" | "Geral";

export interface NewsItem {
  id: string;
  titulo: string;
  resumo: string;
  link: string;
  fonte: string;
  publicadoEm: string | null;
  categoria: NewsCategory;
  atletas: Array<{ id: number; apelido: string; clubeId: number; impacto: string | null }>;
  clubes: number[];
}

const DEFAULT_FEEDS = [
  "https://news.google.com/rss/search?q=Cartola+FC&hl=pt-BR&gl=BR&ceid=BR:pt-419",
  "https://news.google.com/rss/search?q=Brasileir%C3%A3o+desfalque+OR+les%C3%A3o+OR+suspenso&hl=pt-BR&gl=BR&ceid=BR:pt-419",
  "https://news.google.com/rss/search?q=Brasileir%C3%A3o+escala%C3%A7%C3%A3o+prov%C3%A1vel&hl=pt-BR&gl=BR&ceid=BR:pt-419",
];

function feeds(): string[] {
  const env = typeof process !== "undefined" ? process.env.NEWS_FEEDS : undefined;
  return env ? env.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_FEEDS;
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : "";
}

export function parseRss(xml: string): Array<{ titulo: string; link: string; resumo: string; fonte: string; publicadoEm: string | null }> {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  return items.map((it) => {
    let titulo = tag(it, "title");
    let fonte = tag(it, "source");
    // Google News: "Manchete - Veículo"
    const dash = titulo.lastIndexOf(" - ");
    if (!fonte && dash > 0) fonte = titulo.slice(dash + 3);
    if (dash > 0 && fonte && titulo.endsWith(fonte)) titulo = titulo.slice(0, dash);
    const linkTag = tag(it, "link") || (it.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? "");
    const date = tag(it, "pubDate") || tag(it, "updated") || tag(it, "published");
    const parsed = date ? new Date(date) : null;
    let resumo = tag(it, "description") || tag(it, "summary");
    if (resumo.startsWith(titulo)) resumo = resumo.slice(titulo.length).trim();
    return {
      titulo,
      link: linkTag,
      resumo: resumo.slice(0, 280),
      fonte: fonte || "Portal esportivo",
      publicadoEm: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
    };
  });
}

const RULES: Array<{ cat: NewsCategory; re: RegExp }> = [
  { cat: "Desfalques", re: /\b(les[ãa]o|lesionad|desfalque|suspens|vetad|poupad|fora do jogo|fora da partida|cirurgia|contus|dores?|departamento m[ée]dico|DM\b|cart[ãa]o vermelho|terceiro amarelo|pendurad)/i },
  { cat: "Escalações", re: /\b(escala[çc][ãa]o|prov[áa]vel|titular|relacionad|time base|onze inicial|treino|esbo[çc]a)/i },
  { cat: "Mercado", re: /\b(contrata|refor[çc]o|transfer[êe]ncia|negocia|proposta|empr[ée]stimo|venda|rescis)/i },
  { cat: "Cartola", re: /\b(cartola|cartoleiro|mitar|capit[ãa]o|valoriza|cartoletas|parciais)/i },
];

export function classify(text: string): NewsCategory {
  for (const r of RULES) if (r.re.test(text)) return r.cat;
  return "Geral";
}

function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function linkEntities(text: string, athletes: Athlete[], clubs: Record<number, Club>, categoria: NewsCategory) {
  const t = ` ${norm(text)} `;
  const found: NewsItem["atletas"] = [];
  const counts = new Map<string, number>();
  for (const a of athletes) counts.set(norm(a.apelido), (counts.get(norm(a.apelido)) ?? 0) + 1);
  const clubesCitados = Object.values(clubs)
    .filter((c) => t.includes(` ${norm(c.nome)} `) || t.includes(` ${norm(c.nome)},`) || t.includes(` ${norm(c.nome)}:`))
    .map((c) => c.id);
  for (const a of athletes) {
    const n = norm(a.apelido);
    if (n.length < 4) continue;
    const ambiguous = (counts.get(n) ?? 0) > 1;
    const re = new RegExp(`[^a-z0-9]${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^a-z0-9]`);
    if (!re.test(t)) continue;
    // apelidos repetidos só contam se o clube também for citado
    if (ambiguous && !clubesCitados.includes(a.clubeId)) continue;
    const impacto =
      categoria === "Desfalques"
        ? "Possível desfalque — confira o status antes de escalar"
        : categoria === "Escalações"
          ? "Notícia sobre escalação — pode mudar a probabilidade de jogar"
          : null;
    found.push({ id: a.id, apelido: a.apelido, clubeId: a.clubeId, impacto });
    if (found.length >= 6) break;
  }
  return { atletas: found, clubes: clubesCitados };
}

async function fetchFeed(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 ComandanteFC/1.0" }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function loadNews(athletes: Athlete[], clubs: Record<number, Club>, force = false): Promise<{ items: NewsItem[]; fontes: number; erro?: string }> {
  const key = "news:feeds";
  if (force) {
    const { invalidate } = await import("./cache");
    invalidate(key);
  }
  return cached(key, 5 * 60_000, async () => {
    const urls = feeds();
    let ok = 0;
    const lists = await pool(urls, 4, async (u) => {
      try {
        const xml = await fetchFeed(u);
        ok++;
        return parseRss(xml);
      } catch {
        return [];
      }
    });
    const seen = new Set<string>();
    const items: NewsItem[] = [];
    for (const it of lists.flat()) {
      const k = norm(it.titulo).slice(0, 80);
      if (!it.titulo || seen.has(k)) continue;
      seen.add(k);
      const text = `${it.titulo} ${it.resumo}`;
      const categoria = classify(text);
      const ent = linkEntities(text, athletes, clubs, categoria);
      items.push({ id: k.replace(/[^a-z0-9]+/g, "-").slice(0, 60), ...it, categoria, ...ent });
    }
    items.sort((a, b) => (b.publicadoEm ?? "").localeCompare(a.publicadoEm ?? ""));
    if (!ok) throw new Error("Nenhum feed respondeu");
    return { items: items.slice(0, 80), fontes: ok };
  });
}

/** Manchetes de demonstração geradas a partir dos dados (quando os feeds não respondem). */
export function demoNews(athletes: Athlete[], clubs: Record<number, Club>): NewsItem[] {
  const pick = athletes.filter((a) => a.posicaoId !== 6 && a.jogos > 8).slice(0, 400);
  const out: NewsItem[] = [];
  const templates: Array<[NewsCategory, (a: Athlete, c: Club) => string, string]> = [
    ["Desfalques", (a, c) => `${a.apelido} sente dores e vira dúvida no ${c.nome}`, "Departamento médico reavalia o atleta no último treino antes da rodada."],
    ["Escalações", (a, c) => `${c.nome} deve ter ${a.apelido} entre os titulares`, "Treinador esboçou o time com o atleta no treino desta manhã."],
    ["Mercado", (a, c) => `${c.nome} recusa proposta por ${a.apelido}`, "Diretoria considera o atleta peça importante para a sequência da temporada."],
    ["Cartola", (a) => `${a.apelido} é o mais escalado para a próxima rodada do Cartola`, "Atleta lidera a lista de mais escalados entre os cartoleiros."],
    ["Desfalques", (a, c) => `${a.apelido} cumpre suspensão e desfalca o ${c.nome}`, "Atleta recebeu o terceiro cartão amarelo na última rodada."],
  ];
  for (let i = 0; i < 18 && pick.length; i++) {
    const a = pick[(i * 37) % pick.length];
    const c = clubs[a.clubeId];
    if (!c) continue;
    const [cat, title, resumo] = templates[i % templates.length];
    const titulo = title(a, c);
    out.push({
      id: `demo-${i}`,
      titulo,
      resumo,
      link: "#",
      fonte: "Demonstração",
      publicadoEm: new Date(Date.UTC(2026, 9, 16, 12 - i)).toISOString(),
      categoria: cat,
      ...linkEntities(titulo, athletes, clubs, cat),
    });
  }
  return out;
}
