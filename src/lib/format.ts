import { POSITIONS, STATUS_LABELS, type PositionId } from "../engine/rules";

const nf1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export const fmt1 = (x: number | null | undefined) => (x == null || Number.isNaN(x) ? "—" : nf1.format(x));
export const fmt2 = (x: number | null | undefined) => (x == null || Number.isNaN(x) ? "—" : nf2.format(x));
export const fmt0 = (x: number | null | undefined) => (x == null || Number.isNaN(x) ? "—" : nf0.format(x));
export const cs = (x: number | null | undefined) => (x == null ? "—" : `C$ ${nf2.format(x)}`);
export const pct = (x: number | null | undefined, digits = 0) =>
  x == null || Number.isNaN(x) ? "—" : `${(x * 100).toFixed(digits).replace(".", ",")}%`;
export const signed = (x: number, digits = 2) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(digits).replace(".", ",")}`;
export const factorPct = (f: number) => {
  const d = (f - 1) * 100;
  return `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d).toFixed(0)}%`;
};

/** 21/22 = lateral esquerdo/direito (colunas da cedência) */
export const posAbbr = (p: PositionId | number, lado?: "E" | "D") =>
  p === 21 || (p === 2 && lado === "E") ? "LE" : p === 22 || (p === 2 && lado === "D") ? "LD" : (POSITIONS[p as PositionId]?.abbr ?? "?");
export const posName = (p: PositionId | number, lado?: "E" | "D") =>
  p === 21 || (p === 2 && lado === "E") ? "Lateral esquerdo" : p === 22 || (p === 2 && lado === "D") ? "Lateral direito" : (POSITIONS[p as PositionId]?.name ?? "?");
export const statusLabel = (s: number) => STATUS_LABELS[s] ?? "—";

export function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.round(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const days = Math.round(h / 24);
  return `há ${days} d`;
}

export function dateTime(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

export function countdown(iso?: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}
