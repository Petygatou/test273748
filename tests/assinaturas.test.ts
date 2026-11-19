import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "cfc-assin-"));
process.env.CAKTO_WEBHOOK_SECRET = "segredo-de-teste-123";

const { db } = await import("../src/server/db");
const m = await import("../src/server/assinaturas");
const { Route } = await import("../src/routes/api/cakto");

const DIA = 86_400_000;
const agora = Date.parse("2026-11-19T12:00:00Z");
const usuario = (email: string) => ({ id: email, email }) as never;
const naoAdmin = () => false;

// formato do aviso da Cakto: { secret, event, data: { customer, product, subscription, ... } }
const aviso = (event: string, extra: Record<string, unknown> = {}) => ({
  secret: "segredo-de-teste-123",
  event,
  data: { id: "ped-1", customer: { name: "Fulano", email: "Fulano@Exemplo.com" }, product: { id: "prod-tropa", name: "Tropa" }, ...extra },
});

const post = (corpo: unknown, url = "https://tropa.test/api/cakto") =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Route.options as any).server.handlers.POST({ request: new Request(url, { method: "POST", body: JSON.stringify(corpo), headers: { "content-type": "application/json" } }) }) as Promise<Response>;

beforeEach(() => {
  for (const c of Object.values(db)) c._reset();
});

describe("avisos da Cakto", () => {
  it("lê o aviso: evento, e-mail em minúsculas, produto, pedido; o segredo não vai para os campos", () => {
    const a = m.lerAviso(aviso("purchase_approved"));
    expect(a).toMatchObject({ evento: "purchase_approved", email: "fulano@exemplo.com", produto: "prod-tropa", pedido: "ped-1", segredo: "segredo-de-teste-123" });
    expect(a.campos).not.toContain("secret");
    expect(a.campos).toContain("data.customer");
  });

  it("cada evento tem seu efeito", () => {
    expect(m.efeitoDoEvento("purchase_approved")).toBe("liberar");
    expect(m.efeitoDoEvento("subscription_renewed")).toBe("liberar");
    expect(m.efeitoDoEvento("subscription_canceled")).toBe("cancelar");
    expect(m.efeitoDoEvento("subscription_renewal_refused")).toBe("atrasar");
    expect(m.efeitoDoEvento("refund")).toBe("estornar");
    expect(m.efeitoDoEvento("chargeback")).toBe("estornar");
    expect(m.efeitoDoEvento("pix_gerado")).toBeNull();
    expect(m.efeitoDoEvento("checkout_abandonment")).toBeNull();
  });

  it("compra aprovada libera por um mês e alguns dias; renovação estende; cancelar mantém até o fim", () => {
    m.aplicarAviso(m.lerAviso(aviso("purchase_approved")), agora);
    const a1 = db.assinaturas.get("fulano@exemplo.com")!;
    expect(a1.status).toBe("ativa");
    expect(Date.parse(a1.validaAte) - agora).toBe(34 * DIA);

    m.aplicarAviso(m.lerAviso(aviso("subscription_renewed", { subscription: { next_payment_date: "2027-01-19T12:00:00Z" } })), agora + 30 * DIA);
    expect(db.assinaturas.get("fulano@exemplo.com")!.validaAte).toBe("2027-01-22T12:00:00.000Z");

    m.aplicarAviso(m.lerAviso(aviso("subscription_canceled")), agora + 31 * DIA);
    const a3 = db.assinaturas.get("fulano@exemplo.com")!;
    expect(a3.status).toBe("cancelada");
    expect(a3.validaAte).toBe("2027-01-22T12:00:00.000Z");
    expect(m.acessoValido(a3, Date.parse("2027-01-20T00:00:00Z"))).toBe(true);
    expect(m.acessoValido(a3, Date.parse("2027-01-23T00:00:00Z"))).toBe(false);
  });

  it("reembolso e chargeback cortam o acesso na hora", () => {
    m.aplicarAviso(m.lerAviso(aviso("purchase_approved")), agora);
    m.aplicarAviso(m.lerAviso(aviso("chargeback")), agora + DIA);
    const a = db.assinaturas.get("fulano@exemplo.com")!;
    expect(a.status).toBe("estornada");
    expect(m.acessoValido(a, agora + DIA + 1)).toBe(false);
  });

  it("com produto definido no painel, outro produto não libera", () => {
    m.salvarConfig({ ativo: false, checkout: "", produto: "prod-tropa" });
    const r = m.aplicarAviso(m.lerAviso({ ...aviso("purchase_approved"), data: { customer: { email: "x@y.com" }, product: { id: "outro" } } }), agora);
    expect(r).toMatch(/ignorado/);
    expect(db.assinaturas.get("x@y.com")).toBeUndefined();
  });
});

describe("webhook /api/cakto", () => {
  it("segredo errado ou ausente: 401 e nada muda (fica no histórico como recusado)", async () => {
    expect((await post({ ...aviso("purchase_approved"), secret: "chute" })).status).toBe(401);
    const { secret: _s, ...sem } = aviso("purchase_approved");
    expect((await post(sem)).status).toBe(401);
    expect(db.assinaturas.all()).toHaveLength(0);
    expect(db.eventosPagamento.all().map((e) => e.resultado)).toEqual(expect.arrayContaining(["recusado: segredo errado", "recusado: aviso sem segredo"]));
  });

  it("segredo certo libera; também aceita o segredo no endereço", async () => {
    const r = await post(aviso("purchase_approved"));
    expect(r.status).toBe(200);
    expect(m.temAcesso(usuario("fulano@exemplo.com"), naoAdmin)).toBe(true);
    const { secret: _s, ...sem } = aviso("purchase_approved");
    expect((await post({ ...sem, data: { customer: { email: "b@b.com" } } }, "https://tropa.test/api/cakto?secret=segredo-de-teste-123")).status).toBe(200);
    expect(db.assinaturas.get("b@b.com")?.status).toBe("ativa");
  });

  it("corpo que não é JSON: 400", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await (Route.options as any).server.handlers.POST({ request: new Request("https://tropa.test/api/cakto", { method: "POST", body: "oi" }) });
    expect(r.status).toBe(400);
  });
});

describe("quem entra nas páginas pagas", () => {
  it("cobrança desligada: todos; ligada: só assinante, cortesia e admin", () => {
    expect(m.temAcesso(null, naoAdmin)).toBe(true);
    m.salvarConfig({ ativo: true, checkout: "https://pay.cakto.com.br/abc", produto: "" });
    expect(m.temAcesso(null, naoAdmin)).toBe(false);
    expect(m.temAcesso(usuario("z@z.com"), naoAdmin)).toBe(false);
    expect(m.temAcesso(usuario("chefe@z.com"), () => true)).toBe(true);
    m.liberar("Z@z.com", 0);
    expect(m.temAcesso(usuario("z@z.com"), naoAdmin)).toBe(true);
    m.remover("z@z.com");
    expect(m.temAcesso(usuario("z@z.com"), naoAdmin)).toBe(false);
  });

  it("não liga a cobrança sem link de checkout; link leva o e-mail preenchido", () => {
    expect(() => m.salvarConfig({ ativo: true, checkout: "", produto: "" })).toThrow(/checkout/);
    expect(() => m.salvarConfig({ ativo: false, checkout: "pay.cakto.com.br/x", produto: "" })).toThrow(/https/);
    m.salvarConfig({ ativo: true, checkout: "https://pay.cakto.com.br/abc", produto: "" });
    expect(m.linkCheckout("a+b@c.com")).toBe("https://pay.cakto.com.br/abc?email=a%2Bb%40c.com");
  });

  it("cortesia não encurta um acesso pago mais longo", () => {
    m.aplicarAviso(m.lerAviso(aviso("purchase_approved", { subscription: { next_payment_date: new Date(Date.now() + 200 * DIA).toISOString() } })));
    const antes = db.assinaturas.get("fulano@exemplo.com")!.validaAte;
    m.liberar("fulano@exemplo.com", 7);
    expect(db.assinaturas.get("fulano@exemplo.com")!.validaAte).toBe(antes);
  });
});

describe("chave do webhook colada no Painel ADM", () => {
  it("sem variável de ambiente, vale a chave salva no painel; o painel nunca devolve a chave", async () => {
    const env = process.env.CAKTO_WEBHOOK_SECRET;
    delete process.env.CAKTO_WEBHOOK_SECRET;
    try {
      expect(m.segredoDefinido()).toBe(false);
      expect((await post(aviso("purchase_approved"))).status).toBe(503);
      expect(() => m.salvarConfig({ ativo: false, checkout: "", produto: "", segredo: "curta" })).toThrow(/incompleta/);
      m.salvarConfig({ ativo: false, checkout: "", produto: "", segredo: " a1b2c3d4-0000-4000-8000-000000000000 " });
      expect(m.segredoDefinido()).toBe(true);
      expect(JSON.stringify(m.painel())).not.toContain("a1b2c3d4");
      // salvar de novo sem chave mantém a anterior
      m.salvarConfig({ ativo: true, checkout: "https://pay.cakto.com.br/abc", produto: "" });
      expect((await post({ ...aviso("purchase_approved"), secret: "a1b2c3d4-0000-4000-8000-000000000000" })).status).toBe(200);
      expect((await post({ ...aviso("purchase_approved"), secret: "outra" })).status).toBe(401);
    } finally {
      process.env.CAKTO_WEBHOOK_SECRET = env;
    }
  });
});
