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
import { pipeline, remoteEnabled, type Cmd } from "./remote";

export function dataDir(): string {
  return process.env.DATA_DIR ?? (process.env.VERCEL ? "/tmp/cfc-data" : join(process.cwd(), "data"));
}

export const events = new EventEmitter();
events.setMaxListeners(1000);

export type Topic = "community" | "alerts" | "overrides" | "users" | "dados";

/** Avisa os navegadores abertos (SSE) que um tópico mudou. */
export const emit = (topic: Topic) => events.emit("change", topic);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry: Collection<any>[] = [];

export class Collection<T extends { id: string }> {
  private rows = new Map<string, T>();
  private loaded = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** mudanças ainda não enviadas ao Redis (null = apagado) */
  dirty = new Map<string, T | null>();
  /** versão do Redis que esta instância já tem em memória (-1 = desconhecida) */
  remoteVer = -1;

  constructor(
    private name: string,
    private topic?: Topic,
  ) {
    registry.push(this);
  }

  get key() {
    return `tropa:db:${this.name}`;
  }
  get verKey() {
    return `tropa:db:${this.name}:v`;
  }

  private mark(id: string, row: T | null) {
    if (remoteEnabled()) this.dirty.set(id, row);
  }

  /** Troca o conteúdo pelo do Redis, mantendo por cima o que esta instância ainda não enviou. */
  replaceFromRemote(flat: string[], ver: number) {
    const rows = new Map<string, T>();
    for (let i = 0; i + 1 < flat.length; i += 2) {
      try {
        rows.set(flat[i], JSON.parse(flat[i + 1]) as T);
      } catch {
        /* linha corrompida: ignora */
      }
    }
    for (const [id, r] of this.dirty) r ? rows.set(id, r) : rows.delete(id);
    this.rows = rows;
    this.loaded = true;
    this.remoteVer = ver;
  }

  /** Primeira vez com Redis vazio: envia o que havia no disco (migração). */
  seedRemoteFromLocal() {
    for (const r of this.all()) this.dirty.set(r.id, r);
  }

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
    this.mark(row.id, row);
    this.persist();
    return row;
  }

  /** `silent`: grava sem avisar os navegadores (ex.: registrar último acesso). */
  update(id: string, patch: Partial<T>, silent = false): T | undefined {
    const cur = this.get(id);
    if (!cur) return undefined;
    const next = { ...cur, ...patch, id };
    this.rows.set(id, next);
    this.mark(id, next);
    this.persist(silent);
    return next;
  }

  remove(id: string): boolean {
    this.load();
    const ok = this.rows.delete(id);
    if (ok) {
      this.mark(id, null);
      this.persist();
    }
    return ok;
  }

  removeWhere(fn: (r: T) => boolean): number {
    let n = 0;
    for (const r of this.all())
      if (fn(r) && this.rows.delete(r.id)) {
        this.mark(r.id, null);
        n++;
      }
    if (n) this.persist();
    return n;
  }

  /** Só para testes. */
  _reset() {
    this.rows.clear();
    this.dirty.clear();
    this.remoteVer = -1;
    this.loaded = true;
  }
}

/**
 * Início de cada requisição: traz do Redis as coleções que outra instância mudou
 * (uma leitura das versões; só baixa o conteúdo do que mudou). Sem Redis, não faz nada.
 */
export async function syncRemote(): Promise<void> {
  if (!remoteEnabled()) return;
  try {
    const [vers] = (await pipeline([["MGET", ...registry.map((c) => c.verKey)]])) as [Array<string | null>];
    const velhas: Array<{ c: (typeof registry)[number]; ver: number }> = [];
    registry.forEach((c, i) => {
      const v = vers[i];
      if (v == null) {
        // coleção nunca gravada no Redis: começa a partir do disco local (se houver algo)
        if (c.remoteVer === -1) {
          c.seedRemoteFromLocal();
          c.remoteVer = 0;
        }
      } else if (Number(v) !== c.remoteVer) velhas.push({ c, ver: Number(v) });
    });
    if (!velhas.length) return;
    const res = await pipeline(velhas.map(({ c }) => ["HGETALL", c.key]));
    velhas.forEach(({ c, ver }, i) => c.replaceFromRemote((res[i] as string[]) ?? [], ver));
  } catch (err) {
    console.error("[db] falha ao sincronizar com o Redis:", err);
  }
}

/** Fim de cada requisição: envia as mudanças desta instância para o Redis. */
export async function flushRemote(): Promise<void> {
  if (!remoteEnabled()) return;
  const sujas = registry.filter((c) => c.dirty.size);
  if (!sujas.length) return;
  const cmds: Cmd[] = [];
  const envios = sujas.map((c) => {
    const lote = new Map(c.dirty);
    c.dirty.clear();
    const grava = [...lote.values()].filter((r): r is NonNullable<typeof r> => r != null);
    const apaga = [...lote].filter(([, r]) => r == null).map(([id]) => id);
    if (grava.length) cmds.push(["HSET", c.key, ...grava.flatMap((r) => [r.id, JSON.stringify(r)])]);
    if (apaga.length) cmds.push(["HDEL", c.key, ...apaga]);
    cmds.push(["INCR", c.verKey]);
    return { c, lote, idx: cmds.length - 1, antes: c.remoteVer };
  });
  try {
    const out = await pipeline(cmds);
    for (const e of envios) {
      const v = Number(out[e.idx]);
      // se outra instância gravou no meio, a próxima sincronização baixa tudo de novo
      e.c.remoteVer = v === e.antes + 1 ? v : -2;
    }
  } catch (err) {
    console.error("[db] falha ao gravar no Redis:", err);
    // devolve para a fila: vai na próxima requisição
    for (const e of envios) for (const [id, r] of e.lote) if (!e.c.dirty.has(id)) e.c.dirty.set(id, r);
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
