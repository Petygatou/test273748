# OPUS — Reels em motion design (JavaScript)

Filme vertical de 67s (1080×1920, 9:16) para Instagram Reels, construído inteiro no navegador:
3D em Three.js com shaders GLSL próprios, tipografia cinética em DOM/GSAP, HUD 2D em Canvas preso
aos objetos 3D, e sound design 100% procedural em Web Audio API, todos sincronizados com a narração
`audio/vo.mp3` (ElevenLabs).

## Como assistir

```bash
cd opus-motion
npx serve .            # ou: python3 -m http.server
```

Abra `http://localhost:3000` e clique em **Assistir com som**.
Atalhos: `F` tela cheia · `R` reiniciar · `D` modo debug (scrub da timeline, espaço = play/pause).

## Como exportar o vídeo (MP4 para o Reels)

```bash
npm install
node tools/render.mjs                 # -> out/opus.mp4 (1080x1920, 30fps, H.264 + AAC)
node tools/render.mjs --fps 60        # versão 60fps
node tools/render.mjs --stills 5,22,61   # PNGs de conferência
node tools/render.mjs --audio-only    # só a mixagem -> out/mix.wav
```

O renderizador abre `index.html?render=1` no Chromium headless, desenha cada quadro num tempo exato,
renderiza a trilha completa com `OfflineAudioContext` e junta tudo com ffmpeg.

## Sincronia com a voz

`data/words.json` tem o tempo de cada palavra da narração (transcrição com Whisper).
Toda a coreografia em `src/timeline.js` é escrita nesses tempos (`v(21.43)` = palavra "Opus"),
então cada corte, impacto e palavra na tela cai exatamente na fala. O ritmo da batida também
está ancorado no "Opus" (120 BPM).
Para trocar a narração: substitua `audio/vo.mp3`, gere de novo `data/env.json` / `data/words.json` e ajuste os tempos.

## Estrutura

| Arquivo | Função |
|---|---|
| `src/timeline.js` | roteiro, cenas, câmera, textos, cues de som e música |
| `src/scene3d.js` | cena Three.js: partículas com morph (nuvem → OPUS → órbitas → núcleo → galáxia), painéis de vidro, estrutura modular, pós-processamento |
| `src/overlay.js` | HUD 2D (linhas presas ao 3D, planilha, loading, waveform da voz) e tipografia cinética |
| `src/audio.js` | motor de som: impactos, risers, whooshes, glitches, bateria, baixo, pads, ducking pela voz, compressor/limiter |
| `tools/render.mjs` | exportação para MP4 |

Área segura do Reels respeitada: textos entre y≈360 e y≈1500, longe da barra superior e da legenda/botões.
