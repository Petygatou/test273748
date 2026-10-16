/** Comunidade no servidor: feed, enquetes, curtidas, comentários e stories. */
import { db, newId, type MediaRef, type UserRow } from "./db";
import { isAdmin } from "./auth";

export interface Author {
  id: string;
  nome: string;
  avatar: string;
  oficial?: boolean;
}

export interface PostView {
  id: string;
  author: Author;
  texto: string;
  media?: MediaRef;
  poll?: { pergunta: string; opcoes: string[]; votos: number[]; meuVoto: number | null };
  likes: number;
  liked: boolean;
  comments: Array<{ id: string; author: Author; texto: string; criadoEm: string }>;
  criadoEm: string;
  podeApagar: boolean;
}

export interface StoryView {
  id: string;
  author: Author;
  media: MediaRef;
  filtro: string;
  textos: Array<{ id: string; texto: string; x: number; y: number; cor: string; tamanho: number }>;
  criadoEm: string;
}

const OFICIAL: Author = { id: "oficial", nome: "Comandante FC", avatar: "estrategista", oficial: true };

function author(userId: string, oficial = false): Author {
  if (oficial || userId === "oficial") return OFICIAL;
  const u = db.users.get(userId);
  return { id: userId, nome: u?.nome ?? "Cartoleiro", avatar: u?.avatar ?? "aguia" };
}

function seedIfEmpty() {
  if (db.posts.all().length) return;
  db.posts.put({
    id: newId(),
    userId: "oficial",
    oficial: true,
    texto: "Bem-vindo à arena! Aqui os cartoleiros trocam leituras da rodada. Antes de duvidar do capitão, confira o backtest em Precisão do modelo 😉",
    criadoEm: new Date().toISOString(),
  });
  db.posts.put({
    id: newId(),
    userId: "oficial",
    oficial: true,
    texto: "Enquete da rodada:",
    poll: { pergunta: "Qual perfil você vai usar na sua tropa?", opcoes: ["Mitada", "Equilibrada", "Valorização"] },
    criadoEm: new Date(Date.now() + 1).toISOString(),
  });
}

const isMedia = (m: unknown): m is MediaRef =>
  !!m && typeof m === "object" && ["image", "video"].includes((m as MediaRef).kind) && typeof (m as MediaRef).url === "string" && (m as MediaRef).url.startsWith("/media/");

export function listPosts(viewer: UserRow | null, limit = 60): PostView[] {
  seedIfEmpty();
  const posts = db.posts.all().sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).slice(0, limit);
  const likes = db.likes.all();
  const comments = db.comments.all();
  const votes = db.votes.all();
  return posts.map((p) => {
    const pl = likes.filter((l) => l.postId === p.id);
    const pv = votes.filter((v) => v.postId === p.id);
    return {
      id: p.id,
      author: author(p.userId, p.oficial),
      texto: p.texto,
      media: p.media,
      poll: p.poll
        ? { ...p.poll, votos: p.poll.opcoes.map((_, i) => pv.filter((v) => v.option === i).length), meuVoto: viewer ? pv.find((v) => v.userId === viewer.id)?.option ?? null : null }
        : undefined,
      likes: pl.length,
      liked: viewer ? pl.some((l) => l.userId === viewer.id) : false,
      comments: comments
        .filter((c) => c.postId === p.id)
        .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))
        .map((c) => ({ id: c.id, author: author(c.userId), texto: c.texto, criadoEm: c.criadoEm })),
      criadoEm: p.criadoEm,
      podeApagar: Boolean(viewer && (viewer.id === p.userId || isAdmin(viewer))),
    };
  });
}

export function createPost(u: UserRow, input: { texto?: string; media?: unknown; poll?: { pergunta?: string; opcoes?: string[] } | null; oficial?: boolean }) {
  const texto = String(input.texto ?? "").slice(0, 2000).trim();
  const media = isMedia(input.media) ? input.media : undefined;
  let poll: { pergunta: string; opcoes: string[] } | undefined;
  if (input.poll && input.poll.pergunta) {
    const opcoes = (input.poll.opcoes ?? []).map((o) => String(o).trim().slice(0, 60)).filter(Boolean).slice(0, 4);
    if (opcoes.length >= 2) poll = { pergunta: String(input.poll.pergunta).slice(0, 140), opcoes };
  }
  if (!texto && !media && !poll) throw new Error("Publicação vazia.");
  const oficial = Boolean(input.oficial);
  if (oficial && !isAdmin(u)) throw new Error("Só o administrador publica como oficial.");
  return db.posts.put({ id: newId(), userId: u.id, oficial, texto, media, poll, criadoEm: new Date().toISOString() });
}

export function deletePost(u: UserRow, postId: string) {
  const p = db.posts.get(postId);
  if (!p) return;
  if (p.userId !== u.id && !isAdmin(u)) throw new Error("Sem permissão.");
  db.posts.remove(postId);
  db.likes.removeWhere((l) => l.postId === postId);
  db.comments.removeWhere((c) => c.postId === postId);
  db.votes.removeWhere((v) => v.postId === postId);
}

export function toggleLike(u: UserRow, postId: string) {
  if (!db.posts.get(postId)) throw new Error("Publicação não encontrada.");
  const id = `${postId}:${u.id}`;
  if (db.likes.get(id)) db.likes.remove(id);
  else db.likes.put({ id, postId, userId: u.id });
}

export function addComment(u: UserRow, postId: string, texto: string) {
  if (!db.posts.get(postId)) throw new Error("Publicação não encontrada.");
  const t = texto.trim().slice(0, 500);
  if (!t) throw new Error("Comentário vazio.");
  db.comments.put({ id: newId(), postId, userId: u.id, texto: t, criadoEm: new Date().toISOString() });
}

export function vote(u: UserRow, postId: string, option: number) {
  const p = db.posts.get(postId);
  if (!p?.poll) throw new Error("Enquete não encontrada.");
  if (!Number.isInteger(option) || option < 0 || option >= p.poll.opcoes.length) throw new Error("Opção inválida.");
  db.votes.put({ id: `${postId}:${u.id}`, postId, userId: u.id, option });
}

export function listStories(): StoryView[] {
  const cutoff = Date.now() - 24 * 3600_000;
  return db.stories
    .filter((s) => new Date(s.criadoEm).getTime() > cutoff)
    .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))
    .map((s) => ({ id: s.id, author: author(s.userId, s.oficial), media: s.media, filtro: s.filtro, textos: s.textos, criadoEm: s.criadoEm }));
}

export function createStory(u: UserRow, input: { media?: unknown; filtro?: string; textos?: unknown; oficial?: boolean }) {
  if (!isMedia(input.media)) throw new Error("Story sem mídia.");
  const oficial = Boolean(input.oficial);
  if (oficial && !isAdmin(u)) throw new Error("Só o administrador publica story oficial.");
  const textos = (Array.isArray(input.textos) ? input.textos : [])
    .slice(0, 10)
    .map((t) => {
      const x = t as Record<string, unknown>;
      return {
        id: String(x.id ?? newId()).slice(0, 40),
        texto: String(x.texto ?? "").slice(0, 80),
        x: Math.min(1, Math.max(0, Number(x.x) || 0.5)),
        y: Math.min(1, Math.max(0, Number(x.y) || 0.5)),
        cor: /^#[0-9a-f]{6}$/i.test(String(x.cor)) ? String(x.cor) : "#ffffff",
        tamanho: Math.min(64, Math.max(12, Number(x.tamanho) || 28)),
      };
    })
    .filter((t) => t.texto);
  db.stories.put({ id: newId(), userId: u.id, oficial, media: input.media, filtro: String(input.filtro ?? "nenhum").slice(0, 20), textos, criadoEm: new Date().toISOString() });
  // limpeza: stories com mais de 3 dias
  db.stories.removeWhere((s) => Date.now() - new Date(s.criadoEm).getTime() > 3 * 86400_000);
}
