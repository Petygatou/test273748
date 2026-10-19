/**
 * Contas e sessões (somente servidor).
 * - Senha com scrypt + sal por usuário; comparação em tempo constante.
 * - Sessão: token aleatório em cookie HttpOnly; no banco só guardamos o SHA-256.
 * - Administrador: e-mails em ADMIN_EMAILS (vírgula). Sem ADMIN_EMAILS, a
 *   primeira conta criada vira administradora (bootstrap).
 */
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deleteCookie, getCookie, getRequestHeader, setCookie } from "@tanstack/react-start/server";
import { dataDir, db, newId, type AvatarKey, type UserRow } from "./db";

const COOKIE = "cfc_session";
const SESSION_DAYS = 30;
const AVATARS: AvatarKey[] = ["aguia", "leao", "astronauta", "gladiador", "robo", "capitao", "lobo", "estrategista"];

export interface PublicUser {
  id: string;
  email: string;
  nome: string;
  bio: string;
  avatar: AvatarKey;
  admin: boolean;
}

export function toPublic(u: UserRow): PublicUser {
  return { id: u.id, email: u.email, nome: u.nome, bio: u.bio, avatar: u.avatar, admin: isAdmin(u) };
}

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(u: UserRow): boolean {
  const list = adminEmails();
  return list.length ? list.includes(u.email) : u.admin;
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("hex");
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export function validateCredentials(email: string, password: string) {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 120) throw new Error("E-mail inválido.");
  if (password.length < 8 || password.length > 200) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
  return e;
}

let adminApplied = "";
export interface AdminStatus {
  emailDefinido: boolean;
  senhaDefinida: boolean;
  /** vazio quando está tudo certo */
  problema: string;
}

/** Diagnóstico sem revelar segredos (aparece em /api/saude). */
export function adminStatus(): AdminStatus {
  const email = adminEmails()[0];
  const pw = process.env.ADMIN_PASSWORD;
  let problema = "";
  if (!email) problema = "ADMIN_EMAILS não está definida: sem ela, a primeira conta criada vira admin.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problema = "O e-mail em ADMIN_EMAILS não parece válido.";
  else if (!pw) problema = "ADMIN_PASSWORD não está definida: crie a conta pelo site ou defina a variável.";
  else if (pw.length < 8) problema = "ADMIN_PASSWORD tem menos de 8 caracteres: o site recusa.";
  return { emailDefinido: Boolean(email), senhaDefinida: Boolean(pw), problema };
}

/**
 * Conta de administrador definida por variáveis de ambiente: o primeiro e-mail
 * de ADMIN_EMAILS com a senha de ADMIN_PASSWORD. O identificador da conta é
 * derivado do e-mail (igual em todas as instâncias), então o login continua
 * valendo mesmo se o disco for apagado. Nunca lança erro: se a configuração
 * estiver errada, o diagnóstico em /api/saude diz o quê.
 */
export function ensureAdminAccount() {
  const email = adminEmails()[0];
  const pw = process.env.ADMIN_PASSWORD;
  if (!email || !pw || adminStatus().problema) return;
  const mark = sha(`${email}:${pw}`);
  const existing = db.users.find((u) => u.email === email);
  if (adminApplied === mark && existing) return;
  try {
    const salt = randomBytes(16).toString("hex");
    if (existing) db.users.put({ ...existing, salt, hash: hashPassword(pw, salt), admin: true });
    else
      db.users.put({
        id: sha(`admin:${email}`).slice(0, 32),
        email,
        nome: email.split("@")[0].slice(0, 40),
        bio: "",
        avatar: "estrategista",
        salt,
        hash: hashPassword(pw, salt),
        admin: true,
        criadoEm: new Date().toISOString(),
      });
    adminApplied = mark;
  } catch {
    /* não deixa o login quebrar por causa do bootstrap */
  }
}

export function createUser(email: string, password: string, nome: string): UserRow {
  ensureAdminAccount();
  const e = validateCredentials(email, password);
  if (db.users.find((u) => u.email === e)) throw new Error("Já existe uma conta com esse e-mail.");
  const salt = randomBytes(16).toString("hex");
  const first = db.users.all().length === 0;
  return db.users.put({
    id: newId(),
    email: e,
    nome: (nome.trim() || e.split("@")[0]).slice(0, 40),
    bio: "",
    avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
    salt,
    hash: hashPassword(password, salt),
    admin: first,
    criadoEm: new Date().toISOString(),
  });
}

export function verifyUser(email: string, password: string): UserRow {
  ensureAdminAccount();
  const e = email.trim().toLowerCase();
  const u = db.users.find((x) => x.email === e);
  // mesmo custo com ou sem usuário, para não revelar quais e-mails existem
  const expected = Buffer.from(u ? u.hash : "0".repeat(128), "hex");
  const got = Buffer.from(hashPassword(password, u ? u.salt : "x"), "hex");
  if (!u || !timingSafeEqual(expected, got)) throw new Error("E-mail ou senha incorretos.");
  if (u.bloqueado && !isEnvAdmin(u)) throw new Error("Esta conta foi bloqueada pelo administrador.");
  return u;
}

/* ------------------------------------------------------------------------- */
/*  Sessão assinada no cookie (sem estado no servidor)                       */
/*  Funciona em qualquer hospedagem, inclusive com várias instâncias e disco  */
/*  temporário (Vercel): o servidor só precisa conhecer o segredo.           */
/* ------------------------------------------------------------------------- */

let fileSecret: string | null = null;
function sessionSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  // sem SESSION_SECRET, o segredo deriva da senha do admin: igual em todas as instâncias
  if (process.env.ADMIN_PASSWORD) return sha(`tropa-session:${process.env.ADMIN_PASSWORD}`);
  if (fileSecret) return fileSecret;
  const f = join(dataDir(), "session-secret");
  try {
    fileSecret = readFileSync(f, "utf8").trim();
  } catch {
    fileSecret = randomBytes(32).toString("hex");
    try {
      mkdirSync(dataDir(), { recursive: true });
      writeFileSync(f, fileSecret, { mode: 0o600 });
    } catch {
      /* disco somente leitura: o segredo vale só até reiniciar */
    }
  }
  return fileSecret;
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (payload: string) => createHmac("sha256", sessionSecret()).update(payload).digest("base64url");

export function makeSessionToken(user: Pick<UserRow, "id" | "email">, now = Date.now()): string {
  const payload = b64(JSON.stringify({ u: user.id, e: user.email, x: now + SESSION_DAYS * 86400_000 }));
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined | null, now = Date.now()): { u: string; e: string } | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const good = Buffer.from(sign(payload));
  const got = Buffer.from(sig);
  if (good.length !== got.length || !timingSafeEqual(good, got)) return null;
  try {
    const j = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { u?: string; e?: string; x?: number };
    if (!j.u || !j.e || !j.x || j.x < now) return null;
    return { u: j.u, e: j.e };
  } catch {
    return null;
  }
}

/** Admin definido por variável de ambiente: não pode ser bloqueado nem excluído pelo painel. */
export function isEnvAdmin(u: Pick<UserRow, "email">) {
  return adminEmails().includes(u.email);
}

/** Resumo curto do aparelho a partir do User-Agent (sem guardar o texto inteiro). */
export function deviceFromUA(ua: string | undefined | null): string {
  if (!ua) return "desconhecido";
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "outro";
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "navegador";
  return `${os} · ${br}`;
}

function touch(u: UserRow) {
  const now = Date.now();
  if (!u.ultimoAcesso || now - new Date(u.ultimoAcesso).getTime() > 60_000) db.users.update(u.id, { ultimoAcesso: new Date(now).toISOString() }, true);
}

function userFromToken(token: string | undefined | null): UserRow | null {
  const t = readSessionToken(token);
  if (!t) return null;
  ensureAdminAccount();
  const u = db.users.get(t.u) ?? db.users.find((x) => x.email === t.e) ?? null;
  if (!u) return null;
  if (u.bloqueado && !isEnvAdmin(u)) return null;
  touch(u);
  return u;
}

export function startSession(user: UserRow) {
  const expira = new Date(Date.now() + SESSION_DAYS * 86400_000);
  let ua: string | undefined;
  try {
    ua = getRequestHeader("user-agent");
  } catch {
    /* fora de uma requisição (testes) */
  }
  const agora = new Date().toISOString();
  db.users.update(user.id, { logins: (user.logins ?? 0) + 1, ultimoLogin: agora, ultimoAcesso: agora, dispositivo: deviceFromUA(ua) }, true);
  setCookie(COOKIE, makeSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expira,
  });
}

export function endSession() {
  deleteCookie(COOKIE, { path: "/" });
}

/** Usuário da requisição atual (ou null). */
export function currentUser(): UserRow | null {
  return userFromToken(getCookie(COOKIE));
}

/** Variante para rotas de API que recebem o Request diretamente. */
export function userFromRequest(request: Request): UserRow | null {
  const cookie = request.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? userFromToken(decodeURIComponent(m[1])) : null;
}

export function requireUser(): UserRow {
  const u = currentUser();
  if (!u) throw new Error("Entre na sua conta para continuar.");
  return u;
}

export function requireAdmin(): UserRow {
  const u = requireUser();
  if (!isAdmin(u)) throw new Error("Acesso restrito ao administrador.");
  return u;
}

export function updateProfile(u: UserRow, p: { nome?: string; bio?: string; avatar?: string }) {
  return db.users.update(u.id, {
    nome: p.nome != null ? p.nome.trim().slice(0, 40) || u.nome : u.nome,
    bio: p.bio != null ? p.bio.slice(0, 160) : u.bio,
    avatar: p.avatar && (AVATARS as string[]).includes(p.avatar) ? (p.avatar as AvatarKey) : u.avatar,
  })!;
}

export function changePassword(u: UserRow, atual: string, nova: string) {
  verifyUser(u.email, atual);
  validateCredentials(u.email, nova);
  const salt = randomBytes(16).toString("hex");
  db.users.update(u.id, { salt, hash: hashPassword(nova, salt) });
}
