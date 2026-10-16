/**
 * Comunidade (feed, stories, enquetes, curtidas, comentários) — cliente.
 * Tudo fica no servidor do próprio app (banco em DATA_DIR); mídia sobe por
 * /api/media e as mudanças chegam em tempo real por /api/events.
 */
import { communityAction, fetchFeed } from "../server/fnsConta";
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
  podeApagar?: boolean;
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
  kind: "server";
  load(): Promise<{ posts: Post[]; stories: Story[] }>;
  createPost(p: NewPost, author: Author): Promise<void>;
  deletePost(postId: string): Promise<void>;
  toggleLike(postId: string): Promise<void>;
  addComment(postId: string, texto: string): Promise<void>;
  vote(postId: string, option: number): Promise<void>;
  createStory(s: NewStory, author: Author): Promise<void>;
}

/** Envia uma foto/vídeo para o servidor e devolve a referência. */
export async function uploadMedia(blob: Blob): Promise<Media> {
  const body = blob.type.startsWith("image") ? await compressImage(blob) : blob;
  const res = await fetch("/api/media", { method: "POST", headers: { "Content-Type": body.type || "application/octet-stream" }, body });
  const j = (await res.json().catch(() => ({}))) as { url?: string; kind?: Media["kind"]; error?: string };
  if (!res.ok || !j.url || !j.kind) throw new Error(j.error ?? `Falha no upload (HTTP ${res.status})`);
  return { url: j.url, kind: j.kind };
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

export const serverBackend: CommunityBackend = {
  kind: "server",
  async load() {
    const r = await fetchFeed();
    return { posts: r.posts as Post[], stories: r.stories as Story[] };
  },
  async createPost(p, author) {
    const media = p.file ? await uploadMedia(p.file) : undefined;
    await communityAction({ data: { action: "post", payload: { texto: p.texto, media, poll: p.poll ?? null, oficial: Boolean(author.oficial) } } });
  },
  async deletePost(postId) {
    await communityAction({ data: { action: "delete", payload: { postId } } });
  },
  async toggleLike(postId) {
    await communityAction({ data: { action: "like", payload: { postId } } });
  },
  async addComment(postId, texto) {
    await communityAction({ data: { action: "comment", payload: { postId, texto } } });
  },
  async vote(postId, option) {
    await communityAction({ data: { action: "vote", payload: { postId, option } } });
  },
  async createStory(st, author) {
    const media = await uploadMedia(st.blob);
    await communityAction({ data: { action: "story", payload: { media, filtro: st.filtro, textos: st.textos, oficial: Boolean(author.oficial) } } });
  },
};

export function getCommunity(): CommunityBackend {
  return serverBackend;
}

export const OFFICIAL_AUTHOR: Author = { id: "oficial", nome: "Comandante FC", avatar: "estrategista", oficial: true };
