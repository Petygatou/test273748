import { BarChart3, ClipboardList, Compass, House, Radio, Shirt, Swords, type LucideIcon } from "lucide-react";

/** Um passo do tour: abre a página `to` e destaca o elemento marcado com data-tour={alvo}. */
export type TourStep = {
  id: string;
  capitulo: CapituloId;
  to: string;
  search?: Record<string, string>;
  /** valor do atributo data-tour; sem alvo (ou alvo ausente) o cartão aparece no centro */
  alvo?: string;
  titulo: string;
  texto: string;
  /** sugestão do que fazer agora, para aprender mexendo */
  experimente?: string;
};

export type CapituloId = "navegar" | "inicio" | "escalar" | "provaveis" | "estatisticas" | "aovivo" | "meutime";

/** As ferramentas do site, na ordem do tour e da página /guia. */
export const CAPITULOS: Array<{ id: CapituloId; nome: string; resumo: string; to: string; search?: Record<string, string>; Icon: LucideIcon; passos: string[] }> = [
  {
    id: "navegar",
    nome: "Navegar e buscar",
    resumo: "Todas as seções à vista e uma busca que acha qualquer atleta, clube ou página.",
    to: "/",
    Icon: Compass,
    passos: ["Use o menu do topo (no celular, a faixa e a barra de baixo).", "Aperte / ou Ctrl+K em qualquer página para buscar.", "O botão ? reabre este guia quando quiser."],
  },
  {
    id: "inicio",
    nome: "Início",
    resumo: "O resumo da rodada: capitão sugerido, destaques por posição e jogos.",
    to: "/",
    Icon: House,
    passos: ["Digite um nome na busca para abrir a ficha do atleta.", "Veja o capitão da rodada e as alternativas.", "Filtre os destaques por posição."],
  },
  {
    id: "escalar",
    nome: "Escalar",
    resumo: "A melhor tropa possível para o seu estilo e suas cartoletas, já com capitão.",
    to: "/escalacao",
    Icon: Swords,
    passos: ["Escolha o estilo: Mitada, Equilibrada ou Valorização.", "Informe quantas cartoletas você tem.", "Toque num atleta para trocar, fixar, banir ou fazer capitão."],
  },
  {
    id: "provaveis",
    nome: "Prováveis",
    resumo: "Os 11 mais prováveis de cada time, atualizados sozinhos a cada notícia.",
    to: "/provaveis",
    Icon: ClipboardList,
    passos: ["Toque num jogo para ir direto a ele.", "Verde é provável, amarelo é dúvida.", "Durante a partida, as parciais aparecem no lugar da porcentagem."],
  },
  {
    id: "estatisticas",
    nome: "Estatísticas e Duelo X1",
    resumo: "Mercado completo, comparação lado a lado, confrontos e o que cada time cede.",
    to: "/estatisticas",
    Icon: BarChart3,
    passos: ["Mercado: ordene e filtre todos os atletas.", "Duelo X1: compare dois atletas em dúvida.", "Cedência: veja quem entrega pontos para cada posição."],
  },
  {
    id: "aovivo",
    nome: "Ao Vivo",
    resumo: "Parciais e placares enquanto a bola rola, sem atualizar a página.",
    to: "/ao-vivo",
    Icon: Radio,
    passos: ["Acompanhe os pontos de cada atleta em tempo real.", "Veja o placar de todos os jogos da rodada."],
  },
  {
    id: "meutime",
    nome: "Meu Time",
    resumo: "Seu time do Cartola comparado com a tropa ideal para o seu patrimônio.",
    to: "/meu-time",
    Icon: Shirt,
    passos: ["Conecte sua conta do Cartola.", "Compare seu time com a sugestão do Tropa.", "Veja quanto você pode ganhar trocando."],
  },
];

export const PASSOS: TourStep[] = [
  {
    id: "nav",
    capitulo: "navegar",
    to: "/",
    alvo: "nav",
    titulo: "Tudo à vista",
    texto: "Cada ferramenta do Tropa tem seu lugar aqui. Nada fica escondido em menus.",
  },
  {
    id: "busca-home",
    capitulo: "inicio",
    to: "/",
    alvo: "busca-home",
    titulo: "Ache qualquer atleta",
    texto: "Digite nome, clube ou posição e abra a ficha: chance de jogar, pontos previstos e histórico.",
    experimente: "Digite as primeiras letras de um jogador.",
  },
  {
    id: "capitao",
    capitulo: "inicio",
    to: "/",
    alvo: "capitao",
    titulo: "Capitão da rodada",
    texto: "Quem tem mais chance de pontuar alto. O capitão vale 1,5× os pontos, então escolher bem faz diferença.",
  },
  {
    id: "atalhos",
    capitulo: "inicio",
    to: "/",
    alvo: "atalhos",
    titulo: "Atalhos rápidos",
    texto: "Os caminhos mais usados, a um toque: escalar, prováveis, duelo e ao vivo.",
  },
  {
    id: "destaques",
    capitulo: "inicio",
    to: "/",
    alvo: "destaques",
    titulo: "Destaques por posição",
    texto: "Os que devem pontuar mais. Use as abas para filtrar e toque no cartão para ver detalhes.",
  },
  {
    id: "escalar-estilo",
    capitulo: "escalar",
    to: "/escalacao",
    alvo: "escalar-estilo",
    titulo: "Seu estilo e suas cartoletas",
    texto: "Mitada arrisca mais, Equilibrada é a mais segura e Valorização busca ganhar cartoletas. A tropa é recalculada na hora.",
    experimente: "Troque o estilo e veja a tropa mudar.",
  },
  {
    id: "escalar-campo",
    capitulo: "escalar",
    to: "/escalacao",
    alvo: "escalar-campo",
    titulo: "Sua tropa pronta",
    texto: "A melhor escalação possível para o seu orçamento, já com o capitão (a coroa).",
    experimente: "Toque em um atleta para trocar, fixar ou banir.",
  },
  {
    id: "escalar-travas",
    capitulo: "escalar",
    to: "/escalacao",
    alvo: "escalar-travas",
    titulo: "Fixe ou bana",
    texto: "Quer um jogador de qualquer jeito? Fixe. Não confia? Bana. O Tropa monta o resto em volta.",
  },
  {
    id: "provaveis-jogos",
    capitulo: "provaveis",
    to: "/provaveis",
    alvo: "provaveis-jogos",
    titulo: "Escolha o jogo",
    texto: "Toque num confronto para pular direto para ele.",
  },
  {
    id: "provaveis-campo",
    capitulo: "provaveis",
    to: "/provaveis",
    alvo: "provaveis-campo",
    titulo: "Os 11 de cada time",
    texto: "Verde é provável e amarelo é dúvida. A lista se atualiza sozinha quando sai notícia ou escalação oficial.",
  },
  {
    id: "stats-abas",
    capitulo: "estatisticas",
    to: "/estatisticas",
    alvo: "stats-abas",
    titulo: "Tudo em abas",
    texto: "Mercado completo, Duelo X1 para tirar dúvidas entre dois atletas, Confrontos, Cedência e Força dos times.",
    experimente: "Abra a aba Duelo X1.",
  },
  {
    id: "aovivo",
    capitulo: "aovivo",
    to: "/ao-vivo",
    alvo: "aovivo",
    titulo: "Com a bola rolando",
    texto: "Parciais e placares em tempo real. A página se atualiza sozinha, sem precisar recarregar.",
  },
  {
    id: "meutime",
    capitulo: "meutime",
    to: "/meu-time",
    alvo: "meutime-conectar",
    titulo: "Conecte seu Cartola",
    texto: "Veja seu time de verdade e compare com a tropa que o Tropa montaria com o seu patrimônio.",
  },
  {
    id: "busca-global",
    capitulo: "navegar",
    to: "/",
    alvo: "busca-global",
    titulo: "Busca em qualquer lugar",
    texto: "Aperte / ou Ctrl+K em qualquer página para achar atleta, clube ou ferramenta.",
  },
  {
    id: "ajuda",
    capitulo: "navegar",
    to: "/",
    alvo: "ajuda",
    titulo: "Pronto! 🎉",
    texto: "Você já conhece o Tropa. Se quiser rever alguma coisa, toque neste botão a qualquer hora.",
  },
];

export const TOUR_VISTO = "tropa:tour-visto";

export function tourVisto(): boolean {
  try {
    return localStorage.getItem(TOUR_VISTO) === "1";
  } catch {
    return true; // sem armazenamento (aba anônima, bloqueio): não insiste com o convite
  }
}

export function marcarTourVisto() {
  try {
    localStorage.setItem(TOUR_VISTO, "1");
  } catch {
    /* sem armazenamento: só não lembra */
  }
}
