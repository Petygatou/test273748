/**
 * Cores dos uniformes por id de clube do Cartola (uso nos rostos ilustrados e
 * nos escudos sintéticos). Clubes fora da lista recebem cores estáveis pelo id.
 */
export interface Kit {
  primary: string;
  secondary: string;
  /** listras verticais na camisa */
  stripes?: boolean;
}

const KITS: Record<number, Kit> = {
  262: { primary: "#c4122e", secondary: "#141414", stripes: true }, // Flamengo
  263: { primary: "#151515", secondary: "#f4f4f4", stripes: true }, // Botafogo
  264: { primary: "#f4f4f4", secondary: "#151515" }, // Corinthians
  265: { primary: "#f4f4f4", secondary: "#1a4ea1" }, // Bahia
  266: { primary: "#8b1538", secondary: "#00613c", stripes: true }, // Fluminense
  267: { primary: "#f4f4f4", secondary: "#151515" }, // Vasco
  275: { primary: "#006437", secondary: "#f4f4f4" }, // Palmeiras
  276: { primary: "#f4f4f4", secondary: "#e2001a" }, // São Paulo
  277: { primary: "#f4f4f4", secondary: "#151515" }, // Santos
  280: { primary: "#f4f4f4", secondary: "#d6001c" }, // Bragantino
  282: { primary: "#151515", secondary: "#f4f4f4", stripes: true }, // Atlético-MG
  283: { primary: "#1f3f99", secondary: "#f4f4f4" }, // Cruzeiro
  284: { primary: "#0d80bf", secondary: "#151515", stripes: true }, // Grêmio
  285: { primary: "#e30613", secondary: "#f4f4f4" }, // Internacional
  286: { primary: "#00703c", secondary: "#f4f4f4" }, // Juventude
  287: { primary: "#e30613", secondary: "#151515", stripes: true }, // Vitória
  288: { primary: "#f6c800", secondary: "#151515" }, // Criciúma
  290: { primary: "#006b3f", secondary: "#f4f4f4" }, // Goiás
  292: { primary: "#e30613", secondary: "#151515", stripes: true }, // Sport
  293: { primary: "#c8102e", secondary: "#151515", stripes: true }, // Athletico-PR
  294: { primary: "#00544e", secondary: "#f4f4f4" }, // Coritiba
  315: { primary: "#00843d", secondary: "#f4f4f4" }, // Chapecoense
  327: { primary: "#151515", secondary: "#f4f4f4", stripes: true }, // Ceará
  354: { primary: "#151515", secondary: "#f4f4f4", stripes: true }, // Ceará
  356: { primary: "#0a3d91", secondary: "#e30613", stripes: true }, // Fortaleza
  364: { primary: "#0b1f4d", secondary: "#f4f4f4" }, // Remo
  373: { primary: "#c8102e", secondary: "#151515", stripes: true }, // Atlético-GO
  1371: { primary: "#006b3f", secondary: "#f6c800" }, // Cuiabá
  2305: { primary: "#f6d000", secondary: "#00843d" }, // Mirassol
};

export function kitFor(clubeId?: number | null): Kit {
  if (clubeId != null && KITS[clubeId]) return KITS[clubeId];
  const h = ((clubeId ?? 0) * 137) % 360;
  return { primary: `hsl(${h} 60% 40%)`, secondary: `hsl(${(h + 180) % 360} 30% 92%)` };
}
