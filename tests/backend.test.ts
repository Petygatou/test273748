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
  it("post com várias fotos/vídeos (carrossel), na ordem, até 10", () => {
    const a = db.users.find((u) => u.email === "admin@exemplo.com")!;
    const fotos = Array.from({ length: 12 }, (_, i) => ({ kind: i === 1 ? "video" : "image", url: `/media/0000000${i}-0000-0000-0000-000000000000.jpg` }));
    const p = community.createPost(a, { texto: "galeria", midias: [{ kind: "image", url: "https://evil/x.png" }, ...fotos] });
    const view = community.listPosts(a).find((x) => x.id === p.id)!;
    expect(view.midias).toHaveLength(10); // limite
    expect(view.midias[0].url).toBe(fotos[0].url); // externa descartada, ordem mantida
    expect(view.midias[1].kind).toBe("video");
    expect(view.media?.url).toBe(fotos[0].url); // capa, para quem lê o formato antigo
    // post antigo, de uma mídia só, aparece como carrossel de 1
    const antigo = community.createPost(a, { texto: "antigo", media: { kind: "image", url: "/media/x.jpg" } });
    expect(community.listPosts(a).find((x) => x.id === antigo.id)!.midias).toEqual([{ kind: "image", url: "/media/x.jpg" }]);
    // Vercel Blob da conta é aceito
    const blob = community.createPost(a, { texto: "blob", midias: [{ kind: "image", url: "https://abc.public.blob.vercel-storage.com/tropa/image-x.jpg" }] });
    expect(community.listPosts(a).find((x) => x.id === blob.id)!.midias).toHaveLength(1);
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
    expect(t.atletas[0]).toMatchObject({ atletaId: 1, preco: 12.3 });
    // sem rostos: o atleta só leva a camisa do clube (aqui o Cartola não mandou nenhuma)
    expect(t.atletas[0].foto).toBeUndefined();
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
    expect(calls.at(-1)!.url.startsWith(http.CARTOLA_HOSTS[1])).toBe(true);
    // token antigo: só o cabeçalho antigo (o Bearer é do login novo)
    expect(calls.at(-1)!.headers["X-GLB-Token"]).toBe("a".repeat(40));
    expect(calls.at(-1)!.headers.Authorization).toBeUndefined();
  });

  it("em erro de autenticação tenta cada host uma vez só e então desiste", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        n++;
        return new Response(JSON.stringify({ mensagem: "Não autorizado" }), { status: 401 });
      }),
    );
    await expect(http.cartola("/auth/time", { token: "b".repeat(40) })).rejects.toThrow(/Não autorizado/);
    expect(n).toBe(http.CARTOLA_HOSTS.length);
  });
});

describe("fotos oficiais", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("normaliza a URL da API e só aceita hosts da Globo", async () => {
    const { normalizeFoto, isAllowedFoto } = await import("../src/server/foto");
    expect(normalizeFoto("http://s.sde.globo.com/media/organizations/2026/04/01/FORMATO/x.png")).toBe("https://s.sde.globo.com/media/organizations/2026/04/01/220x220/x.png");
    expect(normalizeFoto(null)).toBeUndefined();
    expect(normalizeFoto("javascript:alert(1)")).toBeUndefined();
    // silhueta genérica do clube não é rosto
    expect(normalizeFoto("https://s3.glbimg.com/v1/AUTH_58d/clubes_2026/silhuetas/FLU/220x220.png")).toBeUndefined();
    expect(isAllowedFoto("https://s.sde.globo.com/a.png")).not.toBeNull();
    expect(isAllowedFoto("https://s2.glbimg.com/a.png")).not.toBeNull();
    expect(isAllowedFoto("https://evil.com/a.png")).toBeNull();
    expect(isAllowedFoto("https://globo.com.evil.com/a.png")).toBeNull();
    expect(isAllowedFoto("http://s.sde.globo.com/a.png")).toBeNull();
    expect(isAllowedFoto("http://127.0.0.1/a.png")).toBeNull();
  });

  it("todo atleta usa a camisa do clube que o Cartola manda (nunca o rosto)", async () => {
    const { aprenderSilhueta, camisaDoClube } = await import("../src/server/foto");
    // um atleta com rosto e outro sem: o Cartola manda a silhueta só para o segundo
    aprenderSilhueta(266, 5, "https://s.sde.globo.com/media/organizations/2026/04/01/FORMATO/rosto.png");
    aprenderSilhueta(266, 4, "http://s3.glbimg.com/v1/AUTH_58d/clubes_2026/silhuetas/FLU/FORMATO.png");
    expect(camisaDoClube(266, 5)).toBe("https://s3.glbimg.com/v1/AUTH_58d/clubes_2026/silhuetas/FLU/220x220.png");
    expect(camisaDoClube(266, 1)).toBe("https://s3.glbimg.com/v1/AUTH_58d/clubes_2026/silhuetas/FLU/220x220.png");
    // técnico: usa a do clube enquanto o Cartola não mandar uma própria
    expect(camisaDoClube(266, 6)).toBe("https://s3.glbimg.com/v1/AUTH_58d/clubes_2026/silhuetas/FLU/220x220.png");
    // clube sem silhueta conhecida: sem imagem (o site desenha a camisa nas cores do time)
    expect(camisaDoClube(999, 5)).toBeUndefined();
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

describe("escalação oficial (API-Football)", () => {
  const clubs = { 1: { id: 1, nome: "Flamengo", abreviacao: "FLA" }, 2: { id: 2, nome: "Atlético-MG", abreviacao: "CAM" }, 3: { id: 3, nome: "Athletico-PR", abreviacao: "CAP" } };
  const mk = (id: number, apelido: string, nome: string, clubeId: number, posicaoId: 1 | 2 | 3 | 4 | 5 = 4) => ({ id, apelido, nome, clubeId, posicaoId, statusId: 7, preco: 5, variacao: 0, media: 3, jogos: 10, pontosUltima: 0 });
  const nomes = ["Rossi", "Varela", "Fabricio Bruno", "Leo Pereira", "Ayrton Lucas", "Pulgar", "De la Cruz", "Arrascaeta", "Gabigol", "Pedro", "Cebolinha"];
  const fla = nomes.map((n, i) => mk(10 + i, n.split(" ").pop()!, `${n} Silva`, 1, i === 0 ? 1 : i < 5 ? 3 : i < 8 ? 4 : 5));
  const banco = Array.from({ length: 6 }, (_, i) => mk(30 + i, `Reserva${i}`, `Reserva${i} Souza`, 1));
  const outros = mk(99, "Sobrando", "Sobrando Lima", 1);
  const athletes = [...fla, ...banco, outros, mk(200, "Hulk", "Givanildo Vieira de Souza", 2, 5), mk(201, "Paulinho", "Paulo Henrique", 2, 5)];

  it("casa nomes da súmula com clubes e atletas, sem chutar ambíguos", async () => {
    const e = await import("../src/server/escalacoes");
    expect(e.matchClub("Atletico-MG", clubs as never)?.id).toBe(2);
    expect(e.matchClub("Athletico Paranaense", clubs as never)?.id).toBe(3);
    expect(e.matchClub("Flamengo RJ", clubs as never)?.id).toBe(1);
    expect(e.matchClub("Time Desconhecido", clubs as never)).toBeNull();
    const squad = athletes.filter((a) => a.clubeId === 1);
    expect(e.matchPlayer("G. Arrascaeta", squad)?.apelido).toBe("Arrascaeta");
    expect(e.matchPlayer("Pedro", squad)?.apelido).toBe("Pedro");
    expect(e.matchPlayer("Fabricio Bruno", squad)?.apelido).toBe("Bruno");
    expect(e.matchPlayer("Jogador Inexistente", squad)).toBeNull();
    // dois "Silva": só a inicial e o sobrenome não bastam para escolher
    const amb = [mk(1, "A", "Joao Silva", 1), mk(2, "B", "Jose Silva", 1)];
    expect(e.matchPlayer("Silva", amb)).toBeNull();
  });

  it("transforma a súmula em titular/reserva/fora e só exclui quando casou quase tudo", async () => {
    const e = await import("../src/server/escalacoes");
    const lineup = {
      team: { id: 1, name: "Flamengo" },
      startXI: nomes.map((n) => ({ player: { name: n } })),
      substitutes: banco.map((b) => ({ player: { name: b.apelido } })),
    };
    const r = e.mapLineup(lineup, athletes as never, clubs as never)!;
    expect(r.titulares).toHaveLength(11);
    expect(r.banco).toHaveLength(6);
    const ov = e.toOverrides(r, athletes as never);
    expect(ov[10]).toBe("titular");
    expect(ov[30]).toBe("reserva");
    expect(ov[99]).toBe("fora"); // fora dos 18
    expect(ov[200]).toBeUndefined(); // outro clube não é tocado
    // súmula mal casada: não exclui ninguém, só rebaixa a reserva
    const mal = { ...lineup, substitutes: [{ player: { name: "Ninguem Conhecido" } }] };
    const r2 = e.mapLineup(mal, athletes as never, clubs as never)!;
    expect(e.toOverrides(r2, athletes as never)[99]).toBe("reserva");
  });

  it("gasta pouquíssimas chamadas: lista 1x por dia, lote de jogos, janela curta, teto diário", async () => {
    const e = await import("../src/server/escalacoes");
    const now = new Date("2026-10-20T20:00:00Z").getTime();
    const kick = new Date(now + 60 * 60_000).toISOString(); // bola em 1 h
    const lineup = (names: string[]) => ({ team: { id: 1, name: "Flamengo" }, startXI: names.map((n) => ({ player: { name: n } })), substitutes: banco.map((b) => ({ player: { name: b.apelido } })) });
    const calls: string[] = [];
    let remaining = 80;
    const mkFetch = (comLineups: boolean, saida: "pronta" | "vazia") =>
      (async (url: string) => {
        calls.push(url);
        remaining--;
        const headers = { "x-ratelimit-requests-remaining": String(remaining) };
        if (url.includes("/fixtures?ids=")) {
          const ids = url.split("ids=")[1].split("-").map(Number);
          const base = ids.map((id) => ({ fixture: { id, date: kick }, teams: { home: { id: 1, name: "Flamengo" }, away: { id: 1, name: "Flamengo" } } }));
          return new Response(JSON.stringify({ response: base.map((x) => (comLineups ? { ...x, lineups: saida === "pronta" ? [lineup(nomes), lineup(nomes)] : [] } : x)), errors: [] }), { headers });
        }
        if (url.includes("/fixtures/lineups")) return new Response(JSON.stringify({ response: [lineup(nomes), lineup(nomes)], errors: [] }), { headers });
        return new Response(
          JSON.stringify({ response: [7, 8, 9].map((id) => ({ fixture: { id, date: kick }, teams: { home: { id: 1, name: "Flamengo" }, away: { id: 1, name: "Flamengo" } } })), errors: [] }),
          { headers },
        );
      }) as unknown as typeof fetch;
    delete process.env.API_FOOTBALL_KEY;
    const st0 = e.newOfficialState(false);
    expect(await e.stepOfficial(st0, athletes as never, clubs as never, 2026, now, mkFetch(true, "pronta"))).toEqual([]);
    expect(calls).toHaveLength(0); // sem chave, nenhuma chamada

    process.env.API_FOOTBALL_KEY = "teste";
    // 1) 3 jogos no mesmo horário, súmula ainda não saiu: lista (1) + lote (1) = 2 chamadas, não 4
    const st = e.newOfficialState(false);
    const f1 = mkFetch(true, "vazia");
    expect(await e.stepOfficial(st, athletes as never, clubs as never, 2026, now, f1)).toEqual([]);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain("ids=7-8-9");
    // 2) um minuto depois não pergunta de novo; 10 min depois pergunta (lote)
    await e.stepOfficial(st, athletes as never, clubs as never, 2026, now + 60_000, f1);
    expect(calls).toHaveLength(2);
    // 3) a súmula sai: uma chamada resolve os 3 jogos
    const got = await e.stepOfficial(st, athletes as never, clubs as never, 2026, now + 10 * 60_000, mkFetch(true, "pronta"));
    expect(calls).toHaveLength(3);
    expect(got).toHaveLength(3);
    expect(got[0].overrides[10]).toBe("titular");
    expect(e.currentOfficialOverrides(st)[99]).toBe("fora");
    // 4) jogos resolvidos não são consultados de novo e a lista do dia não se repete
    await e.stepOfficial(st, athletes as never, clubs as never, 2026, now + 30 * 60_000, f1);
    expect(calls).toHaveLength(3);
    // o saldo informado pela API é registrado
    expect(e.quotaStatus(st, now).restantesNaApi).toBe(remaining);
    expect(e.quotaStatus(st, now).usadas).toBe(3);

    // fora da janela (jogo daqui a 5 h) só a lista de jogos, uma vez
    const far = e.newOfficialState(false);
    const before = calls.length;
    const longe = (async (u: string) => { calls.push(u); return new Response(JSON.stringify({ response: [{ fixture: { id: 1, date: new Date(now + 5 * 3600_000).toISOString() }, teams: { home: { id: 1, name: "Flamengo" }, away: { id: 1, name: "Flamengo" } } }], errors: [] })); }) as unknown as typeof fetch;
    await e.stepOfficial(far, athletes as never, clubs as never, 2026, now, longe);
    await e.stepOfficial(far, athletes as never, clubs as never, 2026, now + 3 * 3600_000, longe);
    expect(calls.length - before).toBe(1);

    // teto diário: com 90 usadas não chama mais nada
    process.env.API_FOOTBALL_DAILY_LIMIT = "2";
    const cap = e.newOfficialState(false);
    const c0 = calls.length;
    await e.stepOfficial(cap, athletes as never, clubs as never, 2026, now, f1); // lista (1)
    await e.stepOfficial(cap, athletes as never, clubs as never, 2026, now, f1); // lote (2)
    await e.stepOfficial(cap, athletes as never, clubs as never, 2026, now + 11 * 60_000, f1); // teto: nada
    expect(calls.length - c0).toBe(2);
    delete process.env.API_FOOTBALL_DAILY_LIMIT;

    // se a API não devolver `lineups` no lote, cai para a chamada por jogo (e continua dentro do teto)
    const sem = e.newOfficialState(false);
    const f2 = mkFetch(false, "pronta");
    const d0 = calls.length;
    await e.stepOfficial(sem, athletes as never, clubs as never, 2026, now, f2); // lista + lote sem lineups
    expect(sem.semLote).toBe(true);
    const r = await e.stepOfficial(sem, athletes as never, clubs as never, 2026, now + 10 * 60_000, f2);
    expect(r).toHaveLength(3);
    expect(calls.length - d0).toBe(2 + 3);
    delete process.env.API_FOOTBALL_KEY;
  });
});

describe("sessão assinada no cookie", () => {
  it("vale em outra instância (sem disco compartilhado), expira e rejeita adulteração", () => {
    process.env.ADMIN_EMAILS = "chefe@tropa.com";
    process.env.ADMIN_PASSWORD = "senhadochefe1";
    const u = auth.verifyUser("chefe@tropa.com", "senhadochefe1");
    const tok = auth.makeSessionToken(u);
    expect(auth.readSessionToken(tok)).toMatchObject({ u: u.id, e: "chefe@tropa.com" });
    // "outra instância": o banco local não tem a conta, mas a sessão continua válida e a conta do admin é recriada com o MESMO id
    db.users.remove(u.id);
    const req = new Request("http://x/", { headers: { cookie: `cfc_session=${encodeURIComponent(tok)}` } });
    const again = auth.userFromRequest(req);
    expect(again?.id).toBe(u.id);
    expect(auth.isAdmin(again!)).toBe(true);
    // adulteração e expiração
    const [payload, sig] = tok.split(".");
    expect(auth.readSessionToken(`${payload}x.${sig}`)).toBeNull();
    expect(auth.readSessionToken(`${Buffer.from(JSON.stringify({ u: u.id, e: "outro@x.com", x: Date.now() + 1e9 })).toString("base64url")}.${sig}`)).toBeNull();
    expect(auth.readSessionToken(tok, Date.now() + 40 * 86400_000)).toBeNull();
    expect(auth.readSessionToken("lixo")).toBeNull();
    // diagnóstico da configuração
    expect(auth.adminStatus().problema).toBe("");
    process.env.ADMIN_PASSWORD = "curta";
    expect(auth.adminStatus().problema).toMatch(/8 caracteres/);
    delete process.env.ADMIN_PASSWORD;
    expect(auth.adminStatus().problema).toMatch(/ADMIN_PASSWORD/);
    delete process.env.ADMIN_EMAILS;
  });
});

describe("rostos da API-Football e sondagem da chave", () => {
  const clubs = { 1: { id: 1, nome: "Flamengo", abreviacao: "FLA" } };
  const ath = [
    { id: 10, apelido: "Arrascaeta", nome: "Giorgian De Arrascaeta", clubeId: 1, posicaoId: 4 as const, statusId: 7, preco: 5, variacao: 0, media: 3, jogos: 10, pontosUltima: 0 },
    { id: 11, apelido: "Pedro", nome: "Pedro Guilherme", clubeId: 1, posicaoId: 5 as const, statusId: 7, preco: 5, variacao: 0, media: 3, jogos: 10, pontosUltima: 0, foto: "https://s.glbimg.com/ja-tem.png" },
  ];

  it("descobre os times pelo país, lê 1 elenco por vez, só com cota sobrando, e não sobrescreve foto do Cartola", async () => {
    const e = await import("../src/server/escalacoes");
    const f = await import("../src/server/fotosApiFootball");
    process.env.API_FOOTBALL_KEY = "teste";
    const now = new Date("2026-10-20T12:00:00Z").getTime();
    const of = e.newOfficialState(false);
    const urls: string[] = [];
    const fake = (async (url: string) => {
      urls.push(url);
      if (url.includes("/teams?country=Brazil"))
        return new Response(JSON.stringify({ response: [{ team: { id: 127, name: "Flamengo" } }, { team: { id: 999, name: "Flamengo U20" } }, { team: { id: 5, name: "Brasil", national: true } }, { team: { id: 1, name: "Time Que Nao Existe" } }], errors: [] }));
      return new Response(JSON.stringify({ response: [{ team: { id: 127, name: "Flamengo" }, players: [{ id: 1100, name: "G. De Arrascaeta", photo: "https://media.api-sports.io/football/players/1100.png" }, { id: 7, name: "Pedro", photo: "https://media.api-sports.io/football/players/7.png" }] }], errors: [] }));
    }) as unknown as typeof fetch;
    expect(await f.stepFotos(of, ath as never, clubs as never, 2099, now, fake)).toBe(false); // 1º passo: descobre os times
    expect(urls).toHaveLength(1);
    expect(await f.stepFotos(of, ath as never, clubs as never, 2099, now + 60_000, fake)).toBe(true); // 2º: lê o elenco
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain("/players/squads?team=127");
    const merged = f.withFotos(ath as never);
    expect(merged[0].foto).toBe("https://media.api-sports.io/football/players/1100.png");
    expect(merged[1].foto).toBe("https://s.glbimg.com/ja-tem.png"); // foto do Cartola manda
    // sem elenco novo para ler: não gasta
    expect(await f.stepFotos(of, ath as never, clubs as never, 2099, now + 120_000, fake)).toBe(false);
    expect(urls).toHaveLength(2);
    // pouca cota: não gasta; jogo na janela das escalações: não gasta
    const of2 = e.newOfficialState(false);
    of2.quota = { dia: "2026-10-20", usadas: 80, restantes: null };
    expect(await f.stepFotos(of2, ath as never, clubs as never, 2098, now, fake)).toBe(false);
    expect(urls).toHaveLength(2);
    delete process.env.API_FOOTBALL_KEY;
  });

  it("no plano gratuito cai para a temporada liberada: times pelas ligas de 2024 e jogadores paginados", async () => {
    const e = await import("../src/server/escalacoes");
    const f = await import("../src/server/fotosApiFootball");
    process.env.API_FOOTBALL_KEY = "teste";
    f.resetFotos(2097);
    const now = new Date("2026-10-21T12:00:00Z").getTime();
    const of = e.newOfficialState(false);
    const plan = () => new Response(JSON.stringify({ response: [], errors: { plan: "Free plans do not have access to this season, try from 2022 to 2024." } }));
    const urls: string[] = [];
    const all = [...ath, { id: 12, apelido: "Rodrigo", nome: "Rodrigo Caio Coquette Russo", clubeId: 2, posicaoId: 3 as const, statusId: 7, preco: 5, variacao: 0, media: 3, jogos: 10, pontosUltima: 0 }];
    const clubs2 = { ...clubs, 2: { id: 2, nome: "Grêmio", abreviacao: "GRE" } };
    const fake = (async (url: string) => {
      urls.push(url);
      if (url.includes("/teams?country=")) return plan();
      if (url.includes("/teams?league=71")) return new Response(JSON.stringify({ response: [{ team: { id: 127, name: "Flamengo" } }], errors: [] }));
      if (url.includes("/teams?league=72")) return new Response(JSON.stringify({ response: [{ team: { id: 130, name: "Gremio" } }], errors: [] }));
      if (url.includes("/players/squads")) return plan();
      if (url.includes("/players?team=127") && url.includes("page=1"))
        return new Response(JSON.stringify({ response: [{ player: { id: 1100, name: "G. De Arrascaeta", firstname: "Giorgian", lastname: "De Arrascaeta", photo: "https://media.api-sports.io/football/players/1100.png" } }], paging: { current: 1, total: 2 }, errors: [] }));
      if (url.includes("/players?team=127") && url.includes("page=2"))
        // jogador que hoje está em outro clube: casado pelo nome completo, único no mercado
        return new Response(JSON.stringify({ response: [{ player: { id: 55, name: "R. Caio", firstname: "Rodrigo Caio", lastname: "Coquette Russo", photo: "https://media.api-sports.io/football/players/55.png" } }], paging: { current: 2, total: 2 }, errors: [] }));
      return new Response(JSON.stringify({ response: [], paging: { current: 1, total: 1 }, errors: [] }));
    }) as unknown as typeof fetch;
    let t = now;
    for (let i = 0; i < 8; i++) await f.stepFotos(of, all as never, clubs2 as never, 2097, (t += 60_000), fake);
    expect(urls[0]).toContain("/teams?country=Brazil");
    expect(urls[1]).toContain("/teams?league=71&season=2024");
    expect(urls[2]).toContain("/teams?league=72&season=2024");
    expect(urls.some((u) => u.includes("/players?team=127&season=2024&page=2"))).toBe(true);
    const m = f.withFotos(all as never);
    expect(m.find((a) => a.id === 10)?.foto).toContain("1100.png");
    expect(m.find((a) => a.id === 12)?.foto).toContain("55.png");
    expect(f.fotosResumo(all as never)).toMatchObject({ modo: "temporada", temporadaFoto: 2024 });
    expect(f.fotosSemPar().length).toBeGreaterThanOrEqual(0);
    // erro de plano no elenco não bloqueia o dia: só muda o caminho
    expect(f.fotosResumo(all as never).erro).toBeNull();
    delete process.env.API_FOOTBALL_KEY;
  });

  it("erro de plano não é repetido: espera até o dia seguinte e explica em português", async () => {
    const e = await import("../src/server/escalacoes");
    process.env.API_FOOTBALL_KEY = "teste";
    const now = new Date("2026-10-20T12:00:00Z").getTime();
    const err = (async () => new Response(JSON.stringify({ response: [], errors: { plan: "Free plans do not have access to this season, try from 2022 to 2024." } }))) as unknown as typeof fetch;
    let n = 0;
    const counting = (async (u: string) => { n++; return err(u); }) as unknown as typeof fetch;
    const st = e.newOfficialState(false);
    await e.stepOfficial(st, ath as never, clubs as never, 2026, now, counting);
    expect(n).toBe(1);
    expect(st.erro).toMatch(/plano gratuito.*2022 a 2024/);
    for (let m = 1; m <= 30; m++) await e.stepOfficial(st, ath as never, clubs as never, 2026, now + m * 60_000, counting);
    expect(n).toBe(1); // 30 minutos depois, nenhuma chamada nova
    await e.stepOfficial(st, ath as never, clubs as never, 2026, now + 13 * 3600_000, counting); // dia seguinte (UTC)
    expect(n).toBe(2);
    expect(e.explainApiError(new Error("HTTP 500")).permanente).toBe(false);
    delete process.env.API_FOOTBALL_KEY;
  });

  it("a sondagem da chave entende a resposta do /status e erros", async () => {
    const e = await import("../src/server/escalacoes");
    delete process.env.API_FOOTBALL_KEY;
    expect((await e.probeApiFootball()).ok).toBe(false);
    process.env.API_FOOTBALL_KEY = "teste";
    const good = (async () => new Response(JSON.stringify({ errors: [], response: { subscription: { plan: "Free", active: true }, requests: { current: 12, limit_day: 100 } } }))) as unknown as typeof fetch;
    const r = await e.probeApiFootball(good);
    expect(r).toMatchObject({ ok: true, plano: "Free", usadasHoje: 12, limiteDia: 100 });
    expect(r.leitura).toMatch(/12 de 100/);
    const bad = (async () => new Response(JSON.stringify({ errors: { token: "Error/Missing application key." }, response: [] }))) as unknown as typeof fetch;
    expect((await e.probeApiFootball(bad)).leitura).toMatch(/não aceita/);
    const denied = (async () => new Response("{}", { status: 403 })) as unknown as typeof fetch;
    expect((await e.probeApiFootball(denied)).leitura).toMatch(/recusou/);
    delete process.env.API_FOOTBALL_KEY;
  });
});

describe("gestão de usuários (painel ADM)", () => {
  it("lista sem segredos, mostra atividade, bloqueia, desbloqueia e exclui com tudo", async () => {
    const usuarios = await import("../src/server/usuarios");
    const adm = auth.createUser("gestor@tropa.com", "senhagestor1", "Gestor");
    db.users.update(adm.id, { admin: true });
    const u = auth.createUser("fulano@tropa.com", "senhafulano1", "Fulano");
    const p = community.createPost(db.users.get(adm.id)!, { texto: "enquete", poll: { pergunta: "Quem mita?", opcoes: ["A", "B"] } });
    community.addComment(u, p.id, "eu mito");
    community.toggleLike(u, p.id);
    community.vote(u, p.id, 1);
    db.lineups.put({ id: "l1", userId: u.id, nome: "Minha", rodada: 31, temporada: 2026, formation: "4-3-3", profile: "equilibrada", titulares: [], captainId: 0, reservas: [], custo: 110, xP: 70, criadoEm: new Date().toISOString() });
    db.users.update(u.id, { ultimoAcesso: new Date().toISOString(), logins: 3, dispositivo: "Android · Chrome" });

    const { usuarios: lista, resumo } = usuarios.listUsers();
    const row = lista.find((x) => x.id === u.id)!;
    expect(row).toMatchObject({ online: true, logins: 3, comentarios: 1, curtidas: 1, votos: 1, tropas: 1, dispositivo: "Android · Chrome" });
    expect(JSON.stringify(lista)).not.toMatch(/hash|salt/);
    expect(resumo.online).toBeGreaterThanOrEqual(1);
    const det = usuarios.userDetail(u.id);
    expect(det.atividade.votos[0]).toEqual({ pergunta: "Quem mita?", opcao: "B" });
    expect(det.atividade.comentarios[0].texto).toBe("eu mito");
    expect(JSON.stringify(det)).not.toMatch(/"hash"|"salt"/);

    const admRow = db.users.get(adm.id)!;
    usuarios.userAction(admRow, u.id, "bloquear");
    expect(() => auth.verifyUser("fulano@tropa.com", "senhafulano1")).toThrow(/bloqueada/);
    const tok = auth.makeSessionToken(u);
    expect(auth.userFromRequest(new Request("http://x", { headers: { cookie: `cfc_session=${encodeURIComponent(tok)}` } }))).toBeNull();
    usuarios.userAction(admRow, u.id, "desbloquear");
    expect(auth.verifyUser("fulano@tropa.com", "senhafulano1").id).toBe(u.id);
    expect(() => usuarios.userAction(admRow, adm.id, "excluir")).toThrow(/própria/);
    usuarios.userAction(admRow, u.id, "excluir");
    expect(db.users.get(u.id)).toBeUndefined();
    expect(db.comments.filter((c) => c.userId === u.id)).toHaveLength(0);
    expect(db.lineups.filter((l) => l.userId === u.id)).toHaveLength(0);
  });

  it("resume o aparelho sem guardar o texto inteiro", () => {
    expect(auth.deviceFromUA("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36")).toBe("Android · Chrome");
    expect(auth.deviceFromUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17.0 Mobile/15E148 Safari/604.1")).toBe("iPhone/iPad · Safari");
    expect(auth.deviceFromUA(undefined)).toBe("desconhecido");
  });
});

describe("notícias", () => {
  it("limpa o resumo do Google Notícias (HTML escapado) e não repete a manchete", async () => {
    const { parseRss } = await import("../src/server/news");
    const xml = `<rss><channel><item><title>Lateral do Athletico sofre lesão grave - Bem Paraná</title><link>https://news.google.com/x</link><pubDate>Mon, 19 Oct 2026 10:00:00 GMT</pubDate><description>&lt;a href="https://news.google.com/rss/articles/CBMixwFBVV95cUxNcXhk?oc=5" target="_blank"&gt;Lateral do Athletico sofre lesão grave&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font color="#6f6f6f"&gt;Bem Paraná&lt;/font&gt;</description><source url="https://bemparana.com.br">Bem Paraná</source></item><item><title>Outra</title><description>&lt;p&gt;Texto &amp;amp; resumo de verdade.&lt;/p&gt;</description></item></channel></rss>`;
    const [a, b] = parseRss(xml);
    expect(a.titulo).toBe("Lateral do Athletico sofre lesão grave");
    expect(a.resumo).toBe("");
    expect(b.resumo).toBe("Texto & resumo de verdade.");
    expect(JSON.stringify([a, b])).not.toMatch(/<a|href|news\.google\.com\/rss/);
  });
});

describe("login novo do Cartola (OIDC)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const jwt = (exp: number) => `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ exp, iat: exp - 3600 })}.assinatura_falsa`;

  it("manda Bearer + x-glb-auth: oidc, começa pelo host novo e cai para o outro em 401", async () => {
    const tk = jwt(Math.floor(Date.now() / 1000) + 3600);
    const chamadas: Array<{ url: string; h: Record<string, string> }> = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const h = init.headers as Record<string, string>;
      chamadas.push({ url, h });
      // o host novo recusa nesta simulação; o outro aceita — precisa tentar os dois
      if (url.startsWith("https://api.cartola.globo.com")) return new Response(JSON.stringify({ mensagem: "não autorizado" }), { status: 401 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const r = await http.cartola<{ ok: boolean }>("/auth/time", { token: tk });
    expect(r.ok).toBe(true);
    expect(chamadas[0].url).toBe("https://api.cartola.globo.com/auth/time");
    expect(chamadas[0].h.Authorization).toBe(`Bearer ${tk}`);
    expect(chamadas[0].h["x-glb-auth"]).toBe("oidc");
    expect(chamadas[0].h["x-glb-app"]).toBe("cartola_web");
    expect(chamadas[0].h["X-GLB-Token"]).toBeUndefined();
    expect(chamadas.at(-1)!.url).toBe("https://api.cartolafc.globo.com/auth/time");
  });

  it("token antigo (GLBID) continua indo em X-GLB-Token", async () => {
    let h: Record<string, string> = {};
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      h = init.headers as Record<string, string>;
      return new Response("{}", { status: 200 });
    });
    await http.cartola("/auth/time", { token: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4" });
    expect(h["X-GLB-Token"]).toBe("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4");
    expect(h.Authorization).toBeUndefined();
  });

  it("lê a validade do token (1 hora) e sabe quando venceu", async () => {
    const { tokenExpiraEm, tokenExpirado } = await import("../src/lib/cartolaToken");
    const exp = Math.floor(Date.now() / 1000) + 3600;
    expect(tokenExpiraEm(jwt(exp))).toBe(exp * 1000);
    expect(tokenExpirado(jwt(exp))).toBe(false);
    expect(tokenExpirado(jwt(Math.floor(Date.now() / 1000) - 10))).toBe(true);
    expect(tokenExpiraEm("token-antigo-sem-pontos-1234567890")).toBeNull();
  });
});


describe("ligas em destaque", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("junta buscas reais do Cartola, sem repetir, das maiores para as menores", async () => {
    const conta = await import("../src/server/cartolaConta");
    const { invalidate } = await import("../src/server/cache");
    invalidate("cartola:ligas");
    vi.stubGlobal("fetch", async (url: string) => {
      const q = new URL(url).searchParams.get("q") ?? "";
      const base = [
        { liga_id: 1, nome: "Liga Brasil", slug: "liga-brasil", total_times_liga: 5000 },
        { liga_id: 2, nome: `Liga ${q}`, slug: `liga-${q}`, total_times_liga: q.length * 10 },
      ];
      return new Response(JSON.stringify(base), { status: 200 });
    });
    const r = await conta.popularLeagues();
    expect(r[0].slug).toBe("liga-brasil");
    expect(new Set(r.map((l) => l.slug)).size).toBe(r.length);
    for (let i = 1; i < r.length; i++) expect((r[i - 1].totalTimes ?? 0) >= (r[i].totalTimes ?? 0)).toBe(true);
  });
});
