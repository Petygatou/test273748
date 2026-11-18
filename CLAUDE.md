# Guia do projeto — Grau

(Salve como `CLAUDE.md` na raiz do projeto se você usa o Claude Code, ou como `AGENTS.md` se usa o Codex, o Cursor ou outro agente. O conteúdo é o mesmo.)

Landing page da Grau, uma ótica. Vite sem framework, Three.js (WebGL2), GSAP (ScrollTrigger, CustomEase) + Lenis. O impacto vem de uma ideia só, aplicada em todas as cenas: **borrado sem óculos, nítido pela lente**. A camada de leitura (títulos gigantes, nomes, frases, fotos, as fotos dos 7 dias) aparece desfocada; dentro das lentes dos óculos 3D, a mesma imagem aparece nítida, ampliada e com franja de cor. A régua é site de premiação: se uma passagem parece "ok", ainda não está pronta.

## Design system
- Tokens em `src/styles/tokens.css`, nunca cor solta no CSS das seções.
  - Página: `--breu #050505`, `--osso #f1f1ef`, `--cinza #8d8d88`, `--fio`. Sol, 7 dias e fecho: `--papel #f6f3ec`, `--tinta #111110`, `--cinza-q`. Acetato (para a interface e o guia; as cores reais estão no shader): `--tartaruga`, `--mel`, `--verde-garrafa`, `--g15`.
  - A interface usa `--ui` e `--ui-2`, que o diretor troca por marco: clara no breu, tinta no papel. Nada de cor de acento: a cor está no acetato.
- Tipos: **Satoshi** Black 900 (títulos gigantes, tracking −0,045em), Medium 500 (interface), Bold 700 (destaques), Regular 400 (o "20/20" vazado); **Optician Sans** só na acuidade do loader (não tem acentos). Títulos com no máximo duas linhas; o da hero é a exceção ("Tudo / em / foco").
- Grid: `--gutter: clamp(20px, 4.4vw, 64px)`; nav com `--nav-h`. Nada passa pela faixa da nav, a não ser o formulário no fim, que tem um degradê escuro por trás da nav.
- Camadas: canvas do palco (`z 0`) → âncoras da camada de leitura, transparentes (`.placa`, `z 1`) → trilha de rolagem, com o formulário e o rodapé (`z 2`) → interface fixa (`z 3`) → barra de rolagem e loader.

## Como a peça funciona (não quebrar)
- **Placa → desfoque → lente**: a camada de leitura é renderizada nítida num alvo (`src/gl/placa.js`); `src/gl/palco.js` reduz esse alvo em 7 níveis e a composição desfoca por região; o shader da lente (`src/gl/glasses/oculos.js`) lê o alvo nítido. Por isso o texto de dentro e o de fora casam no pixel. Qualquer elemento novo que deva ficar nítido pela lente tem que estar na placa, não no DOM.
- **Âncoras no HTML**: cada texto da placa existe no `index.html` dentro de `.placa` (transparente, para leitor de tela e busca). O CSS decide posição, fonte e tamanho; a placa redesenha palavra por palavra no mesmo lugar. Mudou o texto ou o CSS? A placa acompanha (é medida no carregamento e no resize).
- **Armação por raymarching**: cada modelo é um conjunto de números em `src/gl/glasses/modelos.js` (superelipse por quadrante, largura do aro, ponte, orelha, espessura, curvatura). O worker `frente.worker.js` transforma isso num campo de distância; o shader extruda com bordas arredondadas. O morph entre modelos mistura dois campos: qualquer modelo novo tem que manter o mesmo formato de dados.
- **Cores do acetato**: `CORES` em `src/gl/glasses/oculos.js` (albedo, textura sim/não, tinta da refração, transparência, rugosidade, quanto o mel acende).
- **Roteiro**: o tamanho de cada cena, os marcos e tudo o que segue o scroll estão em `src/motion/roteiro.js`. As cenas (`src/motion/cenas/*.js`) só cuidam dos marcos.

## Regras de motion
- **Scroll dirige só o contínuo** (suavizado no diretor): pose e giro dos óculos, mergulho, luz do sol, tinta da lente, praia, os óculos seguindo as fotos dos 7 dias. O estojo é um play por tempo (`cenas/fecho.js`), nunca preso ao scroll. **Texto e estados entram por marco**, com duração fixa, numa máquina de estados por cena: rolar rápido pula marcos sem empilhar e cada cena termina no estado final.
- Troca de texto gigante = **troca de plano** (`trocaPlano` em `src/motion/foco.js`): sai para a névoa, troca lá dentro, entra do mesmo desfoque. Toda entrada de cena esconde todos os outros itens da placa e finaliza a troca anterior antes de começar outra.
- Curvas só de `src/motion/ease.js`: `grau-out` (entradas ~0,9 s), `grau-in` (saídas ~0,35 s), `grau-io` (passagens ~1 s), `grau-snap`.
- Texto da interface: entra por máscara de linha (`.mascara`, linha escondida a 160%), sai apagando no lugar. Um tween por linha (nada de `stagger` com atraso em saída: escapa do kill).
- Traço em SVG (loader): `pathLength="1000"` e o **atributo** `stroke-dashoffset`; nunca `stroke-dasharray`/`stroke-dashoffset` no CSS (o CSS vence o atributo) nem em `<text>` (o Safari não desenha).
- Sem HUD, sem "Role para…", sem rótulo com traço, sem clarão, sem zoom de imagem: quem se move é a câmera no 3D.
- `prefers-reduced-motion`: sem Lenis, sem caçada de foco, sem giro de entrada, sem balanço; o desfoque e a refração continuam.

## Interações
- Todo clicável tem hover, foco do teclado e clique, na linguagem da peça: **o foco vai para onde você aponta** (o apontado nítido, os vizinhos desfocam), o foco do teclado é um aro de lente que entra em foco, o clique afunda e refoca, e os preenchimentos abrem em íris a partir do ponteiro (`src/sections/interacoes.css` e `src/motion/interacoes.js`).
- No celular, a classe `.toque` dá ao dedo a mesma resposta (o `:active` não é confiável no Safari). Hover só dentro de `@media (hover: hover)`.
- Formulário: foco, preenchido, erro (o rótulo vira a mensagem) e enviado (o formulário sai de foco, a confirmação entra em foco), em `src/motion/cenas/fim.js`.
- Elemento clicável novo entra nessas regras; nada de efeito genérico de biblioteca.

## Desempenho
- 60 fps no desktop e no celular. `dpr` limitado a 2. O raymarching corta os raios que atravessam a lente (a lente desenha por cima) e para na caixa da armação; os campos de distância são calculados num worker durante o loader.
- As texturas de texto da placa são redesenhadas só no carregamento e no resize.

## Como checar
1. `npm run dev`; olhar a 1456 × 840 e a 390 × 844, no Chrome e no Safari.
2. Recarregar: o símbolo se desenha com a acuidade subindo até 20/20, sai de foco, a página nasce desfocada, o foco caça uma vez e trava na interface (o título fica desfocado) e os óculos descem girando.
3. Rolar devagar: o título vai para a névoa e vira "Quadrada"; a cada marco o modelo troca com morph e a cor corre da ponte para as hastes; a câmera mergulha na lente; os cartões se fundem um no outro por trás dela e cada lente faz a sua demonstração; a praia vira a página, a luz sobe e as lentes escurecem; as fotos dos 7 dias passam e os óculos vão de uma a outra; "Prontos em até 7 dias" se forma; o estojo toca sozinho: as hastes dobram, os óculos deitam no estojo e a tampa cobre a tela; o estojo pousa no painel do formulário.
4. Parar em cada cena: nenhum texto cortado, nenhuma meia linha, nenhum texto nítido fora da lente sem querer.
5. Rolar a página inteira rápido (roda de 1200 px a cada 80 ms) e voltar: nada se atropela (o filme anda no máximo 0,75 tela/s e corta pela névoa quando a rolagem se afasta), o formulário só aparece com o estojo fechado, tudo assenta, nada de cartão preso, o estojo termina fechado e pousado no painel, e na volta abre e devolve os óculos.
6. Movimento reduzido ligado; console sem erros; `npm run build` passa.

## Personalizar

O site chega como a demo da Grau, uma marca inventada. Esta seção vale sempre que a pessoa pedir uma mudança, hoje ou daqui a meses: trocar a marca, um texto, uma foto, um modelo de armação, ou levar uma peça para outro site.

### Antes de mexer
- Se ainda não sabe o objetivo, pergunte qual destes é (uma pergunta por vez, em linguagem simples):
  1. **Ver a demo funcionando** como está, para trocar depois.
  2. **O site da minha ótica**, com esta estrutura e estas animações.
  3. **Só algumas peças** (o efeito da lente, os óculos 3D, o estojo) para um site que já existe.
- Para o caminho 2, pergunte o que ainda não sabe: nome, endereço e horário, os modelos (nome, medida, cor, preço), os tipos de lente e preços, e **que material a pessoa já tem** (fotos, logo). Não peça tudo de uma vez.
- Para o caminho 3, pergunte quais peças e onde está o site de destino. Leia o código do destino antes: em React, Next ou outro framework, adapte os módulos de `src/gl/` e `src/motion/` ao framework em vez de colar o HTML desta página. O efeito da lente depende da placa: o texto que a lente lê precisa ser desenhado no WebGL.
- Diga com clareza o que muda só com texto, o que muda só com números e o que depende de foto (tabela abaixo). Os óculos são 3D desenhados por código: **forma, cor, nome e medida** mudam editando números, mas eles **não viram a foto de uma armação específica** da marca. Isso não se resolve por prompt.

### O que muda e onde
| o quê | onde | precisa de material novo? |
|---|---|---|
| Nome, textos, preços, endereço, horário, links | `index.html` (a placa redesenha sozinha) | não |
| Título gigante da hero, nomes dos modelos, frases das lentes, títulos do sol, promessa do fecho | `index.html`, dentro de `.placa` | não |
| Fotos e legendas dos 7 dias | `public/img/dia-*.webp` (2:3 e 3:2, 1024 px ou mais) e `index.html` (`.dias__legenda`) | sim: fotos da ótica ou geradas |
| Cores da página e da interface | `src/styles/tokens.css` | não |
| Forma, nome, medida e comprimento da haste de cada modelo | `MODELOS` em `src/gl/glasses/modelos.js` (e o texto da ficha e da medida no `index.html`) | não |
| Cor do acetato de cada modelo | `CORES` em `src/gl/glasses/oculos.js` (e `cor` no modelo) | não; tartaruga nova = textura nova (receita) |
| Cor da lente de sol | `uG15` em `src/gl/glasses/oculos.js` | não |
| Estojo (cor do casco, do forro, marca na tampa) | `src/gl/estojo.js` (`texMarca` desenha a marca) | não |
| Tamanho das cenas, marcos, poses dos óculos, luz do sol | `src/motion/roteiro.js` | não |
| Fotos dos cartões das lentes e da praia | `public/img/lente-*.webp`, `praia.webp` (3:2, 1536 px ou mais) | sim: fotos da pessoa ou geradas |
| Textura de tartaruga | `public/img/tartaruga.webp` (quadrada, sem emenda visível) | sim, se quiser outro padrão |
| Logo | o SVG do símbolo no `index.html` (nav, loader, rodapé), `public/favicon.svg` e `texMarca` no estojo | sim, se a marca tiver logo |
| Tirar uma cena | o HTML dela, o CSS, o módulo em `src/main.js` e o tamanho em `CENAS` (`roteiro.js`); confira as poses e as faixas das cenas vizinhas | não |

### Material da pessoa
Para cada peça visual, ofereça estes caminhos, do mais simples para o mais trabalhoso, e deixe a pessoa escolher:
1. **Manter a da demo por enquanto** e trocar o resto. O site fica pronto hoje.
2. **Usar fotos que ela já tem.** Os cartões das lentes e a praia pedem foto horizontal 3:2, 1536 px de largura ou mais, sem texto e sem logo; a praia precisa de muito céu claro e brilho na água (é o que a lente escura e a polarizada mostram). Converta para WebP com esse tamanho. Foto escura, vertical ou cortada estraga a cena: diga isso e proponha o caminho 3.
3. **Gerar com IA** seguindo `arquivos/receitas/LEIA.md`: são os prompts que fizeram cada imagem da demo. A pessoa roda no gerador de imagem que usar e devolve os arquivos; você converte.
4. **Sem foto nova**: os óculos e o estojo não dependem de foto nenhuma. Dá para lançar com as fotos da demo e mudar só modelos, cores e textos.

### Regras ao trocar
- As regras de motion acima continuam valendo: título em duas linhas no máximo, texto nunca preso ao scroll, nenhuma passagem vira corte seco.
- Modelo novo de armação: mesmos campos de `MODELOS`; confira de frente e de 3/4 que o aro não fica fino demais (largura do aro ≥ 3,5 mm) e que a ponte encosta nas duas lentes. A lente que vira janela na seção Lentes é a do último modelo: se ele não for redondo, a janela muda de forma junto.
- Nada de texto, preço ou depoimento inventado como se fosse da marca: o que a pessoa não informou fica marcado como `[preencher]` e entra na lista do fim. Nada de cidade ou DDD inventado.
- A Satoshi não pode ser redistribuída: se for publicar o projeto em outro lugar, baixe a fonte do Fontshare de novo.
- Depois de cada troca, rode o "Como checar" nos trechos que mudaram e, no fim, liste para a pessoa o que ficou da demo (fotos, textos) e o que falta ela mandar.
