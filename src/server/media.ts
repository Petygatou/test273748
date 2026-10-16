/** Armazenamento de fotos e vídeos em DATA_DIR/media (somente servidor). */
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { dataDir } from "./db";

export const MEDIA_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};
const MIME_BY_EXT = Object.fromEntries(Object.entries(MEDIA_TYPES).map(([m, e]) => [e, m]));
export const MAX_MEDIA_BYTES = 60 * 1024 * 1024;

const dir = () => join(dataDir(), "media");

export async function saveMedia(bytes: Uint8Array, mime: string): Promise<{ url: string; kind: "image" | "video" }> {
  const base = mime.split(";")[0].trim().toLowerCase();
  const ext = MEDIA_TYPES[base];
  if (!ext) throw new Error("Formato não suportado (use JPG, PNG, WEBP, GIF, MP4, WEBM ou MOV).");
  if (bytes.byteLength > MAX_MEDIA_BYTES) throw new Error("Arquivo acima de 60 MB.");
  if (bytes.byteLength === 0) throw new Error("Arquivo vazio.");
  await mkdir(dir(), { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(join(dir(), name), bytes);
  return { url: `/media/${name}`, kind: base.startsWith("video") ? "video" : "image" };
}

/** Serve um arquivo com suporte a Range (necessário para vídeo no Safari/iOS). */
export function serveMedia(name: string, range: string | null): Response {
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm|mov)$/.test(name)) return new Response("Não encontrado", { status: 404 });
  const file = join(dir(), name);
  if (!existsSync(file)) return new Response("Não encontrado", { status: 404 });
  const size = statSync(file).size;
  const type = MIME_BY_EXT[name.split(".").pop()!] ?? "application/octet-stream";
  const headers: Record<string, string> = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=31536000, immutable" };
  const m = range?.match(/bytes=(\d*)-(\d*)/);
  if (m) {
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { headers: { ...headers, "Content-Length": String(size) } });
}
