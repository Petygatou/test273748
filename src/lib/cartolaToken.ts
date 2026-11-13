/**
 * Acha o token do Cartola em qualquer coisa que a pessoa colar: o "Copy as cURL" inteiro,
 * o "Copy as fetch", a linha do cabeçalho, "Bearer xxx" ou só o token.
 */
const TOKEN = "([A-Za-z0-9._~+/=-]{20,})";

export function extrairTokenCartola(texto: string): string | null {
  const t = texto.trim();
  if (!t) return null;
  const padroes = [
    new RegExp(`authorization["']?\\s*[:=]\\s*["']?\\s*bearer\\s+${TOKEN}`, "i"),
    new RegExp(`x-glb-token["']?\\s*[:=]\\s*["']?\\s*${TOKEN}`, "i"),
    new RegExp(`^bearer\\s+${TOKEN}$`, "i"),
  ];
  for (const p of padroes) {
    const m = t.match(p);
    if (m) return m[1];
  }
  // só o token: uma "palavra" longa, sem espaços
  return /^[A-Za-z0-9._~+/=-]{20,}$/.test(t) ? t : null;
}

/**
 * Quando o token do login novo (OIDC/JWT) expira, em ms — lido do próprio token, sem enviá-lo
 * a lugar nenhum. O Cartola libera esse acesso por cerca de 1 hora. Token antigo: null.
 */
export function tokenExpiraEm(token: string): number | null {
  const partes = token.replace(/^Bearer\s+/i, "").split(".");
  if (partes.length !== 3) return null;
  try {
    const b64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4))) as { exp?: unknown };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Já expirou (ou expira no próximo meio minuto)? */
export function tokenExpirado(token: string, agora = Date.now()): boolean {
  const e = tokenExpiraEm(token);
  return e != null && e <= agora + 30_000;
}

/**
 * Código do favorito "Conectar ao Tropa". A pessoa salva uma vez; com o Cartola aberto e logado,
 * um clique acha o acesso dela e volta para o Tropa já conectado (o acesso vai no "#" do endereço,
 * que nunca é enviado a servidor nenhum).
 *  1. procura tokens no armazenamento do próprio Cartola e testa cada um em /auth/time;
 *  2. se não achar, escuta a próxima chamada do Cartola à API e pega o acesso dela.
 */
export function fonteFavorito(destino: string, api = "https://api.cartola.globo.com"): string {
  return `(function(){var D=${JSON.stringify(destino)},A=${JSON.stringify(api)},R=/eyJ[\\w-]+\\.[\\w-]+\\.[\\w-]+/g,feito=0;
function ex(t){try{var b=t.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");var p=JSON.parse(atob(b+"===".slice((b.length+3)%4)));return p.exp?p.exp*1e3:0}catch(e){return 0}}
function ir(t){if(feito)return;feito=1;aviso.textContent="Tropa: conectado! Voltando…";location.href=D+"#ctoken="+encodeURIComponent(String(t).replace(/^bearer\\s+/i,""))}
if(!/(^|\\.)globo\\.com$/.test(location.hostname)){alert("Abra o cartola.globo.com, entre na sua conta e toque neste favorito de novo.");location.href="https://cartola.globo.com";return}
var aviso=document.createElement("div");aviso.style.cssText="position:fixed;z-index:2147483647;left:12px;right:12px;bottom:12px;padding:14px 16px;border-radius:14px;background:#14151a;color:#fff;font:600 15px/1.4 system-ui,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.5);border:2px solid #ff7a1a";aviso.textContent="Tropa: procurando o acesso da sua conta…";document.body.appendChild(aviso);
var c=[];[window.localStorage,window.sessionStorage].forEach(function(s){try{for(var i=0;i<s.length;i++){var m=(s.getItem(s.key(i))||"").match(R);if(m)c=c.concat(m)}}catch(e){}});var mc=document.cookie.match(R);if(mc)c=c.concat(mc);
var agora=Date.now();c=c.filter(function(t,i){return c.indexOf(t)==i&&ex(t)>agora+6e4}).sort(function(a,b){return ex(b)-ex(a)});
function pega(k,v){if(v&&(/^authorization$/i.test(k)&&/^bearer\\s+/i.test(v)||/^x-glb-token$/i.test(k)))ir(v)}
function esperar(){aviso.textContent="Tropa: quase lá! Toque em \\u201cMeu time\\u201d (ou em outra aba do Cartola) para concluir.";
var f=window.fetch;window.fetch=function(u,o){try{var h=(o&&o.headers)||(u&&u.headers);if(h){if(h.get){pega("authorization",h.get("authorization"));pega("x-glb-token",h.get("x-glb-token"))}else for(var k in h)pega(k,h[k])}}catch(e){}return f.apply(this,arguments)};
var sh=XMLHttpRequest.prototype.setRequestHeader;XMLHttpRequest.prototype.setRequestHeader=function(k,v){try{pega(k,v)}catch(e){}return sh.apply(this,arguments)}}
function testar(i){if(i>=c.length)return esperar();fetch(A+"/auth/time",{headers:{Authorization:"Bearer "+c[i]}}).then(function(r){r.ok?ir(c[i]):testar(i+1)}).catch(function(){testar(i+1)})}
testar(0)})()`;
}

export const codigoFavorito = (destino: string, api?: string) => "javascript:" + encodeURIComponent(fonteFavorito(destino, api));

/** Acesso que chegou no endereço (#ctoken=…) pelo favorito; null se não houver. */
export function tokenDoEndereco(hash: string): string | null {
  const m = hash.match(/[#&]ctoken=([^&]+)/);
  if (!m) return null;
  try {
    return extrairTokenCartola(decodeURIComponent(m[1]));
  } catch {
    return null;
  }
}
