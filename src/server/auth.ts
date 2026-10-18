/**
 * Contas e sessões (somente servidor).
 * - Senha com scrypt + sal por usuário; comparação em tempo constante.
 * - Sessão: token aleatório em cookie HttpOnly; no banco só guardamos o SHA-256.
 * - Administrador: e-mails em ADMIN_EMAILS (vírgula). Sem ADMIN_EMAILS, a
 *   primeira conta criada vira administradora (bootstrap).
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { db, newId, type AvatarKey, type UserRow } from "./db";

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

export function createUser(email: string, password: string, nome: string): UserRow {
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
  const e = email.trim().toLowerCase();
  const u = db.users.find((x) => x.email === e);
  // mesmo custo com ou sem usuário, para não revelar quais e-mails existem
  const expected = Buffer.from(u ? u.hash : "0".repeat(128), "hex");
  const got = Buffer.from(hashPassword(password, u ? u.salt : "x"), "hex");
  if (!u || !timingSafeEqual(expected, got)) throw new Error("E-mail ou senha incorretos.");
  return u;
}

export function startSession(user: UserRow) {
  const token = randomBytes(32).toString("base64url");
  const expira = new Date(Date.now() + SESSION_DAYS * 86400_000);
  db.sessions.put({ id: sha(token), userId: user.id, expiraEm: expira.toISOString() });
  setCookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expira,
  });
}

export function endSession() {
  const token = getCookie(COOKIE);
  if (token) db.sessions.remove(sha(token));
  deleteCookie(COOKIE, { path: "/" });
}

/** Usuário da requisição atual (ou null). */
export function currentUser(): UserRow | null {
  const token = getCookie(COOKIE);
  if (!token) return null;
  const s = db.sessions.get(sha(token));
  if (!s) return null;
  if (new Date(s.expiraEm).getTime() < Date.now()) {
    db.sessions.remove(s.id);
    return null;
  }
  return db.users.get(s.userId) ?? null;
}

/** Variante para rotas de API que recebem o Request diretamente. */
export function userFromRequest(request: Request): UserRow | null {
  const cookie = request.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const s = db.sessions.get(sha(decodeURIComponent(m[1])));
  if (!s || new Date(s.expiraEm).getTime() < Date.now()) return null;
  return db.users.get(s.userId) ?? null;
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
  db.sessions.removeWhere((s) => s.userId === u.id);
}
