/** Server functions: acesso pago (Cakto) para o site e para o Painel ADM. */
import { createServerFn } from "@tanstack/react-start";

type Obj = Record<string, unknown>;
const obj = (d: unknown): Obj => (d && typeof d === "object" && !Array.isArray(d) ? (d as Obj) : {});
const s = (x: unknown, max = 500) => (typeof x === "string" ? x.slice(0, max) : "");

/** O que o site precisa para decidir se mostra a página ou o convite para assinar. */
export const fetchAcesso = createServerFn({ method: "GET" }).handler(async () => {
  const { currentUser, isAdmin } = await import("./auth");
  const { config, temAcesso, linkCheckout, acessoValido, planos } = await import("./assinaturas");
  const { db } = await import("./db");
  const u = currentUser();
  const c = config();
  const a = u ? db.assinaturas.get(u.email) : undefined;
  return {
    exigido: c.ativo,
    liberado: temAcesso(u, isAdmin),
    logado: Boolean(u),
    checkout: linkCheckout(u?.email),
    planos: planos(c).map((p) => ({ id: p.id, nome: p.nome, preco: p.preco, descricao: p.descricao, checkout: linkCheckout(u?.email, p.checkout) })),
    assinatura: a ? { status: a.status, validaAte: a.validaAte, origem: a.origem, valida: acessoValido(a) } : null,
  };
});

export const adminAssinaturasFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("./auth");
  requireAdmin();
  const { painel } = await import("./assinaturas");
  return painel();
});

export const adminAssinaturaAcaoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const o = obj(d);
    const acao = s(o.acao, 20);
    if (acao === "config") {
      const planos = Array.isArray(o.planos)
        ? o.planos.slice(0, 6).map((x) => {
            const p = obj(x);
            return { id: s(p.id, 40), nome: s(p.nome, 60), preco: s(p.preco, 40), descricao: s(p.descricao, 200), checkout: s(p.checkout, 400) };
          })
        : undefined;
      return { acao, ativo: o.ativo === true, checkout: s(o.checkout, 400), produto: s(o.produto, 300), segredo: s(o.segredo, 300), planos } as const;
    }
    if (acao === "liberar") return { acao, email: s(o.email, 200), dias: Math.max(0, Math.min(3650, Math.round(Number(o.dias) || 0))) } as const;
    if (acao === "remover") return { acao, email: s(o.email, 200) } as const;
    throw new Error("Ação inválida.");
  })
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./auth");
    requireAdmin();
    const m = await import("./assinaturas");
    if (data.acao === "config") m.salvarConfig(data);
    else if (data.acao === "liberar") m.liberar(data.email, data.dias);
    else m.remover(data.email);
    return { ok: true };
  });
