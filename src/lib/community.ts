/**
 * Comunidade (feed, stories, enquetes, curtidas, comentários).
 *
 * Dois backends com a mesma interface:
 *  - cloud: Lovable Cloud (Supabase) — tabelas + storage + realtime;
 *  - local: navegador (IndexedDB para mídia, localStorage para metadados),
 *    usado quando a nuvem não está configurada. Sincroniza entre abas.
 */
import { getSupabase } from "./supabase";
import type { AvatarKey } from "./storage";

export interface Author {
  id: string;
  nome: string;
  avatar: AvatarKey;
  oficial?: boolean;
}

export interface Media {
  kind: "image" | "video";
  url: string;
}

export interface Poll {
  pergunta: string;
  opcoes: string[];
  votos: number[];
  meuVoto: number | null;
}

export interface Comment {
  id: string;
  author: Author;
  texto: string;
  criadoEm: string;
}

export interface Post {
  id: string;
  author: Author;
  texto: string;
  media?: Media;
  poll?: Poll;
  likes: number;
  liked: boolean;
  comments: Comment[];
  criadoEm: string;
}

export const STORY_FILTERS = {
  nenhum: "none",
  vivido: "saturate(1.6) contrast(1.1)",
  pb: "grayscale(1) contrast(1.15)",
  sepia: "sepia(0.75) contrast(1.05)",
  quente: "sepia(0.25) saturate(1.4) hue-rotate(-12deg)",
  frio: "saturate(1.1) hue-rotate(18deg) brightness(1.05)",
  arena: "contrast(1.25) saturate(1.3) brightness(0.95)",
} as const;
export type StoryFilter = keyof typeof STORY_FILTERS;

export interface StoryText {
  id: string;
  texto: string;
  x: number; // 0..1
  y: number; // 0..1
  cor: string;
  tamanho: number; // px a 360 de largura
}

export interface Story {
  id: string;
  author: Author;
  media: Media;
  filtro: StoryFilter;
  textos: StoryText[];
  criadoEm: string;
}

export interface NewPost {
  texto: string;
  file?: File | null;
  poll?: { pergunta: string; opcoes: string[] } | null;
}

export interface NewStory {
  blob: Blob;
  kind: "image" | "video";
  filtro: StoryFilter;
  textos: StoryText[];
}

export interface CommunityBackend {
  kind: "local" | "cloud";
  listPosts(me: Author): Promise<Post[]>;
  createPost(p: NewPost, author: Author): Promise<void>;
  toggleLike(postId: string, me: Author): Promise<void>;
  addComment(postId: string, texto: string, author: Author): Promise<void>;
  vote(postId: string, option: number, me: Author): Promise<void>;
  listStories(): Promise<Story[]>;
  createStory(s: NewStory, author: Author): Promise<void>;
  subscribe(cb: () => void): () => void;
}

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/* ================================ LOCAL ================================ */

interface LocalPost extends Omit<Post, "media" | "likes" | "liked" | "poll"> {
  mediaId?: string;
  mediaKind?: Media["kind"];
  poll?: { pergunta: string; opcoes: string[] };
}
interface LocalStory extends Omit<Story, "media"> {
  mediaId: string;
  mediaKind: Media["kind"];
}
interface LocalState {
  posts: LocalPost[];
  stories: LocalStory[];
  likes: Record<string, string[]>; // postId -> authorIds
  votes: Record<string, Record<string, number>>; // postId -> authorId -> opção
  seeded?: boolean;
}

const LS_KEY = "cfc:community:v1";
const OFICIAL: Author = { id: "oficial", nome: "Comandante FC", avatar: "estrategista", oficial: true };

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("cfc-media", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("blobs");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function putBlob(id: string, blob: Blob) {
  const db = await idb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction("blobs", "readwrite");
    tx.objectStore("blobs").put(blob, id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
const urlCache = new Map<string, string>();
async function blobUrl(id: string): Promise<string | null> {
  if (urlCache.has(id)) return urlCache.get(id)!;
  const db = await idb();
  const blob = await new Promise<Blob | undefined>((res, rej) => {
    const r = db.transaction("blobs").objectStore("blobs").get(id);
    r.onsuccess = () => res(r.result as Blob | undefined);
    r.onerror = () => rej(r.error);
  });
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

function readState(): LocalState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as LocalState;
  } catch {
    /* sem storage */
  }
  return { posts: [], stories: [], likes: {}, votes: {} };
}
function writeState(s: LocalState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* sem espaço/armazenamento */
  }
  channel?.postMessage("changed");
  listeners.forEach((l) => l());
}

const listeners = new Set<() => void>();
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("cfc-community") : null;
channel?.addEventListener("message", () => listeners.forEach((l) => l()));

function seed(s: LocalState): LocalState {
  if (s.seeded) return s;
  const now = Date.now();
  const fans: Author[] = [
    { id: "f1", nome: "Mito da Várzea", avatar: "leao" },
    { id: "f2", nome: "Cartoleira Raiz", avatar: "astronauta" },
    { id: "f3", nome: "Tático 4-3-3", avatar: "lobo" },
  ];
  s.posts = [
    {
      id: uid(),
      author: OFICIAL,
      texto: "Bem-vindo à arena! Aqui os cartoleiros trocam leituras da rodada. Lembrete: o backtest do modelo está aberto em Precisão do modelo — confira antes de duvidar do capitão 😉",
      comments: [{ id: uid(), author: fans[0], texto: "Bora mitar! 🔥", criadoEm: new Date(now - 3500_000).toISOString() }],
      criadoEm: new Date(now - 4000_000).toISOString(),
    },
    {
      id: uid(),
      author: OFICIAL,
      texto: "Enquete da rodada: qual perfil você vai usar?",
      poll: { pergunta: "Perfil da sua tropa nesta rodada", opcoes: ["Mitada", "Equilibrada", "Valorização"] },
      comments: [],
      criadoEm: new Date(now - 2500_000).toISOString(),
    },
    {
      id: uid(),
      author: fans[2],
      texto: "Fui de 3-4-3 com três do mesmo time: correlação é tudo quando o time tem 2+ gols esperados. Se der ruim, deu ruim junto 😂",
      comments: [{ id: uid(), author: fans[1], texto: "Corajoso! Eu fiquei no 4-3-3 equilibrado.", criadoEm: new Date(now - 900_000).toISOString() }],
      criadoEm: new Date(now - 1200_000).toISOString(),
    },
  ];
  s.likes = { [s.posts[0].id]: ["f1", "f2", "f3"], [s.posts[2].id]: ["f1"] };
  s.votes = { [s.posts[1].id]: { f1: 0, f2: 1, f3: 1 } };
  s.seeded = true;
  return s;
}

export const localBackend: CommunityBackend = {
  kind: "local",
  async listPosts(me) {
    const s = seed(readState());
    writeStateSilently(s);
    const out: Post[] = [];
    for (const p of [...s.posts].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))) {
      const likes = s.likes[p.id] ?? [];
      const votes = s.votes[p.id] ?? {};
      let media: Media | undefined;
      if (p.mediaId && p.mediaKind) {
        const url = await blobUrl(p.mediaId).catch(() => null);
        if (url) media = { kind: p.mediaKind, url };
      }
      out.push({
        id: p.id,
        author: p.author,
        texto: p.texto,
        media,
        poll: p.poll
          ? {
              ...p.poll,
              votos: p.poll.opcoes.map((_, i) => Object.values(votes).filter((v) => v === i).length),
              meuVoto: votes[me.id] ?? null,
            }
          : undefined,
        likes: likes.length,
        liked: likes.includes(me.id),
        comments: p.comments,
        criadoEm: p.criadoEm,
      });
    }
    return out;
  },
  async createPost(p, author) {
    const s = readState();
    let mediaId: string | undefined;
    let mediaKind: Media["kind"] | undefined;
    if (p.file) {
      mediaId = uid();
      mediaKind = p.file.type.startsWith("video") ? "video" : "image";
      await putBlob(mediaId, p.file.type.startsWith("image") ? await compressImage(p.file) : p.file);
    }
    s.posts.push({ id: uid(), author, texto: p.texto, mediaId, mediaKind, poll: p.poll ?? undefined, comments: [], criadoEm: new Date().toISOString() });
    writeState(s);
  },
  async toggleLike(postId, me) {
    const s = readState();
    const list = new Set(s.likes[postId] ?? []);
    if (list.has(me.id)) list.delete(me.id);
    else list.add(me.id);
    s.likes[postId] = [...list];
    writeState(s);
  },
  async addComment(postId, texto, author) {
    const s = readState();
    const p = s.posts.find((x) => x.id === postId);
    if (!p) return;
    p.comments.push({ id: uid(), author, texto, criadoEm: new Date().toISOString() });
    writeState(s);
  },
  async vote(postId, option, me) {
    const s = readState();
    s.votes[postId] = { ...(s.votes[postId] ?? {}), [me.id]: option };
    writeState(s);
  },
  async listStories() {
    const s = readState();
    const cutoff = Date.now() - 24 * 3600_000;
    const out: Story[] = [];
    for (const st of s.stories.filter((x) => new Date(x.criadoEm).getTime() > cutoff).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))) {
      const url = await blobUrl(st.mediaId).catch(() => null);
      if (url) out.push({ ...st, media: { kind: st.mediaKind, url } });
    }
    return out;
  },
  async createStory(st, author) {
    const s = readState();
    const mediaId = uid();
    await putBlob(mediaId, st.kind === "image" ? await compressImage(st.blob) : st.blob);
    s.stories.push({ id: uid(), author, mediaId, mediaKind: st.kind, filtro: st.filtro, textos: st.textos, criadoEm: new Date().toISOString() });
    writeState(s);
  },
  subscribe(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
};

function writeStateSilently(s: LocalState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** Reduz fotos para no máximo 1440px (JPEG 85%) antes de guardar/enviar. */
export async function compressImage(blob: Blob, max = 1440): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && blob.size < 1_500_000) return blob;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b ?? blob), "image/jpeg", 0.85));
  } catch {
    return blob;
  }
}

/* ================================ CLOUD ================================ */

interface PostRow {
  id: string;
  user_id: string;
  author_name: string;
  author_avatar: AvatarKey;
  oficial: boolean;
  texto: string;
  media_url: string | null;
  media_kind: Media["kind"] | null;
  poll: { pergunta: string; opcoes: string[] } | null;
  created_at: string;
  post_likes: Array<{ user_id: string }>;
  post_comments: Array<{ id: string; user_id: string; author_name: string; author_avatar: AvatarKey; texto: string; created_at: string }>;
  poll_votes: Array<{ user_id: string; option: number }>;
}

async function uploadMedia(blob: Blob, ext: string): Promise<string> {
  const sb = getSupabase()!;
  const path = `${(await sb.auth.getUser()).data.user?.id ?? "anon"}/${uid()}.${ext}`;
  const { error } = await sb.storage.from("media").upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw new Error(error.message);
  return sb.storage.from("media").getPublicUrl(path).data.publicUrl;
}

function requireUser() {
  const sb = getSupabase();
  if (!sb) throw new Error("Lovable Cloud não configurado.");
  return sb;
}

export const cloudBackend: CommunityBackend = {
  kind: "cloud",
  async listPosts(me) {
    const sb = requireUser();
    const { data, error } = await sb
      .from("posts")
      .select("*, post_likes(user_id), post_comments(id,user_id,author_name,author_avatar,texto,created_at), poll_votes(user_id,option)")
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);
    return (data as PostRow[]).map((r) => ({
      id: r.id,
      author: { id: r.user_id, nome: r.author_name, avatar: r.author_avatar, oficial: r.oficial },
      texto: r.texto,
      media: r.media_url && r.media_kind ? { kind: r.media_kind, url: r.media_url } : undefined,
      poll: r.poll
        ? { ...r.poll, votos: r.poll.opcoes.map((_, i) => r.poll_votes.filter((v) => v.option === i).length), meuVoto: r.poll_votes.find((v) => v.user_id === me.id)?.option ?? null }
        : undefined,
      likes: r.post_likes.length,
      liked: r.post_likes.some((l) => l.user_id === me.id),
      comments: [...r.post_comments]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((c) => ({ id: c.id, author: { id: c.user_id, nome: c.author_name, avatar: c.author_avatar }, texto: c.texto, criadoEm: c.created_at })),
      criadoEm: r.created_at,
    }));
  },
  async createPost(p, author) {
    const sb = requireUser();
    let media_url: string | null = null;
    let media_kind: Media["kind"] | null = null;
    if (p.file) {
      media_kind = p.file.type.startsWith("video") ? "video" : "image";
      const blob = media_kind === "image" ? await compressImage(p.file) : p.file;
      media_url = await uploadMedia(blob, media_kind === "image" ? "jpg" : (p.file.name.split(".").pop() ?? "mp4"));
    }
    const { error } = await sb.from("posts").insert({ texto: p.texto, media_url, media_kind, poll: p.poll ?? null, author_name: author.nome, author_avatar: author.avatar, oficial: Boolean(author.oficial) });
    if (error) throw new Error(error.message);
  },
  async toggleLike(postId, me) {
    const sb = requireUser();
    const { data } = await sb.from("post_likes").select("post_id").eq("post_id", postId).eq("user_id", me.id).maybeSingle();
    const { error } = data ? await sb.from("post_likes").delete().eq("post_id", postId).eq("user_id", me.id) : await sb.from("post_likes").insert({ post_id: postId, user_id: me.id });
    if (error) throw new Error(error.message);
  },
  async addComment(postId, texto, author) {
    const sb = requireUser();
    const { error } = await sb.from("post_comments").insert({ post_id: postId, texto, author_name: author.nome, author_avatar: author.avatar });
    if (error) throw new Error(error.message);
  },
  async vote(postId, option, me) {
    const sb = requireUser();
    const { error } = await sb.from("poll_votes").upsert({ post_id: postId, user_id: me.id, option }, { onConflict: "post_id,user_id" });
    if (error) throw new Error(error.message);
  },
  async listStories() {
    const sb = requireUser();
    const { data, error } = await sb.from("stories").select("*").gt("expires_at", new Date().toISOString()).order("created_at");
    if (error) throw new Error(error.message);
    return (data as Array<{ id: string; user_id: string; author_name: string; author_avatar: AvatarKey; oficial: boolean; media_url: string; media_kind: Media["kind"]; meta: { filtro: StoryFilter; textos: StoryText[] }; created_at: string }>).map((r) => ({
      id: r.id,
      author: { id: r.user_id, nome: r.author_name, avatar: r.author_avatar, oficial: r.oficial },
      media: { kind: r.media_kind, url: r.media_url },
      filtro: r.meta?.filtro ?? "nenhum",
      textos: r.meta?.textos ?? [],
      criadoEm: r.created_at,
    }));
  },
  async createStory(st, author) {
    const sb = requireUser();
    const blob = st.kind === "image" ? await compressImage(st.blob) : st.blob;
    const media_url = await uploadMedia(blob, st.kind === "image" ? "jpg" : "webm");
    const { error } = await sb.from("stories").insert({ media_url, media_kind: st.kind, meta: { filtro: st.filtro, textos: st.textos }, author_name: author.nome, author_avatar: author.avatar, oficial: Boolean(author.oficial) });
    if (error) throw new Error(error.message);
  },
  subscribe(cb) {
    const sb = getSupabase();
    if (!sb) return () => {};
    const ch = sb
      .channel("community")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, cb)
      .on("postgres_changes", { event: "*", schema: "public", table: "post_likes" }, cb)
      .on("postgres_changes", { event: "*", schema: "public", table: "post_comments" }, cb)
      .on("postgres_changes", { event: "*", schema: "public", table: "poll_votes" }, cb)
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, cb)
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  },
};

export function getCommunity(): CommunityBackend {
  return getSupabase() ? cloudBackend : localBackend;
}

export { OFICIAL as OFFICIAL_AUTHOR };
