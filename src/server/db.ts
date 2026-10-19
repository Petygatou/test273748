/**
 * Banco de dados próprio, em arquivos JSON (somente servidor).
 *
 * Sem serviços externos: cada coleção é um arquivo em DATA_DIR/db, mantido em
 * memória e gravado de forma atômica (arquivo temporário + rename) logo após
 * cada mudança. Para o porte do app (milhares de posts/usuários) é simples,
 * rápido e fácil de fazer backup — basta copiar a pasta DATA_DIR.
 *
 * Cada mudança emite um evento (tópico) usado pelo tempo real (SSE).
 */
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function dataDir(): string {
  return process.env.DATA_DIR ?? (process.env.VERCEL ? "/tmp/cfc-data" : join(process.cwd(), "data"));
}

export const events = new EventEmitter();
events.setMaxListeners(1000);

export type Topic = "community" | "alerts" | "overrides" | "users" | "dados";

/** Avisa os navegadores abertos (SSE) que um tópico mudou. */
export const emit = (topic: Topic) => events.emit("change", topic);

export class Collection<T extends { id: string }> {
  private rows = new Map<string, T>();
  private loaded = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private name: string,
    private topic?: Topic,
  ) {}

  private file() {
    return join(dataDir(), "db", `${this.name}.json`);
  }

  private load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const f = this.file();
      if (existsSync(f)) for (const r of JSON.parse(readFileSync(f, "utf8")) as T[]) this.rows.set(r.id, r);
    } catch (err) {
      console.error(`[db] falha ao ler ${this.name}:`, err);
    }
  }

  private persist(silent = false) {
    if (this.topic && !silent) events.emit("change", this.topic);
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 25);
  }

  flush() {
    try {
      mkdirSync(join(dataDir(), "db"), { recursive: true });
      const f = this.file();
      writeFileSync(f + ".tmp", JSON.stringify([...this.rows.values()]));
      renameSync(f + ".tmp", f);
    } catch (err) {
      console.error(`[db] falha ao gravar ${this.name}:`, err);
    }
  }

  all(): T[] {
    this.load();
    return [...this.rows.values()];
  }

  get(id: string): T | undefined {
    this.load();
    return this.rows.get(id);
  }

  filter(fn: (r: T) => boolean): T[] {
    return this.all().filter(fn);
  }

  find(fn: (r: T) => boolean): T | undefined {
    return this.all().find(fn);
  }

  put(row: T): T {
    this.load();
    this.rows.set(row.id, row);
    this.persist();
    return row;
  }

  /** `silent`: grava sem avisar os navegadores (ex.: registrar último acesso). */
  update(id: string, patch: Partial<T>, silent = false): T | undefined {
    const cur = this.get(id);
    if (!cur) return undefined;
    const next = { ...cur, ...patch, id };
    this.rows.set(id, next);
    this.persist(silent);
    return next;
  }

  remove(id: string): boolean {
    this.load();
    const ok = this.rows.delete(id);
    if (ok) this.persist();
    return ok;
  }

  removeWhere(fn: (r: T) => boolean): number {
    let n = 0;
    for (const r of this.all()) if (fn(r) && this.rows.delete(r.id)) n++;
    if (n) this.persist();
    return n;
  }

  /** Só para testes. */
  _reset() {
    this.rows.clear();
    this.loaded = true;
  }
}

/* ------------------------------ modelos ------------------------------ */

export type AvatarKey = "aguia" | "leao" | "astronauta" | "gladiador" | "robo" | "capitao" | "lobo" | "estrategista";

export interface UserRow {
  id: string;
  email: string;
  nome: string;
  bio: string;
  avatar: AvatarKey;
  salt: string;
  hash: string;
  admin: boolean;
  criadoEm: string;
  /** última requisição autenticada (gravada no máximo 1 vez por minuto) */
  ultimoAcesso?: string;
  ultimoLogin?: string;
  logins?: number;
  /** resumo do aparelho no último login, ex.: "Android · Chrome" */
  dispositivo?: string;
  bloqueado?: boolean;
  bloqueadoEm?: string;
}
export interface SessionRow {
  id: string; // sha256 do token
  userId: string;
  expiraEm: string;
}
export interface MediaRef {
  kind: "image" | "video";
  url: string;
}
export interface PostRow {
  id: string;
  userId: string;
  oficial: boolean;
  texto: string;
  media?: MediaRef;
  poll?: { pergunta: string; opcoes: string[] };
  criadoEm: string;
}
export interface LikeRow {
  id: string; // postId:userId
  postId: string;
  userId: string;
}
export interface CommentRow {
  id: string;
  postId: string;
  userId: string;
  texto: string;
  criadoEm: string;
}
export interface VoteRow {
  id: string; // postId:userId
  postId: string;
  userId: string;
  option: number;
}
export interface StoryRow {
  id: string;
  userId: string;
  oficial: boolean;
  media: MediaRef;
  filtro: string;
  textos: Array<{ id: string; texto: string; x: number; y: number; cor: string; tamanho: number }>;
  criadoEm: string;
}
export interface AlertRow {
  id: string;
  tipo: "fechamento" | "lesao" | "desfalque" | "geral";
  titulo: string;
  mensagem: string;
  userId: string;
  criadoEm: string;
}
export interface OverrideRow {
  id: string; // temporada:rodada:atletaId
  temporada: number;
  rodada: number;
  atletaId: number;
  status: "titular" | "reserva" | "duvida" | "fora";
  userId: string;
  atualizadoEm: string;
}
export interface LineupRow {
  id: string;
  userId: string;
  nome: string;
  rodada: number;
  temporada: number;
  formation: string;
  profile: string;
  titulares: number[];
  captainId: number;
  reservas: Array<{ atletaId: number; posicaoId: number; luxo?: boolean }>;
  custo: number;
  xP: number;
  criadoEm: string;
}

export const db = {
  users: new Collection<UserRow>("users", "users"),
  sessions: new Collection<SessionRow>("sessions"),
  posts: new Collection<PostRow>("posts", "community"),
  likes: new Collection<LikeRow>("likes", "community"),
  comments: new Collection<CommentRow>("comments", "community"),
  votes: new Collection<VoteRow>("votes", "community"),
  stories: new Collection<StoryRow>("stories", "community"),
  alerts: new Collection<AlertRow>("alerts", "alerts"),
  overrides: new Collection<OverrideRow>("overrides", "overrides"),
  lineups: new Collection<LineupRow>("lineups"),
};

export function newId(): string {
  return crypto.randomUUID();
}
