/**
 * O que o navegador informa sobre o aparelho, enviado junto com o login para o Painel ADM
 * distinguir os aparelhos de cada conta. Chrome/Edge no Android contam o modelo
 * (ex.: SM-S918B); Safari/iPhone não contam — aí fica só "iPhone".
 */
export interface InfoAparelho {
  modelo?: string;
  plataforma?: string;
  versao?: string;
  mobile?: boolean;
  tela?: string;
}

interface UAData {
  mobile?: boolean;
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string; platformVersion?: string }>;
}

export async function infoDoAparelho(): Promise<InfoAparelho> {
  if (typeof navigator === "undefined") return {};
  const info: InfoAparelho = {};
  try {
    info.tela = `${Math.round(screen.width)}x${Math.round(screen.height)}`;
  } catch {
    /* sem tela */
  }
  const uad = (navigator as Navigator & { userAgentData?: UAData }).userAgentData;
  if (uad) {
    info.mobile = uad.mobile;
    info.plataforma = uad.platform;
    try {
      // não segura o login se o navegador demorar para responder
      const v = await Promise.race([uad.getHighEntropyValues?.(["model", "platformVersion"]), new Promise<undefined>((r) => setTimeout(() => r(undefined), 400))]);
      if (v?.model) info.modelo = v.model;
      if (v?.platformVersion) info.versao = v.platformVersion;
    } catch {
      /* navegador recusou */
    }
  }
  return info;
}
