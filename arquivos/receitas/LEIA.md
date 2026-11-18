# Receitas das imagens da Grau

Estes são os prompts que geraram cada imagem da demo. Servem para refazer as fotos com a cara da sua ótica, num gerador de imagem qualquer (ChatGPT, Gemini, Midjourney, Firefly ou outro que aceite imagem de referência). Não há vídeo neste site: os óculos e o estojo são 3D desenhados por código e não dependem de imagem nenhuma.

## Ordem
1. **Estilo** (`_estilo.txt`): leia antes. É a regra que vale para todas as fotos (luz natural, cores verdadeiras, nada de texto, letreiro, logo ou placa de carro).
2. **Textura do acetato** (`tartaruga.prompt.txt`): o padrão tartaruga que veste a armação. Mande junto, como referência, um print dos óculos da hero (o arquivo `arquivos/conceito/00-hero-desktop.jpg`) para o gerador acertar a cor. Saída quadrada; o site usa em `public/img/tartaruga.webp`. Só refaça se quiser outro padrão (o código também tem as cores lisas preto, cristal e verde, que não usam textura).
3. **Fotos da seção Lentes**, uma por tipo de lente, horizontais 3:2:
   - `lente-simples.prompt.txt` → `public/img/lente-simples.webp` (visão simples: uma paisagem nítida de perto a longe);
   - `lente-multifocal.prompt.txt` → `public/img/lente-multifocal.webp` (perto embaixo, longe em cima: é o que o corredor da multifocal mostra);
   - `lente-antirreflexo.prompt.txt` → `public/img/lente-antirreflexo.webp` (noite com faróis e luzes refletidas);
   - `praia.prompt.txt` → `public/img/praia.webp` (praia ao meio-dia com brilho forte na água: é a foto do último cartão e vira a página inteira na cena do sol, onde a lente escura e a polarizada mostram a diferença).

4. **Fotos dos 7 dias** (do exame à entrega), duas em retrato 2:3 e duas em paisagem 3:2, com a mesma armação tartaruga em todas:
   - `dia-1-exame.prompt.txt` → `public/img/dia-1-exame.webp` (o exame de vista com o refrator);
   - `dia-3-medida.prompt.txt` → `public/img/dia-3-medida.webp` (a armação medida com paquímetro);
   - `dia-5-bancada.prompt.txt` → `public/img/dia-5-bancada.webp` (a lente montada na bancada);
   - `dia-7-entrega.prompt.txt` → `public/img/dia-7-entrega.webp` (os óculos prontos no estojo de veludo preto e forro mel).

## Converter e conferir
- Converta para WebP: as fotos com 1536 px de largura ou mais (a praia fica melhor com 2400 px), a textura com 1024 a 1300 px. Por exemplo: `cwebp -q 86 foto.png -o lente-simples.webp`.
- Confira cada foto antes de usar: **nenhum texto, logo, marca de carro ou placa legível** (os geradores costumam pôr). Se aparecer, gere de novo pedindo de novo para não ter.
- Mantenha os mesmos nomes de arquivo: o código já aponta para eles.

## O que adaptar
- Fotos da sua ótica: troque o assunto mantendo o que cada uma precisa mostrar (longe e perto na multifocal, luzes à noite no antirreflexo, muito céu claro e água brilhante na praia).
- Outra textura de acetato: troque as cores do prompt (por exemplo, "havana claro", "mel com manchas pretas"). Para uma cor lisa, não precisa de imagem: mude `CORES` em `src/gl/glasses/oculos.js`.
- Formas, nomes e medidas das armações não vêm de imagem: estão em `src/gl/glasses/modelos.js`.

## Custo
Cinco imagens. Num plano comum de gerador de imagem, sai de graça ou por poucos reais; não há clipe de vídeo para pagar.
