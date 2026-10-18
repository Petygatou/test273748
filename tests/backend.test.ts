import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "cfc-test-"));

const { db } = await import("../src/server/db");
const auth = await import("../src/server/auth");
const community = await import("../src/server/community");
const conta = await import("../src/server/cartolaConta");
const http = await import("../src/server/cartolaHttp");

describe("contas", () => {
  beforeAll(() => {
    for (const c of Object.values(db)) c._reset();
  });

  it("cria conta, primeira vira admin, senha errada falha", () => {
    const a = auth.createUser("Admin@Exemplo.com", "senhaforte123", "Chefe");
    const b = auth.createUser("b@exemplo.com", "outrasenha99", "");
    expect(a.email).toBe("admin@exemplo.com");
    expect(auth.isAdmin(a)).toBe(true);
    expect(auth.isAdmin(b)).toBe(false);
    expect(a.hash).not.toContain("senhaforte");
    expect(auth.verifyUser("admin@exemplo.com", "senhaforte123").id).toBe(a.id);
    expect(() => auth.verifyUser("admin@exemplo.com", "errada123")).toThrow();
    expect(() => auth.createUser("b@exemplo.com", "qualquer123", "")).toThrow(/Já existe/);
    expect(() => auth.createUser("invalido", "qualquer123", "")).toThrow(/E-mail/);
    expect(() => auth.createUser("c@exemplo.com", "curta", "")).toThrow(/8 caracteres/);
  });

  it("ADMIN_EMAILS manda no papel de administrador", () => {
    const b = db.users.find((u) => u.email === "b@exemplo.com")!;
    process.env.ADMIN_EMAILS = "b@exemplo.com";
    expect(auth.isAdmin(b)).toBe(true);
    delete process.env.ADMIN_EMAILS;
    expect(auth.isAdmin(b)).toBe(false);
  });
});

describe("comunidade", () => {
  it("só admin publica; todos curtem, comentam e votam", () => {
    const a = db.users.find((u) => u.email === "admin@exemplo.com")!;
    const b = db.users.find((u) => u.email === "b@exemplo.com")!;
    expect(() => community.createPost(b, { texto: "olá" })).toThrow(/administradores/);
    expect(() => community.createStory(b, { media: { kind: "image", url: "/media/x.jpg" } })).toThrow(/administradores/);
    const p = community.createPost(a, { texto: "olá", poll: { pergunta: "Quem mita?", opcoes: ["A", "B"] } });
    expect(() => community.createPost(a, { texto: "" })).toThrow(/vazia/);
    expect(() => community.createPost(a, { texto: "x", media: { kind: "image", url: "https://evil/x.png" } })).not.toThrow(); // mídia externa é descartada
    community.toggleLike(a, p.id);
    community.toggleLike(b, p.id);
    community.toggleLike(b, p.id);
    community.addComment(b, p.id, "boa!");
    community.vote(a, p.id, 1);
    community.vote(b, p.id, 0);
    community.vote(b, p.id, 1); // troca de voto
    expect(() => community.vote(b, p.id, 5)).toThrow();
    const view = community.listPosts(a).find((x) => x.id === p.id)!;
    expect(view.likes).toBe(1);
    expect(view.liked).toBe(true);
    expect(view.comments[0].texto).toBe("boa!");
    expect(view.poll!.votos).toEqual([0, 2]);
    expect(view.podeApagar).toBe(true); // admin
    expect(community.listPosts(b).find((x) => x.id === p.id)!.podeApagar).toBe(false);
    const ext = community.listPosts(a).find((x) => x.texto === "x")!;
    expect(ext.media).toBeUndefined();
    expect(() => community.deletePost(b, p.id)).toThrow(/permissão/);
    community.deletePost(a, p.id);
    expect(db.likes.filter((l) => l.postId === p.id)).toHaveLength(0);
  });
});

describe("API do Cartola", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lê times e ligas nos formatos da API", () => {
    const t = conta.parseTeamDetail({
      atletas: [{ atleta_id: 1, apelido: "Fulano", posicao_id: 5, clube_id: 262, preco_num: 12.3, pontos_num: 8.5, foto: "https://x/FORMATO/a.png" }],
      capitao_id: 1,
      esquema_id: 3,
      patrimonio: 140.5,
      pontos_campeonato: 1500.2,
      pontos: 77.1,
      time: { time_id: 99, nome: "Time do Mito", nome_cartola: "Cartoleiro", slug: "time-do-mito", url_escudo_png: "https://x/e.png" },
    });
    expect(t.time).toMatchObject({ timeId: 99, nome: "Time do Mito", slug: "time-do-mito" });
    expect(t.atletas[0]).toMatchObject({ atletaId: 1, preco: 12.3, foto: "https://x/220x220/a.png" });
    expect(t).toMatchObject({ capitaoId: 1, esquemaId: 3, patrimonio: 140.5, pontosRodada: 77.1, pontosCampeonato: 1500.2 });
    const l = conta.parseLeagueDetail({
      liga: { liga_id: 5, nome: "Liga dos Amigos", slug: "amigos" },
      times: [{ time_id: 1, nome: "A", nome_cartola: "a", slug: "a", pontos: { rodada: 50, campeonato: 900 }, ranking: { campeonato: 1 }, patrimonio: 130 }],
    });
    expect(l.liga.nome).toBe("Liga dos Amigos");
    expect(l.times[0]).toMatchObject({ pontosRodada: 50, pontosCampeonato: 900, posicao: 1, patrimonio: 130 });
  });

  it("monta o corpo de /auth/time/salvar e valida a tropa", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 500 })));
    const titulares = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const body = await conta.buildSaveBody({ formation: "4-3-3", titulares, captainId: 9, reservas: [{ atletaId: 20, posicaoId: 5, luxo: true }] });
    expect(body).toEqual({ esquema: 3, atletas: titulares, capitao: 9, reservas: { "5": 20 }, reserva_luxo_id: 20 });
    await expect(conta.buildSaveBody({ formation: "4-3-3", titulares: titulares.slice(1), captainId: 9 })).rejects.toThrow(/12 atletas/);
    await expect(conta.buildSaveBody({ formation: "4-3-3", titulares, captainId: 99 })).rejects.toThrow(/capitão/);
  });

  it("cai para o outro host quando o primeiro falha e manda o token", async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, headers: init.headers as Record<string, string> });
        if (url.startsWith(http.CARTOLA_HOSTS[0])) throw new TypeError("fetch failed");
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
    const r = await http.cartola<{ ok: boolean }>("/auth/time", { token: "a".repeat(40) });
    expect(r.ok).toBe(true);
    expect(http.activeHost()).toBe(http.CARTOLA_HOSTS[1]);
    expect(calls.at(-1)!.headers["X-GLB-Token"]).toBe("a".repeat(40));
    expect(calls.at(-1)!.headers.Authorization).toBe(`Bearer ${"a".repeat(40)}`);
  });

  it("não troca de host em erro de autenticação", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        n++;
        return new Response(JSON.stringify({ mensagem: "Não autorizado" }), { status: 401 });
      }),
    );
    await expect(http.cartola("/auth/time", { token: "b".repeat(40) })).rejects.toThrow(/Não autorizado/);
    expect(n).toBe(1);
  });
});

describe("fotos oficiais", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("normaliza a URL da API e só aceita hosts da Globo", async () => {
    const { normalizeFoto, isAllowedFoto } = await import("../src/server/foto");
    expect(normalizeFoto("http://s.sde.globo.com/media/organizations/2026/04/01/FORMATO/x.png")).toBe("https://s.sde.globo.com/media/organizations/2026/04/01/220x220/x.png");
    expect(normalizeFoto(null)).toBeUndefined();
    expect(normalizeFoto("javascript:alert(1)")).toBeUndefined();
    expect(isAllowedFoto("https://s.sde.globo.com/a.png")).not.toBeNull();
    expect(isAllowedFoto("https://s2.glbimg.com/a.png")).not.toBeNull();
    expect(isAllowedFoto("https://evil.com/a.png")).toBeNull();
    expect(isAllowedFoto("https://globo.com.evil.com/a.png")).toBeNull();
    expect(isAllowedFoto("http://s.sde.globo.com/a.png")).toBeNull();
    expect(isAllowedFoto("http://127.0.0.1/a.png")).toBeNull();
  });

  it("repassa a imagem e recusa o que não é imagem", async () => {
    const { proxyFoto } = await import("../src/server/foto");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.endsWith("ok.png") ? new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } }) : new Response("<html>", { headers: { "content-type": "text/html" } }))));
    const ok = await proxyFoto("https://s.sde.globo.com/ok.png");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect((await proxyFoto("https://s.sde.globo.com/pagina.html")).status).toBe(404);
    expect((await proxyFoto("https://evil.com/ok.png")).status).toBe(400);
    expect((await proxyFoto(null)).status).toBe(400);
  });
});

describe("dados reais importados", () => {
  it("só aceita temporada real, completa", async () => {
    const { validateSeason, saveImported, loadImported } = await import("../src/server/importada");
    const fake = { source: "demo", athletes: [], matches: [], history: [], clubs: {}, rodadaAtual: 5 };
    expect(() => validateSeason(fake)).toThrow(/reais/);
    expect(() => validateSeason({ ...fake, source: "cartola" })).toThrow(/poucos atletas/);
    const ok = { source: "cartola", athletes: Array.from({ length: 60 }, (_, i) => ({ id: i })), matches: [], history: [], clubs: {}, rodadaAtual: 5 };
    expect(validateSeason(ok).rodadaAtual).toBe(5);
    await saveImported(validateSeason(ok));
    const back = await loadImported();
    expect(back?.data.athletes).toHaveLength(60);
  });
});

describe("admin por variável de ambiente", () => {
  it("cria a conta do admin e redefine a senha pela variável", () => {
    process.env.ADMIN_EMAILS = "dono@tropa.com";
    process.env.ADMIN_PASSWORD = "senhadodono1";
    const u = auth.verifyUser("dono@tropa.com", "senhadodono1");
    expect(auth.isAdmin(u)).toBe(true);
    expect(() => auth.createUser("dono@tropa.com", "outrasenha99", "")).toThrow(/Já existe/); // ninguém toma o e-mail
    process.env.ADMIN_PASSWORD = "novasenha123";
    expect(() => auth.verifyUser("dono@tropa.com", "senhadodono1")).toThrow();
    expect(auth.verifyUser("dono@tropa.com", "novasenha123").id).toBe(u.id);
    delete process.env.ADMIN_EMAILS;
    delete process.env.ADMIN_PASSWORD;
  });
});

describe("vigia dos dados", () => {
  const base = { id: 1, apelido: "Fulano", clubeId: 1, posicaoId: 5 as const, statusId: 7, preco: 10, variacao: 0, media: 5, jogos: 10, pontosUltima: 0 };

  it("a impressão digital muda com status, preço, rodada e notícia, e não com o relógio", async () => {
    const { fingerprint } = await import("../src/server/watcher");
    const d = { rodadaAtual: 10, mercadoStatus: 1, athletes: [base] };
    const f0 = fingerprint(d);
    expect(fingerprint({ ...d })).toBe(f0);
    expect(fingerprint({ ...d, athletes: [{ ...base, statusId: 2 }] })).not.toBe(f0);
    expect(fingerprint({ ...d, athletes: [{ ...base, preco: 10.5 }] })).not.toBe(f0);
    expect(fingerprint({ ...d, rodadaAtual: 11 })).not.toBe(f0);
    expect(fingerprint({ ...d, mercadoStatus: 2 })).not.toBe(f0);
    expect(fingerprint(d, { 1: -1.6 })).not.toBe(f0);
  });

  it("descreve as mudanças de status entre duas leituras", async () => {
    const { diffMarket } = await import("../src/server/watcher");
    const prev = new Map([[1, { status: 7, preco: 10, nome: "Fulano" }]]);
    const out = diffMarket(prev, [{ ...base, statusId: 2 }], () => "FLA");
    expect(out).toHaveLength(1);
    expect(out[0].texto).toMatch(/Fulano \(FLA\).*Dúvida/);
    expect(diffMarket(prev, [base], () => "FLA")).toHaveLength(0);
  });

  it("só aceita notícia que cita o atleta no título e traz palavra de ausência", async () => {
    const { signalsFromNews } = await import("../src/server/watcher");
    const now = Date.now();
    const mk = (titulo: string, extra: Partial<{ categoria: string; publicadoEm: string }> = {}) =>
      ({ id: titulo, titulo, resumo: "", link: "https://x", fonte: "x", publicadoEm: new Date(now - 3600_000).toISOString(), categoria: "Desfalques", atletas: [{ id: 1, apelido: "Fulano", clubeId: 1, impacto: null }], clubes: [], ...extra }) as never;
    expect(signalsFromNews([mk("Fulano é desfalque do Flamengo contra o Vasco")], now)[1].shift).toBeLessThan(-1);
    expect(signalsFromNews([mk("Fulano é dúvida para o jogo")], now)[1].shift).toBeGreaterThan(-1.2);
    expect(signalsFromNews([mk("Flamengo vence e Fulano brilha")], now)).toEqual({});
    expect(signalsFromNews([mk("Sicrano é desfalque do Flamengo")], now)).toEqual({});
    expect(signalsFromNews([mk("Fulano é desfalque", { publicadoEm: new Date(now - 72 * 3600_000).toISOString() })], now)).toEqual({});
  });
});
