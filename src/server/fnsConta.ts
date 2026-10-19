/** Server functions: conta, perfil, tropas salvas, comunidade e alertas. */
import { createServerFn } from "@tanstack/react-start";

type Obj = Record<string, unknown>;
const obj = (d: unknown): Obj => (d && typeof d === "object" && !Array.isArray(d) ? (d as Obj) : {});
const s = (x: unknown, max = 2000) => (typeof x === "string" ? x.slice(0, max) : "");

/* ------------------------------ conta ------------------------------ */

export const fetchMe = createServerFn({ method: "GET" }).handler(async () => {
  const { currentUser, toPublic } = await import("./auth");
  const u = currentUser();
  return u ? toPublic(u) : null;
});

export const register = createServerFn({ method: "POST" })
  .validator((d: unknown) => ({ email: s(obj(d).email, 200), senha: s(obj(d).senha, 200), nome: s(obj(d).nome, 40) }))
  .handler(async ({ data }) => {
    const { createUser, startSession, toPublic } = await import("./auth");
    const u = createUser(data.email, data.senha, data.nome);
    startSession(u);
    return toPublic(u);
  });

export const login = createServerFn({ method: "POST" })
  .validator((d: unknown) => ({ email: s(obj(d).email, 200), senha: s(obj(d).senha, 200) }))
  .handler(async ({ data }) => {
    const { verifyUser, startSession, toPublic } = await import("./auth");
    const u = verifyUser(data.email, data.senha);
    startSession(u);
    return toPublic(u);
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const { endSession } = await import("./auth");
  endSession();
  return { ok: true };
});

export const saveProfile = createServerFn({ method: "POST" })
  .validator((d: unknown) => ({ nome: s(obj(d).nome, 40), bio: s(obj(d).bio, 160), avatar: s(obj(d).avatar, 20) }))
  .handler(async ({ data }) => {
    const { requireUser, updateProfile, toPublic } = await import("./auth");
    return toPublic(updateProfile(requireUser(), data));
  });

export const changePasswordFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => ({ atual: s(obj(d).atual, 200), nova: s(obj(d).nova, 200) }))
  .handler(async ({ data }) => {
    const { requireUser, changePassword, startSession } = await import("./auth");
    const u = requireUser();
    changePassword(u, data.atual, data.nova);
    startSession(u);
    return { ok: true };
  });

/* ------------------------------ tropas salvas ------------------------------ */

export const listLineups = createServerFn({ method: "GET" }).handler(async () => {
  const { currentUser } = await import("./auth");
  const { db } = await import("./db");
  const u = currentUser();
  if (!u) return [];
  return db.lineups.filter((l) => l.userId === u.id).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
});

export const saveLineupFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const o = obj(d);
    const ids = (x: unknown) => (Array.isArray(x) ? x.map(Number).filter(Number.isInteger).slice(0, 20) : []);
    return {
      nome: s(o.nome, 80),
      rodada: Number(o.rodada) || 0,
      temporada: Number(o.temporada) || 0,
      formation: s(o.formation, 8),
      profile: s(o.profile, 20),
      titulares: ids(o.titulares),
      captainId: Number(o.captainId) || 0,
      reservas: (Array.isArray(o.reservas) ? o.reservas : []).slice(0, 6).map((r) => ({ atletaId: Number(obj(r).atletaId) || 0, posicaoId: Number(obj(r).posicaoId) || 0, luxo: Boolean(obj(r).luxo) })),
      custo: Number(o.custo) || 0,
      xP: Number(o.xP) || 0,
    };
  })
  .handler(async ({ data }) => {
    const { requireUser } = await import("./auth");
    const { db, newId } = await import("./db");
    const u = requireUser();
    const mine = db.lineups.filter((l) => l.userId === u.id).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
    if (mine.length >= 100) db.lineups.remove(mine[0].id);
    return db.lineups.put({ ...data, id: newId(), userId: u.id, criadoEm: new Date().toISOString() });
  });

export const deleteLineupFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => ({ id: s(obj(d).id, 60) }))
  .handler(async ({ data }) => {
    const { requireUser } = await import("./auth");
    const { db } = await import("./db");
    const u = requireUser();
    const l = db.lineups.get(data.id);
    if (l && l.userId === u.id) db.lineups.remove(l.id);
    return { ok: true };
  });

/* ------------------------------ comunidade ------------------------------ */

export const fetchFeed = createServerFn({ method: "GET" }).handler(async () => {
  const { currentUser } = await import("./auth");
  const { listPosts, listStories } = await import("./community");
  const u = currentUser();
  return { posts: listPosts(u), stories: listStories() };
});

export const communityAction = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const o = obj(d);
    const action = s(o.action, 20);
    if (!["post", "delete", "like", "comment", "vote", "story"].includes(action)) throw new Error("Ação inválida.");
    return { action, payload: obj(o.payload) };
  })
  .handler(async ({ data }) => {
    const { requireUser } = await import("./auth");
    const c = await import("./community");
    const u = requireUser();
    const p = data.payload;
    switch (data.action) {
      case "post":
        c.createPost(u, { texto: s(p.texto), media: p.media, poll: p.poll as { pergunta?: string; opcoes?: string[] } | null, oficial: Boolean(p.oficial) });
        break;
      case "delete":
        c.deletePost(u, s(p.postId, 60));
        break;
      case "like":
        c.toggleLike(u, s(p.postId, 60));
        break;
      case "comment":
        c.addComment(u, s(p.postId, 60), s(p.texto, 500));
        break;
      case "vote":
        c.vote(u, s(p.postId, 60), Number(p.option));
        break;
      case "story":
        c.createStory(u, { media: p.media, filtro: s(p.filtro, 20), textos: p.textos, oficial: Boolean(p.oficial) });
        break;
    }
    return { ok: true };
  });

/* ------------------------------ alertas ------------------------------ */

export const fetchAlerts = createServerFn({ method: "GET" }).handler(async () => {
  const { listAlerts } = await import("./store");
  return listAlerts();
});

export const createAlertFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => ({ tipo: s(obj(d).tipo, 20), titulo: s(obj(d).titulo, 90), mensagem: s(obj(d).mensagem, 600) }))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./auth");
    const { createAlert } = await import("./store");
    return createAlert(requireAdmin().id, data);
  });

export const deleteAlertFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => ({ id: s(obj(d).id, 60) }))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./auth");
    const { deleteAlert } = await import("./store");
    requireAdmin();
    deleteAlert(data.id);
    return { ok: true };
  });

/* ------------------------------ gestão de usuários (admin) ------------------------------ */

export const adminUsersFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("./auth");
  requireAdmin();
  const { listUsers } = await import("./usuarios");
  return listUsers();
});

export const adminUserDetailFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => ({ id: s(obj(d).id, 64) }))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./auth");
    requireAdmin();
    const { userDetail } = await import("./usuarios");
    return userDetail(data.id);
  });

export const adminUserActionFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const acao = s(obj(d).acao, 20);
    if (acao !== "bloquear" && acao !== "desbloquear" && acao !== "excluir") throw new Error("Ação inválida.");
    return { id: s(obj(d).id, 64), acao: acao as "bloquear" | "desbloquear" | "excluir" };
  })
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./auth");
    const admin = requireAdmin();
    const { userAction } = await import("./usuarios");
    return userAction(admin, data.id, data.acao);
  });
