# OPUS — Prompt de produção: filme institucional em motion design (JavaScript)

## 1. Papel e objetivo

Você é diretor de criação, motion designer sênior, sound designer e desenvolvedor creative-coding ao mesmo tempo.
Seu trabalho é produzir um **filme institucional de ~95 segundos para a OPUS**, renderizado 100% no navegador com JavaScript, no nível de um case de premiação (Awwwards / Motionographer).

O filme precisa fazer um empresário sair com três certezas:
1. **A Opus entende o problema do negócio dele** (não só de tecnologia).
2. **A Opus tem os recursos para construir a solução inteira** (site, sistema, app, tráfego, estratégia).
3. **A Opus trata cada projeto como parte de uma estratégia maior de crescimento.**

Sobre a marca: a OPUS é uma empresa de tecnologia e estratégia digital. Não é uma agência que entrega peças soltas; é uma parceira que constrói **estruturas digitais integradas**, unindo tecnologia, marketing e estratégia comercial. Público: donos de empresa e gestores que querem crescer, conquistar clientes e ter uma operação mais estruturada.

---

## 2. Conceito criativo: "Estrutura"

Toda a linguagem visual nasce de uma única ideia: **peças soltas → sistema conectado**.

- **Problema** = fragmentos 3D flutuando no escuro, cada um "funcionando" sozinho, sem conexão. Ruído, desalinhamento, energia desperdiçada.
- **Virada** = uma linha de luz violeta atravessa a cena e começa a alinhar os fragmentos numa grade.
- **Opus** = os fragmentos se encaixam numa arquitetura única (uma estrutura geométrica/monolito modular). A luz passa a circular por todas as partes como um circuito.
- **Fechamento** = a estrutura se recolhe num único ponto de luz que vira o logotipo.

Metáfora central visual: **luz percorrendo conexões**. Quando algo está desconectado, fica apagado. Quando entra na estrutura, acende.

Regras de minimalismo:
- No máximo **1 ideia por quadro** e **no máximo 7 palavras de texto na tela** ao mesmo tempo.
- O texto na tela **não repete** a narração palavra por palavra; ele destaca a palavra-chave ou contraponto.
- Muito espaço negativo. O preto é um elemento de design, não fundo vazio.
- Nada de ícones genéricos (engrenagem, foguete, lâmpada, gráfico subindo), stock footage, mockups de celular clichê ou "partículas aleatórias" sem função narrativa.

---

## 3. Identidade visual

**Paleta (usar como tokens):**
| Token | Hex | Uso |
|---|---|---|
| `--void` | `#040208` | fundo, preto absoluto levemente arroxeado |
| `--deep` | `#12062B` | volumes, névoa, gradientes de profundidade |
| `--royal` | `#3B0F8C` | sombras coloridas, planos secundários |
| `--electric` | `#7C3AFF` | luz principal, linhas, bloom |
| `--lilac` | `#B9A2FF` | highlights, texto secundário |
| `--white` | `#F4F0FF` | tipografia principal |
| `--signal` | `#E8FF5A` | acento raríssimo (máx. 2 aparições no filme, ex.: o "clique" da conexão final) |

**Iluminação:** cinematográfica, low-key. Rim light violeta nas bordas dos objetos 3D, volumetria sutil (god rays / fog), reflexos especulares escuros, materiais tipo vidro fumê, metal escovado escuro e superfícies com subsurface leve.

**Tipografia (Google Fonts):**
- Títulos: **"Inter Tight"** 600–800, tracking negativo (-0.03em), caixa alta só no logotipo.
- Micro-labels técnicos: **"JetBrains Mono"** 400, 11–13px, caixa alta, tracking +0.2em (ex.: `01 / ESTRUTURA`, `NODE.TRÁFEGO`).
- Animação tipográfica por caractere/linha com máscara (reveal por clip-path), blur-in, e "decode" de caracteres apenas nos labels mono.

---

## 4. Especificação técnica

**Entregável:** um projeto web estático (`index.html` + `main.js` + `/shaders` + `/audio`) que roda localmente com `npx serve` ou abrindo via servidor simples. Sem build obrigatório; módulos ES via CDN com versões fixadas.

**Stack:**
- **Three.js** (versão fixa, ex. `0.160.x`) — cena 3D, câmera, geometria, instancing.
- **GLSL customizado** — fundo com noise de domínio deformado, linhas de energia, dissolve dos fragmentos, shader de partículas (GPGPU ou InstancedMesh).
- **Pós-processamento** (`three/examples/jsm/postprocessing` ou `pmndrs/postprocessing`): Unreal Bloom seletivo, aberração cromática leve nas bordas, film grain, vinheta, motion blur/afterimage pontual, glitch **apenas** em 1–2 momentos do ato de problema.
- **GSAP 3** (timeline master + ScrollTrigger não necessário) — orquestra 3D, 2D e áudio na mesma timeline.
- **2D sobre 3D:** camada HTML/CSS ou Canvas 2D/SVG para tipografia, grids técnicos, linhas de UI, contadores e labels. O 2D deve "interagir" com o 3D (linhas SVG que conectam até pontos projetados de objetos 3D usando `vector.project(camera)`, texto que é ocluído/revelado por objetos, grid 2D que vira plano 3D).
- **Web Audio API** — toda a trilha de sound design gerada/mixada no navegador (ver seção 6) + narração em MP3 do ElevenLabs sincronizada na timeline.

**Formato e performance:**
- 1920×1080 (16:9), escala responsiva mantendo proporção (letterbox preto).
- Alvo 60 fps em notebook comum; `devicePixelRatio` limitado a 2; partículas ≤ 150k.
- **Timeline determinística**: tudo dirigido por um único relógio (`audioContext.currentTime`) para que vídeo, VO e SFX nunca saiam de sincronia.
- Tela inicial preta com "▶ Clique para iniciar" (exigência de autoplay de áudio).
- Controles de dev (tecla `D`): scrub da timeline, pular para cena, mostrar FPS.
- Modo exportação: `?record=1` grava com `MediaRecorder` (canvas + áudio) para gerar um `.webm` final.
- Fallback: se os MP3 de narração não existirem, roda com legendas na tela e SFX.

---

## 5. Roteiro, cenas e direção (≈ 95s)

Cada cena traz: tempo · visual (3D + 2D) · texto na tela · narração · som.

### CENA 0 — Abertura (0:00–0:05)
- **Visual:** preto total. Um único pixel violeta pisca, estica até virar uma linha horizontal fina que corta a tela. Micro-label `OPUS / 2026` em mono, canto inferior esquerdo.
- **Som:** silêncio → tick seco → sub-bass "drone" entra em fade.

### CENA 1 — O problema (0:05–0:24)
- **Visual 3D:** câmera lenta passando por fragmentos flutuantes (placas de vidro, blocos, painéis) cada um com um label 2D: `SITE`, `ANÚNCIOS`, `PLANILHA`, `CRM?`, `APP`. Cada um tem uma luzinha própria, mas **nenhuma linha os conecta**. Leve dessincronia: cada fragmento gira em ritmo diferente. Uma linha tenta ligar dois deles e falha (glitch curto).
- **Texto na tela:** `Esforço não falta.` → `Falta estrutura.`
- **Narração:**
  > A maioria das empresas não tem um problema de esforço. [pause] Tem um problema de estrutura.
  > Um site de um lado. Uma campanha do outro. Um sistema que ninguém integra.
  > Cada peça funciona. [pause] Nenhuma conversa com a outra.
  > E o crescimento fica esperando.
- **Som:** drone grave, ticks de relógio irregulares, pequenos glitches digitais quando a conexão falha, ar/room tone escuro.

### CENA 2 — Nova perspectiva (0:24–0:38)
- **Visual:** tudo congela. A câmera recua; um grid 2D técnico aparece e se inclina até virar um plano 3D. Uma linha de luz percorre o grid e os fragmentos se alinham a ele, um por um, com "snap" magnético.
- **Texto na tela:** `Crescer não é somar.` → `É conectar.`
- **Narração:**
  > Crescer não é acumular ferramentas.
  > É fazer cada uma trabalhar na mesma direção.
- **Som:** corte seco para silêncio (0,4s) → riser tonal longo; cada "snap" é um impacto metálico curto e afinado (escala pentatônica, sobe a cada encaixe).

### CENA 3 — Revelação Opus (0:38–0:48)
- **Visual:** os fragmentos alinhados colapsam num ponto, implosão de luz, e explodem em partículas que desenham o wordmark **OPUS** em 3D (extrusão fina, vidro escuro com rim light violeta). Bloom forte por 1 segundo, depois respira.
- **Texto na tela:** `OPUS` + label mono `TECNOLOGIA · MARKETING · ESTRATÉGIA`
- **Narração:**
  > Foi para isso que a Opus nasceu.
  > Tecnologia, marketing e estratégia comercial [pause] construídos como uma só estrutura.
- **Som:** sucção reversa → **hit cinematográfico** (sub 40Hz + transiente + cauda de reverb longa) → pad etéreo em acorde menor com 9ª.

### CENA 4 — A estrutura em funcionamento (0:48–1:12)
- **Visual 3D:** o wordmark se abre e revela uma arquitetura modular (5 módulos conectados em volta de um núcleo). A câmera visita cada módulo; quando visitado, ele acende e um **pulso de luz percorre as conexões até o próximo**, mostrando o fluxo: atenção → interesse → operação → relacionamento, com a estratégia no centro direcionando tudo.
- **2D:** para cada módulo, um card minimalista com label mono e uma linha SVG presa ao objeto 3D.

| Módulo | Label | Papel na estrutura (texto na tela) |
|---|---|---|
| Tráfego pago | `01 / AQUISIÇÃO` | Traz a atenção certa. |
| Sites e landing pages | `02 / CONVERSÃO` | Transforma atenção em interesse. |
| Sistemas personalizados | `03 / OPERAÇÃO` | Organiza o que vem depois. |
| Aplicativos | `04 / RELACIONAMENTO` | Mantém o cliente por perto. |
| Estratégia de marketing | `00 / DIREÇÃO` | Decide para onde tudo aponta. |

- **Narração:**
  > O tráfego traz a atenção certa.
  > O site transforma atenção em interesse.
  > O sistema organiza o que vem depois.
  > O aplicativo mantém o cliente por perto.
  > E a estratégia decide para onde tudo isso aponta.
- **Som:** batida minimalista entra (kick abafado + hat granular), cada módulo tem uma "assinatura sonora" curta (blip, sweep, click de dados, ping, tom grave para a estratégia). O pulso de luz entre módulos tem whoosh estéreo que acompanha a direção na tela (pan L→R).

### CENA 5 — O diferencial (1:12–1:24)
- **Visual:** a câmera sobe e vemos a estrutura inteira de cima, como uma planta arquitetônica viva. Três ícones-palavra caem e se desfazem em partículas: `PÁGINAS`, `SISTEMAS`, `CAMPANHAS`. As partículas são absorvidas pela estrutura, que pulsa mais forte.
- **Texto na tela:** `Não vendemos peças.` → `Construímos propósito.`
- **Narração:**
  > Não vendemos páginas, sistemas ou campanhas.
  > Desenvolvemos soluções em que cada elemento tem uma função [pause] dentro de uma estratégia maior.
- **Som:** batida para, sobra só o pad; cada palavra que se desfaz tem um "granular dissolve"; a absorção é um swell grave.

### CENA 6 — O custo de ficar parado (1:24–1:32)
- **Visual:** corte para preto quase total. Um único fragmento solto do Ato 1 aparece, sozinho e apagado, enquanto ao fundo, desfocada, a estrutura Opus brilha. Rack focus lento entre os dois.
- **Texto na tela:** `Ficar parado também é uma decisão.`
- **Narração:**
  > Ficar sem estrutura também é uma escolha. [pause] Ela só não aparece na planilha… até aparecer.
- **Som:** quase silêncio, room tone, um único tick de relógio a cada segundo.

### CENA 7 — Mensagem central + assinatura (1:32–1:45)
- **Visual:** o fragmento solto é puxado para a estrutura e encaixa (único uso do `--signal`). A estrutura inteira acende, a câmera faz um dolly out longo e tudo se reduz a um ponto de luz que se transforma no logotipo OPUS em 2D, nítido, centralizado.
- **Texto na tela (em duas batidas):**
  1. `Não construímos apenas soluções digitais.` / `Construímos estruturas com potencial para alavancar negócios.`
  2. `OPUS.` / `Sua próxima evolução começa aqui.`
- **Narração:**
  > Não construímos apenas soluções digitais.
  > Construímos estruturas com potencial para alavancar negócios.
  > [pause] Opus. [pause] Sua próxima evolução começa aqui.
- **Som:** o encaixe tem o impacto mais limpo do filme; riser final → hit grave → tudo corta em seco no "Opus", deixando só a cauda do reverb sob a última frase. 2 segundos de silêncio no fim antes do fade.

---

## 6. Sound design (Web Audio API)

Construir um pequeno motor de áudio com nós reais (não apenas tocar MP3 prontos):
- **Bus master** → compressor suave → limiter (`DynamicsCompressorNode`) → saída. Alvo de loudness ≈ -14 LUFS.
- **Bus VO** com sidechain/ducking: música e SFX baixam ~6–8 dB sempre que a narração estiver ativa.
- **Reverb** por `ConvolverNode` com impulse response gerada proceduralmente (ruído com decay exponencial, 3–5s).
- **Biblioteca procedural:** sub-drone (osciladores desafinados + lowpass com LFO), risers (noise filtrado com sweep de cutoff + pitch), whooshes (noise bandpass com pan automatizado), hits (sine 40–55Hz com pitch envelope + transiente de noise), ticks/clicks (bursts de 2–5ms), glitches (bitcrush via `WaveShaperNode` + gate rítmico), blips afinados, pad (acorde Cm(add9) com osciladores serrilhados filtrados + chorus).
- Todos os SFX são agendados com tempo exato pela timeline GSAP (`audioCtx.currentTime + offset`).
- Respeitar espaço: o silêncio é parte da trilha. Nada de música "corporativa".

---

## 7. Narração — direção para ElevenLabs

- **Voz:** português do Brasil, masculina ou feminina grave, 30–45 anos, tom de autoridade calma — fala como um sócio experiente explicando algo óbvio para ele, **não como locutor de comercial**. Sem sotaque caricato, sem "voz de trailer".
- **Ritmo:** lento e firme (~130 palavras/min), pausas longas antes das frases-chave.
- **Arquivos:** uma fala por arquivo, nomeados por cena (`vo_1a.mp3`, `vo_1b.mp3`, …) para sincronizar pela timeline. Exportar em MP3 44.1kHz, 192kbps.
- **Tags de áudio:** usar tags entre colchetes compatíveis com o modelo usado (ex.: `[calm]`, `[serious]`, `[pause]`, `[softly]`), com moderação — no máximo uma tag de emoção por fala. Testar 3 takes por fala e escolher o mais natural.
- Ajustes sugeridos: estabilidade média, sem exageros de estilo; reforçar pausas com reticências ou quebras de linha se a tag `[pause]` não for respeitada.

**Texto da narração completo (para colar no ElevenLabs):**

```
[calm] A maioria das empresas não tem um problema de esforço. [pause] Tem um problema de estrutura.
Um site de um lado. Uma campanha do outro. Um sistema que ninguém integra.
Cada peça funciona. [pause] Nenhuma conversa com a outra.
[softly] E o crescimento fica esperando.

[serious] Crescer não é acumular ferramentas.
É fazer cada uma trabalhar na mesma direção.

Foi para isso que a Opus nasceu.
Tecnologia, marketing e estratégia comercial [pause] construídos como uma só estrutura.

O tráfego traz a atenção certa.
O site transforma atenção em interesse.
O sistema organiza o que vem depois.
O aplicativo mantém o cliente por perto.
E a estratégia decide para onde tudo isso aponta.

Não vendemos páginas, sistemas ou campanhas.
Desenvolvemos soluções em que cada elemento tem uma função [pause] dentro de uma estratégia maior.

[softly] Ficar sem estrutura também é uma escolha. [pause] Ela só não aparece na planilha... até aparecer.

[calm] Não construímos apenas soluções digitais.
Construímos estruturas com potencial para alavancar negócios.
[pause] Opus. [pause] Sua próxima evolução começa aqui.
```

---

## 8. Regras de linguagem

- Frases curtas, concretas, com contraste (problema → verdade). Uma ideia por frase.
- **Proibido:** "soluções inovadoras", "transformação digital", "alavancar resultados exponenciais", "no mundo de hoje", "mais do que nunca", "levar seu negócio a outro patamar", "sinergia", promessas de números ("dobre suas vendas"), e qualquer construção do tipo "não é só X, é Y" repetida mais de uma vez fora da mensagem central.
- Urgência por **consequência lógica**, não por medo ou escassez falsa.
- O texto deve soar dito por uma pessoa, não escrito por uma IA: sem tríades decorativas, sem adjetivos empilhados.

---

## 9. Critérios de qualidade (checklist antes de entregar)

- [ ] Cada cena tem um movimento de câmera motivado (nada de câmera girando à toa).
- [ ] Easing autoral: `expo.inOut` / curvas customizadas; nada de `linear` exceto em loops contínuos.
- [ ] Transições entre cenas são **match cuts** (a forma do fim de uma cena vira o início da próxima), não fades genéricos.
- [ ] 2D e 3D se tocam fisicamente em pelo menos 4 momentos (linhas presas a objetos, grid que vira plano, texto ocluído, logo 3D → 2D).
- [ ] Sincronia: cada palavra-chave da narração coincide com um evento visual (±80ms).
- [ ] Contraste de ritmo: momentos de silêncio e quietude antes de cada pico.
- [ ] 60 fps estáveis; sem flicker de bloom; sem texto ilegível sobre fundo claro.
- [ ] Funciona sem os MP3 (legendas + SFX) e com eles (sincronizado).

## 10. Entregáveis

1. Projeto completo em `/opus-motion` (HTML, JS, shaders, áudio procedural).
2. `script-vo.txt` com a narração pronta para o ElevenLabs e a lista de nomes de arquivos.
3. `README.md` com como rodar, como trocar os áudios da narração e como exportar o vídeo.
