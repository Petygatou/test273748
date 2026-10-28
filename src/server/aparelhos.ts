/**
 * Aparelhos de cada conta (somente servidor): em quais celulares/computadores a pessoa
 * entrou, quando e de onde. Serve para o Painel ADM perceber conta compartilhada.
 *
 * Um "aparelho" é um navegador: na primeira vez ele recebe um identificador aleatório
 * num cookie próprio (não é o cookie da sessão). Aba anônima ou cookies apagados
 * contam como aparelho novo — o painel avisa isso.
 */
import { randomBytes } from "node:crypto";
import { db, newId, type AparelhoRow, type LoginRow, type TipoAparelho, type UserRow } from "./db";

export const COOKIE_APARELHO = "tropa_aparelho";
/** com tantos aparelhos diferentes em 30 dias, o aviso vira alerta de compartilhamento */
export const LIMITE_COMPARTILHAMENTO = 3;
const DIA = 86400_000;
const MAX_LOGINS_POR_USUARIO = 80;

export const novoAparelhoId = () => randomBytes(16).toString("hex");
export const aparelhoIdValido = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{32}$/.test(v);

/** O que o próprio navegador informa (opcional): modelo, versão do sistema, tela. */
export interface InfoNavegador {
  modelo?: string;
  plataforma?: string;
  versao?: string;
  mobile?: boolean;
  tela?: string;
}

const limpo = (v: unknown, max = 40) => (typeof v === "string" ? v.replace(/[^\p{L}\p{N} ._()/,+-]/gu, "").trim().slice(0, max) || undefined : undefined);

export function sanitizeInfo(x: unknown): InfoNavegador {
  if (!x || typeof x !== "object") return {};
  const o = x as Record<string, unknown>;
  return {
    modelo: limpo(o.modelo),
    plataforma: limpo(o.plataforma, 20),
    versao: limpo(o.versao, 20),
    mobile: typeof o.mobile === "boolean" ? o.mobile : undefined,
    tela: typeof o.tela === "string" && /^\d{2,5}x\d{2,5}$/.test(o.tela) ? o.tela : undefined,
  };
}

/** Sistema, navegador, tipo e (no Android, quando aparece) o modelo, a partir do User-Agent. */
export function detalharUA(ua: string | undefined | null, info: InfoNavegador = {}) {
  const u = ua ?? "";
  let so = "outro";
  let versao: string | undefined;
  let m: RegExpMatchArray | null;
  if ((m = u.match(/iPhone OS (\d+)[_.](\d+)/)) || /iPhone/.test(u)) {
    so = "iPhone";
    versao = m ? `iOS ${m[1]}.${m[2]}` : undefined;
  } else if (/iPad/.test(u) || (/Macintosh/.test(u) && info.mobile)) {
    so = "iPad";
  } else if ((m = u.match(/Android (\d+(?:\.\d+)?)/))) {
    so = "Android";
    versao = `Android ${m[1]}`;
  } else if (/Windows/.test(u)) so = "Windows";
  else if (/Mac OS X|Macintosh/.test(u)) so = "Mac";
  else if (/CrOS/.test(u)) so = "Chromebook";
  else if (/Linux/.test(u)) so = "Linux";
  if (info.plataforma && info.versao && so === "Android") versao = `Android ${info.versao.split(".")[0]}`;
  if (info.plataforma === "Windows" && info.versao) versao = Number(info.versao.split(".")[0]) >= 13 ? "Windows 11" : "Windows 10";

  const navegador = /Edg\//.test(u)
    ? "Edge"
    : /OPR\/|Opera/.test(u)
      ? "Opera"
      : /SamsungBrowser/.test(u)
        ? "Samsung Internet"
        : /Firefox\/|FxiOS/.test(u)
          ? "Firefox"
          : /CriOS|Chrome\//.test(u)
            ? "Chrome"
            : /Safari\//.test(u)
              ? "Safari"
              : "navegador";

  // modelo: o informado pelo navegador; senão o que o Android ainda mostra no User-Agent
  let modelo = info.modelo;
  if (!modelo && so === "Android") {
    const mm = u.match(/Android [^;)]*;\s*([^;)]+?)(?:\sBuild\/|\)|;)/);
    if (mm && mm[1] && mm[1] !== "K" && !/^wv$/i.test(mm[1])) modelo = mm[1].trim();
  }
  if (so === "iPhone" && !modelo) modelo = "iPhone";

  const tipo: TipoAparelho = so === "iPad" || /Tablet/.test(u) ? "tablet" : so === "iPhone" || /Mobile/.test(u) || info.mobile ? "celular" : "computador";
  // ex.: "SM-S918B · Android 14 · Chrome", "iPhone · iOS 17.5 · Safari", "Windows · Chrome"
  const nomeSO = versao ?? so;
  const primeiro = modelo && (modelo !== so || versao) ? modelo : null;
  const rotulo = [primeiro, nomeSO !== primeiro ? nomeSO : null, navegador].filter(Boolean).join(" · ");
  return { so, versao, navegador, modelo, tipo, rotulo };
}

/** IP sem os últimos números (o suficiente para comparar redes, sem identificar a pessoa). */
export function mascararIp(ip: string | undefined | null): string | undefined {
  if (!ip) return undefined;
  const v4 = ip.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  if (v4) return `${v4[1]}.${v4[2]}.x.x`;
  if (ip.includes(":")) return `${ip.split(":").slice(0, 3).join(":")}:…`;
  return undefined;
}

export interface ContextoLogin {
  aparelhoId: string;
  ua?: string;
  info?: InfoNavegador;
  local?: string;
  ip?: string;
  origem: LoginRow["origem"];
  agora?: number;
}

/** Aparelhos diferentes usados por uma conta nos últimos 30 dias. */
export function aparelhosRecentes(userId: string, agora = Date.now()) {
  return db.aparelhos.filter((a) => a.userId === userId && agora - new Date(a.ultimoAcesso ?? a.ultimoLogin).getTime() < 30 * DIA);
}

/** Registra um login: atualiza o aparelho (ou cria, se for novo) e guarda no histórico. */
export function registrarLogin(user: Pick<UserRow, "id">, c: ContextoLogin): LoginRow {
  const agora = c.agora ?? Date.now();
  const em = new Date(agora).toISOString();
  const d = detalharUA(c.ua, c.info);
  const id = `${user.id}:${c.aparelhoId}`;
  const atual = db.aparelhos.get(id);
  const novo = !atual;
  const ordem = atual?.ordem ?? db.aparelhos.filter((a) => a.userId === user.id).length + 1;
  const locais = c.local ? [c.local, ...(atual?.locais ?? []).filter((l) => l !== c.local)].slice(0, 5) : (atual?.locais ?? []);
  const ap: AparelhoRow = {
    id,
    userId: user.id,
    aparelhoId: c.aparelhoId,
    ordem,
    tipo: d.tipo,
    rotulo: d.rotulo,
    so: d.so,
    navegador: d.navegador,
    modelo: d.modelo ?? atual?.modelo,
    tela: c.info?.tela ?? atual?.tela,
    primeiroLogin: atual?.primeiroLogin ?? em,
    ultimoLogin: em,
    ultimoAcesso: em,
    logins: (atual?.logins ?? 0) + 1,
    locais,
  };
  db.aparelhos.put(ap);
  const login: LoginRow = {
    id: newId(),
    userId: user.id,
    em,
    aparelhoId: c.aparelhoId,
    ordem,
    rotulo: d.rotulo,
    tipo: d.tipo,
    novo,
    aparelhos30d: aparelhosRecentes(user.id, agora).length,
    local: c.local,
    ip: mascararIp(c.ip),
    origem: c.origem,
  };
  db.logins.put(login);
  // histórico enxuto: os logins mais antigos saem (os aparelhos continuam guardados)
  const meus = db.logins.filter((l) => l.userId === user.id).sort((a, b) => b.em.localeCompare(a.em));
  for (const velho of meus.slice(MAX_LOGINS_POR_USUARIO)) db.logins.remove(velho.id);
  return login;
}

/** Marca o último acesso de um aparelho (no máximo 1 vez por minuto, chamado pela sessão). */
export function tocarAparelho(userId: string, aparelhoId: string, agora = Date.now()) {
  const id = `${userId}:${aparelhoId}`;
  const a = db.aparelhos.get(id);
  if (a && (!a.ultimoAcesso || agora - new Date(a.ultimoAcesso).getTime() > 60_000)) db.aparelhos.update(id, { ultimoAcesso: new Date(agora).toISOString() }, true);
}

export interface AparelhoView extends AparelhoRow {
  ativo30d: boolean;
  atual: boolean;
}

export function aparelhosDoUsuario(userId: string, agora = Date.now()): AparelhoView[] {
  const lista = db.aparelhos.filter((a) => a.userId === userId);
  const maisRecente = lista.reduce<AparelhoRow | null>((m, a) => (!m || (a.ultimoAcesso ?? a.ultimoLogin) > (m.ultimoAcesso ?? m.ultimoLogin) ? a : m), null);
  return lista
    .map((a) => ({ ...a, ativo30d: agora - new Date(a.ultimoAcesso ?? a.ultimoLogin).getTime() < 30 * DIA, atual: a.id === maisRecente?.id }))
    .sort((a, b) => (b.ultimoAcesso ?? b.ultimoLogin).localeCompare(a.ultimoAcesso ?? a.ultimoLogin));
}

export function loginsDoUsuario(userId: string, limite = 40) {
  return db.logins
    .filter((l) => l.userId === userId)
    .sort((a, b) => b.em.localeCompare(a.em))
    .slice(0, limite);
}

/** Avisos para o painel: logins em aparelho novo de contas que já tinham outro aparelho. */
export function avisosDeAparelho(agora = Date.now(), dias = 14) {
  const corte = agora - dias * DIA;
  return db.logins
    .filter((l) => l.novo && l.ordem >= 2 && new Date(l.em).getTime() >= corte)
    .sort((a, b) => b.em.localeCompare(a.em))
    .slice(0, 60)
    .map((l) => {
      const u = db.users.get(l.userId);
      return {
        id: l.id,
        em: l.em,
        userId: l.userId,
        nome: u?.nome ?? "(conta excluída)",
        email: u?.email ?? "",
        avatar: u?.avatar ?? "aguia",
        rotulo: l.rotulo,
        tipo: l.tipo,
        local: l.local ?? null,
        ordem: l.ordem,
        aparelhos30d: l.aparelhos30d,
        compartilhamento: l.aparelhos30d >= LIMITE_COMPARTILHAMENTO,
      };
    });
}
