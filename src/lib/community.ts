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
  /** todas as mídias do post (carrossel); posts antigos têm uma só */
  midias?: Media[];
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
  podeApagar?: boolean;
  media: Media;
  filtro: StoryFilter;
  textos: StoryText[];
  criadoEm: string;
}

export interface NewPost {
  texto: string;
  /** fotos e vídeos do carrossel, na ordem (até 10) */
  files?: File[];
  poll?: { pergunta: string; opcoes: string[] } | null;
  /** progresso do envio: arquivo atual (1..n), total e % do arquivo atual */
  onProgress?: (atual: number, total: number, pct: number) => void;
}

export const MAX_MIDIAS_POST = 10;

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
  deleteStory(storyId: string): Promise<void>;
}

let blobAtivo: Promise<boolean> | null = null;
/** O armazenamento de arquivos da Vercel (Blob) está ligado nesta hospedagem? */
function blobDisponivel(): Promise<boolean> {
  blobAtivo ??= fetch("/api/upload")
    .then((r) => r.json() as Promise<{ enabled?: boolean }>)
    .then((j) => Boolean(j.enabled))
    .catch(() => false);
  return blobAtivo;
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };

/**
 * Envia uma foto/vídeo e devolve a referência. Com o Vercel Blob ligado, o arquivo vai direto
 * do navegador para o Blob (sem o limite de 4,5 MB das funções da Vercel); sem ele, vai para o
 * nosso servidor (hospedagem com disco próprio).
 */
export async function uploadMedia(blob: Blob, onProgress?: (pct: number) => void): Promise<Media> {
  const body = blob.type.startsWith("image") ? await compressImage(blob) : blob;
  const type = (body.type || "application/octet-stream").split(";")[0];
  const kind: Media["kind"] = type.startsWith("video") ? "video" : "image";
  if (!EXT[type]) throw new Error("Formato não suportado (use JPG, PNG, WEBP, GIF, MP4, WEBM ou MOV).");
  if (body.size > 60 * 1024 * 1024) throw new Error("Arquivo acima de 60 MB.");
  if (await blobDisponivel()) {
    const { upload } = await import("@vercel/blob/client");
    const r = await upload(`tropa/${kind}.${EXT[type]}`, body, {
      access: "public",
      handleUploadUrl: "/api/upload",
      contentType: type,
      multipart: body.size > 8 * 1024 * 1024,
      onUploadProgress: onProgress ? (e) => onProgress(e.percentage) : undefined,
    });
    return { url: r.url, kind };
  }
  const res = await fetch("/api/media", { method: "POST", headers: { "Content-Type": type }, body });
  const j = (await res.json().catch(() => ({}))) as { url?: string; kind?: Media["kind"]; error?: string };
  if (res.status === 413) throw new Error("Arquivo grande demais para esta hospedagem. Na Vercel, ligue o armazenamento Blob (Storage → Blob) para enviar vídeos.");
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
    const files = (p.files ?? []).slice(0, MAX_MIDIAS_POST);
    const midias: Media[] = [];
    // um de cada vez: mantém a ordem e mostra o progresso arquivo a arquivo
    for (let i = 0; i < files.length; i++) {
      p.onProgress?.(i + 1, files.length, 0);
      midias.push(await uploadMedia(files[i], (pct) => p.onProgress?.(i + 1, files.length, pct)));
    }
    await communityAction({ data: { action: "post", payload: { texto: p.texto, midias, poll: p.poll ?? null, oficial: Boolean(author.oficial) } } });
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
  async deleteStory(storyId) {
    await communityAction({ data: { action: "deleteStory", payload: { storyId } } });
  },
  async createStory(st, author) {
    const media = await uploadMedia(st.blob);
    await communityAction({ data: { action: "story", payload: { media, filtro: st.filtro, textos: st.textos, oficial: Boolean(author.oficial) } } });
  },
};

export function getCommunity(): CommunityBackend {
  return serverBackend;
}

export const OFFICIAL_AUTHOR: Author = { id: "oficial", nome: "Tropa", avatar: "estrategista", oficial: true };
