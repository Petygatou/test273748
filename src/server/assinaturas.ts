/**
 * Assinatura paga pela Cakto (somente servidor).
 *
 * Fluxo: a pessoa cria a conta no Tropa, paga no checkout da Cakto com o MESMO e-mail e a
 * Cakto avisa o servidor (webhook em /api/cakto). O aviso libera, renova ou corta o acesso
 * daquele e-mail. O admin também pode liberar um e-mail à mão (cortesia).
 *
 * O bloqueio só vale com "Cobrança ligada" no Painel ADM → Assinaturas. Admins sempre entram.
 * O segredo do webhook é colado no Painel ADM (fica só no servidor, nunca volta para o navegador)
 * ou vem da variável de ambiente CAKTO_WEBHOOK_SECRET, que tem prioridade.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { db, emit, type AssinaturaRow, type ConfigPagamentoRow, type PlanoRow, type UserRow } from "./db";

const DIA = 86_400_000;
/** sem data de renovação no aviso: um mês + folga para a cobrança da renovação cair */
const DIAS_POR_PAGAMENTO = 31;
const FOLGA_DIAS = 3;
const MAX_EVENTOS = 60;
/** cortesia "sem prazo" */
const SEM_PRAZO = "9999-12-31T00:00:00.000Z";

export function config(): ConfigPagamentoRow {
  return db.configPagamento.get("pagamento") ?? { id: "pagamento", ativo: false, checkout: "", produto: "", atualizadoEm: "" };
}

/** Planos à venda. Configuração antiga (um link só) vira um plano. */
export function planos(c = config()): PlanoRow[] {
  if (c.planos?.length) return c.planos;
  return c.checkout ? [{ id: "principal", nome: "Tropa completo", preco: "", descricao: "", checkout: c.checkout }] : [];
}

function limparPlanos(lista: PlanoRow[]): PlanoRow[] {
  const ok: PlanoRow[] = [];
  lista.slice(0, 6).forEach((pl, i) => {
    const nome = pl.nome.trim().slice(0, 40);
    const checkout = pl.checkout.trim();
    if (!nome && !checkout) return; // linha vazia
    if (!nome) throw new Error(`Dê um nome ao plano ${i + 1}.`);
    if (!/^https:\/\/[^\s]+$/.test(checkout)) throw new Error(`O link do plano “${nome}” precisa começar com https://`);
    ok.push({ id: pl.id?.trim() || `p${Date.now().toString(36)}${i}`, nome, preco: pl.preco.trim().slice(0, 30), descricao: pl.descricao.trim().slice(0, 160), checkout });
  });
  return ok;
}

export function salvarConfig(p: { ativo: boolean; checkout: string; produto: string; segredo?: string; planos?: PlanoRow[] }) {
  const lista = p.planos ? limparPlanos(p.planos) : undefined;
  const checkout = (lista ? (lista[0]?.checkout ?? "") : p.checkout).trim();
  const novo = p.segredo?.trim() ?? "";
  if (novo && (novo.length < 16 || /\s/.test(novo))) throw new Error("A chave do webhook parece incompleta: copie de novo da Cakto, sem espaços.");
  const segredo = novo || config().segredo || "";
  if (p.ativo && !segredoDefinido() && !segredo) throw new Error("Cole a chave do webhook da Cakto antes de ligar a cobrança.");
  if (checkout && !/^https:\/\/[^\s]+$/.test(checkout)) throw new Error("O link do checkout precisa começar com https://");
  if (p.ativo && !checkout) throw new Error("Cole o link do checkout da Cakto antes de ligar a cobrança.");
  db.configPagamento.put({ id: "pagamento", ativo: p.ativo, checkout, produto: p.produto.trim(), segredo, planos: lista ?? config().planos, atualizadoEm: new Date().toISOString() });
  emit("assinaturas");
}

/** Segredo em uso: o da variável de ambiente, se houver; senão, o colado no Painel ADM. */
const segredoAtual = () => process.env.CAKTO_WEBHOOK_SECRET?.trim() || config().segredo || "";
export const segredoDefinido = () => Boolean(segredoAtual());

export function acessoValido(a: AssinaturaRow | undefined, agora = Date.now()) {
  return Boolean(a && a.status !== "estornada" && new Date(a.validaAte).getTime() > agora);
}

/** Quem pode ver as páginas pagas. Sem cobrança ligada, todo mundo. */
export function temAcesso(u: UserRow | null, eAdmin: (u: UserRow) => boolean): boolean {
  if (!config().ativo) return true;
  if (!u) return false;
  if (eAdmin(u)) return true;
  return acessoValido(db.assinaturas.get(u.email));
}

/** Link do checkout com o e-mail da conta já preenchido (padrão: o do primeiro plano). */
export function linkCheckout(email?: string | null, url = config().checkout): string | null {
  const c = url;
  if (!c) return null;
  if (!email) return c;
  try {
    const u = new URL(c);
    u.searchParams.set("email", email);
    return u.toString();
  } catch {
    return c;
  }
}

/* ------------------------------ cortesia (admin) ------------------------------ */

export function liberar(emailBruto: string, dias: number) {
  const email = emailBruto.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("E-mail inválido.");
  const ate = dias > 0 ? new Date(Date.now() + dias * DIA).toISOString() : SEM_PRAZO;
  const atual = db.assinaturas.get(email);
  // cortesia nunca encurta um acesso pago que vai além
  const validaAte = atual && acessoValido(atual) && atual.validaAte > ate ? atual.validaAte : ate;
  const row = db.assinaturas.put({
    ...(atual ?? {}),
    id: email,
    email,
    status: "ativa",
    validaAte,
    origem: atual?.origem === "cakto" && validaAte === atual.validaAte ? "cakto" : "cortesia",
    atualizadoEm: new Date().toISOString(),
  });
  emit("assinaturas");
  return row;
}

export function remover(emailBruto: string) {
  const email = emailBruto.trim().toLowerCase();
  if (!db.assinaturas.remove(email)) throw new Error("Esse e-mail não tem acesso registrado.");
  emit("assinaturas");
}

/* ------------------------------ webhook da Cakto ------------------------------ */

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj => (x && typeof x === "object" && !Array.isArray(x) ? (x as Obj) : {});
const txt = (x: unknown) => (typeof x === "string" ? x.trim() : typeof x === "number" ? String(x) : "");

/** Primeiro texto não vazio entre vários caminhos ("data.customer.email" etc.). */
function pegar(raiz: Obj, caminhos: string[]): string {
  for (const c of caminhos) {
    let cur: unknown = raiz;
    for (const parte of c.split(".")) cur = obj(cur)[parte];
    const v = txt(cur);
    if (v) return v;
  }
  return "";
}

/** Compara o segredo sem revelar, pelo tempo de resposta, quantos caracteres acertou. */
export function segredoConfere(recebido: string, esperado = segredoAtual()): boolean {
  if (!esperado || !recebido) return false;
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(recebido.trim()), h(esperado));
}

export type Efeito = "liberar" | "cancelar" | "atrasar" | "estornar" | null;

/** O que cada aviso da Cakto faz com o acesso (os demais só ficam no histórico). */
export function efeitoDoEvento(evento: string): Efeito {
  const e = evento.toLowerCase().replace(/[.\s-]+/g, "_");
  if (/chargeback|refund|reembolso|estorno/.test(e)) return "estornar";
  if (/renewal_refused|renovacao_recusada|payment_failed/.test(e)) return "atrasar";
  if (/subscription_cancel|cancelad|canceled|cancelled/.test(e)) return "cancelar";
  if (/purchase_approved|subscription_renewed|compra_aprovada|renovad|order_paid/.test(e)) return "liberar";
  return null;
}

export interface AvisoCakto {
  evento: string;
  email: string;
  produto: string;
  pedido: string;
  /** próxima cobrança, quando o aviso informa */
  proximaCobranca: string;
  segredo: string;
  campos: string[];
}

/** Lê o aviso em qualquer um dos formatos conhecidos (campos em inglês, camelCase ou snake_case). */
export function lerAviso(corpo: unknown): AvisoCakto {
  const r = { ...obj(corpo) };
  // "data" pode vir como texto JSON ou como lista de um item
  if (typeof r.data === "string" && r.data.trim().startsWith("{")) {
    try {
      r.data = JSON.parse(r.data);
    } catch {
      /* fica como está */
    }
  }
  if (Array.isArray(r.data)) r.data = r.data[0];
  const data = obj(r.data);
  return {
    evento: pegar(r, ["event", "evento", "type", "data.event"]),
    email: pegar(r, ["data.customer.email", "data.customer_email", "data.customerEmail", "data.email", "data.buyer.email", "customer.email", "email"]).toLowerCase(),
    produto: pegar(r, ["data.product.id", "data.product_id", "data.productId", "data.offer.product", "data.product.short_id", "product.id"]),
    pedido: pegar(r, ["data.id", "data.refId", "data.ref_id", "data.order_id", "data.orderId", "order.id"]),
    proximaCobranca: pegar(r, [
      "data.subscription.next_payment_date",
      "data.subscription.nextPaymentDate",
      "data.subscription.next_charge_date",
      "data.subscription.current_period_end",
      "data.next_payment_date",
      "data.nextPaymentDate",
    ]),
    segredo: pegar(r, ["secret", "data.secret"]),
    campos: [
      ...Object.keys(r).filter((k) => k !== "secret"),
      ...Object.keys(data).map((k) => `data.${k}`),
      ...(r.data != null && !Object.keys(data).length ? [`data: ${Array.isArray(r.data) ? "lista" : typeof r.data}${typeof r.data === "object" ? " vazio" : ""}`] : []),
    ].slice(0, 40),
  };
}

/** Aplica um aviso já autenticado. Devolve o que foi feito (fica no histórico do Painel ADM). */
export function aplicarAviso(a: AvisoCakto, agora = Date.now()): string {
  const efeito = efeitoDoEvento(a.evento);
  // um ou mais IDs de produto (separados por vírgula ou espaço); vazio = qualquer produto
  const filtro = config()
    .produto.split(/[\s,;]+/)
    .filter(Boolean);
  let resultado: string;
  if (!efeito) resultado = "só registrado (não muda o acesso)";
  else if (!a.email) resultado = "ignorado: o aviso não trouxe e-mail";
  else if (filtro.length && a.produto && !filtro.includes(a.produto)) resultado = `ignorado: produto ${a.produto} não é um dos planos do Tropa`;
  else {
    const atual = db.assinaturas.get(a.email);
    const base = {
      id: a.email,
      email: a.email,
      origem: "cakto" as const,
      produto: a.produto || atual?.produto,
      pedido: a.pedido || atual?.pedido,
      ultimoEvento: a.evento,
      atualizadoEm: new Date(agora).toISOString(),
    };
    if (efeito === "liberar") {
      const prox = Date.parse(a.proximaCobranca);
      const ate = Number.isFinite(prox) && prox > agora ? prox + FOLGA_DIAS * DIA : agora + (DIAS_POR_PAGAMENTO + FOLGA_DIAS) * DIA;
      // renovação antecipada ou aviso repetido: nunca encurta
      const validaAte = new Date(Math.max(ate, atual && acessoValido(atual, agora) ? Date.parse(atual.validaAte) : 0)).toISOString();
      db.assinaturas.put({ ...base, status: "ativa", validaAte });
      resultado = `acesso liberado até ${validaAte.slice(0, 10)}`;
    } else if (!atual) resultado = "sem acesso registrado para esse e-mail";
    else if (efeito === "estornar") {
      db.assinaturas.put({ ...atual, ...base, status: "estornada", validaAte: new Date(agora).toISOString() });
      resultado = "acesso cortado (reembolso/chargeback)";
    } else {
      db.assinaturas.put({ ...atual, ...base, status: efeito === "cancelar" ? "cancelada" : "atrasada" });
      resultado = `${efeito === "cancelar" ? "não renova mais" : "renovação recusada"}; acesso vale até ${atual.validaAte.slice(0, 10)}`;
    }
  }
  registrarEvento(a, resultado, agora);
  emit("assinaturas");
  return resultado;
}

function registrarEvento(a: AvisoCakto, resultado: string, agora: number) {
  db.eventosPagamento.put({
    id: `${agora.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    evento: a.evento || "(sem nome)",
    email: a.email,
    produto: a.produto,
    pedido: a.pedido,
    resultado,
    campos: a.campos,
    recebidoEm: new Date(agora).toISOString(),
  });
  const todos = db.eventosPagamento.all().sort((x, y) => y.recebidoEm.localeCompare(x.recebidoEm));
  for (const velho of todos.slice(MAX_EVENTOS)) db.eventosPagamento.remove(velho.id);
}

/** Recusa registrada no histórico (segredo errado), sem gravar nada do corpo além do resumo. */
export function registrarRecusa(a: AvisoCakto, motivo: string) {
  registrarEvento(a, `recusado: ${motivo}`, Date.now());
  emit("assinaturas");
}

/* ------------------------------ painel ------------------------------ */

export function painel() {
  const agora = Date.now();
  const lista = db.assinaturas
    .all()
    .map((a) => ({ ...a, valida: acessoValido(a, agora), semPrazo: a.validaAte === SEM_PRAZO, temConta: Boolean(db.users.find((u) => u.email === a.email)) }))
    .sort((x, y) => Number(y.valida) - Number(x.valida) || y.atualizadoEm.localeCompare(x.atualizadoEm));
  return {
    config: { ...config(), segredo: undefined, planos: planos() },
    segredoDefinido: segredoDefinido(),
    segredoNaVariavel: Boolean(process.env.CAKTO_WEBHOOK_SECRET?.trim()),
    resumo: {
      ativas: lista.filter((a) => a.valida && a.origem === "cakto").length,
      cortesias: lista.filter((a) => a.valida && a.origem === "cortesia").length,
      vencidas: lista.filter((a) => !a.valida).length,
    },
    lista,
    eventos: db.eventosPagamento.all().sort((x, y) => y.recebidoEm.localeCompare(x.recebidoEm)),
  };
}
