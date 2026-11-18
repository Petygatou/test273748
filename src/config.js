// Tudo o que é da marca e muda de cliente para cliente: nome, textos curtos, o cardápio dos painéis e os cartões do
// mural. O vite.config.js usa este arquivo para montar o HTML dos painéis (src/marca/paineis.js) e o site usa o mesmo
// arquivo para trocar a cena quando alguém escolhe outro item.

// O que está aqui aparece no site por marcas %marca:campo% nos HTML de src/sections/ (o vite.config.js troca cada uma
// pelo valor) e na marca-d'água dos painéis. As frases que levam o nome ("Meu Capiá,", "Conheça o Capiá") ficam
// escritas à mão nas seções.
export const MARCA = {
  nome: 'Capiá',
  // o nome por extenso, a cidade e o horário aparecem na linha miúda do rodapé; o @, no título do mural
  razao: 'Capiá Burger',
  cidade: 'Curitiba, PR',
  horario: 'ter a dom · 18h às 23h',
  instagram: '@capia.burger',
  // para onde vai o "Pedir": o WhatsApp ou o cardápio de entrega da casa. Trocar pelo link de verdade.
  pedido: '#contato',
};

// As peças soltas que flutuam em volta do produto. Cada arquivo fica em public/img/pecas/<nome>.webp.
// Um item do cardápio escolhe sete delas, uma por vaga da cena (ver VAGAS em src/marca/paineis.js): as vagas 2 e 7
// são as desfocadas, lá no fundo.
export const CARDAPIO = [
  {
    id: 'lanches',
    titulo: 'Lanches',
    cor: 'cheddar',
    itens: [
      {
        id: 'classico',
        nome: 'Clássico da Casa',
        linha: 'smash duplo',
        ingredientes: ['pão brioche', '2 smash de 80 g', 'cheddar', 'picles', 'cebola', 'molho da casa'],
        selos: ['160 g de carne', 'o mais pedido'],
        pecas: ['cheddar', 'picles', 'pao', 'picles', 'carne', 'cebola-roxa', 'cheddar'],
      },
      {
        id: 'bacon',
        nome: 'Piá Bacon',
        linha: 'bacon crocante',
        ingredientes: ['pão brioche', 'blend de 150 g', 'cheddar', 'bacon', 'cebola caramelizada', 'maionese defumada'],
        selos: ['150 g de carne', 'defumado'],
        pecas: ['bacon', 'cheddar', 'pao', 'cebola-roxa', 'carne', 'cheddar', 'bacon'],
      },
      {
        id: 'pinhao',
        nome: 'Pinhão da Serra',
        linha: 'queijo colonial',
        ingredientes: ['pão brioche', 'blend de 150 g', 'queijo colonial', 'farofa de pinhão', 'rúcula', 'maionese de alho assado'],
        selos: ['receita da casa', 'só em Curitiba'],
        pecas: ['pinhao', 'rucula', 'pao', 'pinhao', 'rucula', 'carne', 'pinhao'],
      },
      {
        id: 'bravo',
        nome: 'Capiá Bravo',
        linha: 'com jalapeño',
        ingredientes: ['pão brioche', 'blend de 150 g', 'queijo prato', 'jalapeño', 'cebola roxa', 'molho bravo'],
        selos: ['picante', '150 g de carne'],
        pecas: ['jalapeno', 'cebola-roxa', 'pao', 'jalapeno', 'cebola-roxa', 'carne', 'jalapeno'],
      },
      {
        id: 'guria',
        nome: 'Guria Verde',
        linha: 'sem carne',
        ingredientes: ['pão brioche', 'burger de grão-de-bico e cogumelo', 'alface', 'tomate', 'picles', 'maionese verde'],
        selos: ['sem carne', 'feito na casa'],
        pecas: ['alface', 'tomate', 'cogumelo', 'picles', 'tomate', 'cogumelo', 'alface'],
      },
      {
        id: 'frango',
        nome: 'Frango Crocante',
        linha: 'bem crocante',
        ingredientes: ['pão brioche', 'sobrecoxa crocante', 'salada de repolho', 'picles', 'maionese de limão'],
        selos: ['sobrecoxa empanada', '180 g de frango'],
        pecas: ['alface', 'picles', 'pao', 'picles', 'limao', 'cebola-roxa', 'limao'],
      },
    ],
  },
  {
    id: 'acompanhamentos',
    titulo: 'Acompanhamentos',
    cor: 'tomate',
    itens: [
      {
        id: 'fritas',
        nome: 'Fritas da Casa',
        linha: 'corte rústico',
        ingredientes: ['batata com casca', 'sal de ervas', 'alecrim', 'molho rosé'],
        selos: ['porção de 300 g', 'pra dividir'],
        pecas: ['batata', 'alecrim', 'molho-rose', 'batata', 'maionese-verde', 'alecrim', 'batata'],
      },
      {
        id: 'aneis',
        nome: 'Anéis de Cebola',
        linha: 'empanados na hora',
        ingredientes: ['cebola', 'massa crocante', 'páprica', 'maionese verde'],
        selos: ['8 unidades', 'bem crocante'],
        pecas: ['anel', 'limao', 'maionese-verde', 'anel', 'molho-rose', 'limao', 'anel'],
      },
      {
        id: 'polenta',
        nome: 'Polenta Frita',
        linha: 'crocante por fora',
        ingredientes: ['polenta', 'parmesão', 'alecrim', 'molho rosé'],
        selos: ['6 unidades', 'cremosa por dentro'],
        pecas: ['alecrim', 'limao', 'molho-rose', 'alecrim', 'maionese-verde', 'limao', 'alecrim'],
      },
      {
        id: 'bolinho',
        nome: 'Bolinho de Queijo',
        linha: 'queijo colonial',
        ingredientes: ['queijo colonial', 'massa de batata', 'salsinha', 'maionese verde'],
        selos: ['5 unidades', 'puxa o queijo'],
        pecas: ['maionese-verde', 'alecrim', 'limao', 'alecrim', 'molho-rose', 'limao', 'alecrim'],
      },
    ],
  },
  {
    id: 'bebidas',
    titulo: 'Bebidas',
    cor: 'mate',
    itens: [
      {
        id: 'shake-morango',
        nome: 'Shake de Morango',
        linha: 'sorvete da casa',
        ingredientes: ['sorvete de creme', 'morango fresco', 'chantili'],
        selos: ['400 ml', 'batido na hora'],
        pecas: ['morango', 'morango-meio', 'morango-meio', 'morango', 'morango', 'morango-meio', 'morango'],
      },
      {
        id: 'shake-chocolate',
        nome: 'Shake de Chocolate',
        linha: 'meio amargo',
        ingredientes: ['sorvete de creme', 'chocolate meio amargo', 'chantili'],
        selos: ['400 ml', 'batido na hora'],
        pecas: ['chocolate', 'chocolate-gotas', 'chocolate', 'chocolate-gotas', 'chocolate', 'chocolate-gotas', 'chocolate'],
      },
      {
        id: 'mate',
        nome: 'Mate com Limão',
        linha: 'gelado, feito aqui',
        ingredientes: ['erva-mate tostada', 'limão', 'gelo'],
        selos: ['500 ml', 'sem açúcar, se quiser'],
        pecas: ['limao-rodela', 'hortela', 'limao-rodela', 'hortela', 'limao-rodela', 'hortela', 'limao-rodela'],
      },
      {
        id: 'soda',
        nome: 'Soda de Framboesa',
        linha: 'com hortelã',
        ingredientes: ['framboesa', 'limão', 'água com gás', 'hortelã'],
        selos: ['500 ml', 'bem gelada'],
        pecas: ['framboesa', 'hortela', 'limao-rodela', 'framboesa', 'hortela', 'framboesa', 'framboesa'],
      },
    ],
  },
  {
    id: 'sobremesas',
    titulo: 'Sobremesas',
    cor: 'carvao',
    itens: [
      {
        id: 'brownie',
        nome: 'Brownie com Sorvete',
        linha: 'quente e gelado',
        ingredientes: ['brownie', 'sorvete de creme', 'calda de chocolate'],
        selos: ['sai quentinho', 'pra dividir'],
        pecas: ['sorvete', 'chocolate-gotas', 'nozes', 'brownie-peca', 'chocolate-gotas', 'nozes', 'chocolate-gotas'],
      },
      {
        id: 'cookie',
        nome: 'Cookie Recheado',
        linha: 'chocolate derretido',
        ingredientes: ['massa amanteigada', 'gotas de chocolate', 'recheio de chocolate'],
        selos: ['assado no dia', 'recheio que escorre'],
        pecas: ['chocolate-gotas', 'nozes', 'sorvete', 'nozes', 'chocolate-gotas', 'nozes', 'chocolate-gotas'],
      },
      {
        id: 'pudim',
        nome: 'Pudim de Leite',
        linha: 'receita de vó',
        ingredientes: ['leite', 'ovos', 'caramelo'],
        selos: ['sem furinho', 'fatia generosa'],
        pecas: ['doce-de-leite', 'nozes', 'banana', 'nozes', 'doce-de-leite', 'banana', 'nozes'],
      },
      {
        id: 'banoffee',
        nome: 'Banoffee no Pote',
        linha: 'com doce de leite',
        ingredientes: ['banana', 'doce de leite', 'chantili', 'farofa de biscoito'],
        selos: ['no pote', 'pra levar'],
        pecas: ['banana', 'doce-de-leite', 'banana', 'nozes', 'doce-de-leite', 'banana', 'banana'],
      },
    ],
  },
];

// Palavras da faixa que corre com a rolagem (duas linhas).
export const FAIXA = [
  ['Suculento', 'Tostado', 'Na chapa', 'Derretido', 'Crocante', 'Defumado', 'Sem pressa'],
  ['Caseiro', 'Fresco', 'Dourado', 'Cremoso', 'Picante', 'Na calma', 'Quentinho'],
];

// Cartões do mural: arquivos em public/img/mural/<n>.webp, montados no cartoes.html que acompanha o projeto (o guia
// diz onde). A mesma lista serve ao rastro do mouse e à pilha do celular.
export const MURAL = ['01', '02', '03', '04', '05', '06'];
export const cartao = (n) => `./img/mural/${n}.webp`;

export const produto = (id) => `./img/produtos/${id}.webp`;
export const miniatura = (id) => `./img/produtos/${id}-p.webp`;
export const peca = (nome) => `./img/pecas/${nome}.webp`;
