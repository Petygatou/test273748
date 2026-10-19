/**
 * Gestão de usuários para o Painel ADM (somente servidor). Nunca devolve
 * senha, sal ou hash.
 */
import { isAdmin, isEnvAdmin } from "./auth";
import { db, type UserRow } from "./db";

const ONLINE_MS = 5 * 60_000;

export interface UserListRow {
  id: string;
  nome: string;
  email: string;
  avatar: string;
  admin: boolean;
  adminFixo: boolean;
  bloqueado: boolean;
  online: boolean;
  criadoEm: string;
  ultimoAcesso: string | null;
  ultimoLogin: string | null;
  logins: number;
  dispositivo: string | null;
  posts: number;
  comentarios: number;
  curtidas: number;
  votos: number;
  tropas: number;
}

function row(u: UserRow, now: number): UserListRow {
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    avatar: u.avatar,
    admin: isAdmin(u),
    adminFixo: isEnvAdmin(u),
    bloqueado: Boolean(u.bloqueado),
    online: Boolean(u.ultimoAcesso && now - new Date(u.ultimoAcesso).getTime() < ONLINE_MS),
    criadoEm: u.criadoEm,
    ultimoAcesso: u.ultimoAcesso ?? null,
    ultimoLogin: u.ultimoLogin ?? null,
    logins: u.logins ?? 0,
    dispositivo: u.dispositivo ?? null,
    posts: db.posts.filter((p) => p.userId === u.id).length,
    comentarios: db.comments.filter((c) => c.userId === u.id).length,
    curtidas: db.likes.filter((l) => l.userId === u.id).length,
    votos: db.votes.filter((v) => v.userId === u.id).length,
    tropas: db.lineups.filter((l) => l.userId === u.id).length,
  };
}

export function listUsers(now = Date.now()) {
  const users = db.users.all().map((u) => row(u, now));
  users.sort((a, b) => (b.ultimoAcesso ?? b.criadoEm).localeCompare(a.ultimoAcesso ?? a.criadoEm));
  const day = 86400_000;
  return {
    usuarios: users,
    resumo: {
      total: users.length,
      online: users.filter((u) => u.online).length,
      ativos24h: users.filter((u) => u.ultimoAcesso && now - new Date(u.ultimoAcesso).getTime() < day).length,
      novos7d: users.filter((u) => now - new Date(u.criadoEm).getTime() < 7 * day).length,
      bloqueados: users.filter((u) => u.bloqueado).length,
    },
  };
}

export function userDetail(id: string, now = Date.now()) {
  const u = db.users.get(id);
  if (!u) throw new Error("Usuário não encontrado.");
  const titulo = (postId: string) => db.posts.get(postId)?.texto.slice(0, 80) ?? "(publicação apagada)";
  return {
    ...row(u, now),
    bio: u.bio,
    bloqueadoEm: u.bloqueadoEm ?? null,
    atividade: {
      comentarios: db.comments
        .filter((c) => c.userId === id)
        .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
        .slice(0, 30)
        .map((c) => ({ texto: c.texto, em: c.criadoEm, post: titulo(c.postId) })),
      curtidas: db.likes.filter((l) => l.userId === id).slice(0, 30).map((l) => ({ post: titulo(l.postId) })),
      votos: db.votes
        .filter((v) => v.userId === id)
        .slice(0, 30)
        .map((v) => {
          const p = db.posts.get(v.postId);
          return { pergunta: p?.poll?.pergunta ?? "(enquete apagada)", opcao: p?.poll?.opcoes[v.option] ?? "?" };
        }),
      tropas: db.lineups
        .filter((l) => l.userId === id)
        .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
        .slice(0, 30)
        .map((l) => ({ nome: l.nome, rodada: l.rodada, esquema: l.formation, custo: l.custo, xP: l.xP, em: l.criadoEm })),
      posts: db.posts
        .filter((p) => p.userId === id)
        .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
        .slice(0, 30)
        .map((p) => ({ texto: p.texto.slice(0, 140), em: p.criadoEm })),
    },
  };
}

export function userAction(admin: UserRow, id: string, acao: "bloquear" | "desbloquear" | "excluir") {
  const u = db.users.get(id);
  if (!u) throw new Error("Usuário não encontrado.");
  if (u.id === admin.id) throw new Error("Você não pode fazer isso com a sua própria conta.");
  if (isEnvAdmin(u)) throw new Error("Esta é a conta de administrador definida no servidor (ADMIN_EMAILS).");
  if (acao === "bloquear") db.users.update(id, { bloqueado: true, bloqueadoEm: new Date().toISOString() });
  else if (acao === "desbloquear") db.users.update(id, { bloqueado: false, bloqueadoEm: undefined });
  else {
    db.likes.removeWhere((l) => l.userId === id);
    db.votes.removeWhere((v) => v.userId === id);
    db.comments.removeWhere((c) => c.userId === id);
    db.lineups.removeWhere((l) => l.userId === id);
    db.stories.removeWhere((s) => s.userId === id);
    db.users.remove(id);
  }
  return { ok: true };
}
