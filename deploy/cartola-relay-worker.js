// Relay da API do Cartola em Cloudflare Workers (plano gratuito).
// A Globo costuma barrar IPs de provedores de nuvem (Vercel, Render, AWS…);
// IPs da Cloudflare em geral passam. O site fala com este Worker e o Worker
// fala com a Globo. Passo a passo em docs/CARTOLA.md.
const UPSTREAM = "https://api.cartolafc.globo.com";
// Opcional: defina RELAY_KEY no Worker e a mesma chave em CARTOLA_RELAY_KEY no site.

export default {
  async fetch(request, env) {
    if (env.RELAY_KEY && request.headers.get("x-relay-key") !== env.RELAY_KEY) {
      return new Response("não autorizado", { status: 401 });
    }
    const url = new URL(request.url);
    if (request.method !== "GET" && request.method !== "POST") return new Response("método não permitido", { status: 405 });
    const headers = new Headers();
    for (const h of ["accept", "content-type", "authorization", "x-glb-token"]) {
      const v = request.headers.get(h);
      if (v) headers.set(h, v);
    }
    headers.set("user-agent", "Mozilla/5.0 (compatible; TropaFC/1.0)");
    const res = await fetch(UPSTREAM + url.pathname + url.search, {
      method: request.method,
      headers,
      body: request.method === "POST" ? await request.text() : undefined,
      cf: { cacheTtl: request.method === "GET" ? 30 : 0, cacheEverything: request.method === "GET" },
    });
    return new Response(res.body, { status: res.status, headers: { "content-type": res.headers.get("content-type") ?? "application/json" } });
  },
};
