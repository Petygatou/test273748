/**
 * Diagnóstico da conexão com a API do Cartola, visto do servidor onde o site
 * roda (somente servidor). Mostra, por host, o que a Globo respondeu.
 */
import { CARTOLA_HOSTS } from "./cartolaHttp";

export interface HostProbe {
  host: string;
  ok: boolean;
  status?: number;
  ms: number;
  /** em linguagem simples */
  leitura: string;
  /** trecho da resposta (para entender bloqueios) */
  trecho?: string;
  server?: string;
}

function leitura(status: number | undefined, trecho: string, erro?: string): string {
  if (erro) {
    if (/abort|timeout/i.test(erro)) return "Sem resposta no tempo limite: o servidor não alcança a Globo (rede/firewall do provedor).";
    if (/ENOTFOUND|getaddrinfo/i.test(erro)) return "O endereço não foi encontrado (DNS do servidor).";
    if (/ECONNREFUSED|ECONNRESET|refused|reset/i.test(erro)) return "A conexão foi recusada: o provedor ou a Globo está barrando o servidor.";
    if (/certificate|SSL|TLS/i.test(erro)) return "Falha de certificado (HTTPS) na conexão.";
    return `Falha de rede: ${erro}`;
  }
  if (status === 200) return "Funcionando.";
  if (status === 403 || status === 401) return "A Globo bloqueou este servidor (403). É o bloqueio comum a IPs de provedores de nuvem; a solução é passar por um relay (veja docs/CARTOLA.md).";
  if (status === 429) return "Limite de requisições: a Globo pediu para esperar. Aguarde alguns minutos.";
  if (status === 404) return "Rota não encontrada neste host.";
  if (status && status >= 500) return /manuten|maintenance/i.test(trecho) ? "O Cartola está em manutenção." : "Erro do lado da Globo (5xx).";
  return `Resposta inesperada (HTTP ${status}).`;
}

export interface FotoProbe {
  atletas: number;
  comFoto: number;
  exemplo?: string;
  /** rostos vindos da API-Football (elencos lidos aos poucos) */
  apiFootball?: ReturnType<typeof import("./fotosApiFootball")["fotosResumo"]>;
  /** o servidor do site conseguiu baixar a imagem de exemplo? */
  servidor: "ok" | "falhou" | "sem-foto";
  leitura: string;
}

/** Confere se a API manda foto dos atletas e se o servidor consegue buscá-la. */
export async function probeFotos(): Promise<FotoProbe> {
  const { loadSeason } = await import("./season");
  const { data } = await loadSeason();
  const comFoto = data.athletes.filter((a) => a.foto).length;
  const { fotosResumo } = await import("./fotosApiFootball");
  const extra = fotosResumo(data.athletes);
  const exemplo = data.athletes.find((a) => a.foto)?.foto;
  if (!exemplo) {
    return {
      apiFootball: extra,
      atletas: data.athletes.length,
      comFoto,
      servidor: "sem-foto",
      leitura: data.source === "demo" ? "Modo Demonstração: atletas fictícios não têm foto." : "A API do Cartola não enviou foto para nenhum atleta (campo vazio). Sem foto oficial o site mostra o rosto ilustrado.",
    };
  }
  const { proxyFoto } = await import("./foto");
  const res = await proxyFoto(exemplo);
  const ok = res.status === 200;
  return {
    apiFootball: extra,
    atletas: data.athletes.length,
    comFoto,
    exemplo,
    servidor: ok ? "ok" : "falhou",
    leitura: ok
      ? `${comFoto} de ${data.athletes.length} atletas têm foto e o servidor consegue buscá-la. Se o navegador não mostra, o bloqueio é do lado do visitante (extensão, rede) e o site já tenta pelo servidor como alternativa.`
      : `${comFoto} atletas têm foto na API, mas nem o servidor consegue baixar a imagem de exemplo (HTTP ${res.status}). O CDN de imagens da Globo está barrando este servidor; veja o endereço de exemplo abaixo.`,
  };
}

export async function probeCartola(): Promise<{ hosts: HostProbe[]; proxy: boolean; variaveis: Record<string, string | null>; fotos: FotoProbe | null; escalacao: (Awaited<ReturnType<typeof import("./watcher")["watcherStatus"]>>["escalacaoOficial"] & { chave: import("./escalacoes").ApiFootballProbe; jogos: ReturnType<typeof import("./escalacoes")["fixturesSummary"]> }) | null }> {
  const hosts: HostProbe[] = [];
  for (const host of CARTOLA_HOSTS) {
    const t0 = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(`${host}/mercado/status`, { headers: { "User-Agent": "Mozilla/5.0 (compatible; TropaFC/1.0)", Accept: "application/json" }, signal: ctrl.signal });
      const text = (await res.text()).slice(0, 240).replace(/\s+/g, " ");
      hosts.push({ host, ok: res.ok, status: res.status, ms: Date.now() - t0, leitura: leitura(res.status, text), trecho: res.ok ? undefined : text, server: res.headers.get("server") ?? undefined });
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}${e.cause instanceof Error ? ` (${e.cause.message})` : ""}` : String(e);
      hosts.push({ host, ok: false, ms: Date.now() - t0, leitura: leitura(undefined, "", msg), trecho: msg });
    } finally {
      clearTimeout(timer);
    }
  }
  const env = (k: string) => process.env[k] ?? null;
  const fotos = await probeFotos().catch(() => null);
  const escalacao = await (async () => {
    try {
      const w = await import("./watcher");
      const e = await import("./escalacoes");
      const { loadSeason } = await import("./season");
      const { data } = await loadSeason().catch(() => ({ data: null }));
      return { ...w.watcherStatus().escalacaoOficial, chave: await e.probeApiFootball(), jogos: data ? w.officialFixtures(data.clubs) : [] };
    } catch {
      return null;
    }
  })();
  return {
    fotos,
    escalacao,
    hosts,
    proxy: CARTOLA_HOSTS.some((h) => !/globo\.com$/i.test(new URL(h).hostname)),
    variaveis: { DATA_MODE: env("DATA_MODE"), CARTOLA_API_HOSTS: env("CARTOLA_API_HOSTS"), VERCEL_REGION: env("VERCEL_REGION") },
  };
}
