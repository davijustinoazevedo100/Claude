# Motion Reel — motion design 100% em código

Um reel de **48 segundos, 1920×1080 a 60 fps**, feito do zero: sem After Effects, sem templates,
sem plugins, sem imagens ou sons prontos. Cada quadro é desenhado por código (canvas 2D via Skia)
e a trilha sonora é sintetizada em Python, nota por nota, sincronizada com as animações.

Arquivo final: `out/motion-reel.mp4`

## As 8 cenas

| # | Cena | Tempo | O que mostra |
|---|------|-------|--------------|
| 01 | Ponto | 0–4 s | Um ponto nasce, quica com *squash & stretch* num chão elástico, carrega energia (antecipação) e voa contra a câmera até virar o papel da cena seguinte. |
| 02 | Tipografia | 4–10 s | "MOTION DESIGN" com máscaras e *block wipe*, uma ficha técnica tipográfica desenhada por cima e 7 palavras cortadas no tempo da música, cada uma com um movimento diferente (punch, flip, slide, ciclo de cor, peso 100→900, tracking, onda). |
| 03 | Timing | 10–16 s | Cinco bolas percorrem a mesma distância em 120 frames com curvas diferentes (linear, cubic-bezier, back, mola física, bounce). As curvas se plotam, os *ticks* mostram o espaçamento, viram *onion skin* e as bolas se fundem como metaballs. |
| 04 | Forma | 16–22 s | Uma única curva polar (240 amostras) morfa a cada batida: círculo, quadrado, triângulo, estrela, flor, cruz, hexágono e blob, com rotação por mola e ondas num grid de pontos. |
| 05 | Partículas | 22–28 s | O círculo explode em 6.000 partículas num campo de fluxo *curl noise* e cada uma encontra seu lugar na palavra ORDEM. |
| 06 | Profundidade | 28–34 s | 3D sem engine: projeção perspectiva escrita à mão. A palavra explode numa esfera UV em wireframe, que vira toro, que se desenrola num terreno de ondas e colapsa numa linha. |
| 07 | Dados | 34–40 s | Só números reais deste filme: 2.880 frames (odômetro de verdade), linhas de código de cada cena (lidas dos arquivos) e a curva de volume da trilha (lida do WAV renderizado), com o "você está aqui". |
| 08 | Assinatura | 40–48 s | O ponto volta, ganha três órbitas de rastro de movimento e vira a assinatura final. |

As cenas são ligadas por *match cuts*: o último quadro de uma é o primeiro da outra, então o
filme inteiro se lê como um plano contínuo.

## Técnicas

- **Motion blur real**: cada quadro é a média de até 8 sub-quadros dentro de um obturador de 180°;
  partículas usam rastros analíticos (um traço do tamanho exato do movimento no obturador).
  Cortes secos são respeitados (o blur nunca atravessa um corte).
- **Easing e física**: biblioteca própria de easings, `cubic-bezier`, molas amortecidas em forma
  fechada e oscilações decrescentes — tudo determinístico, qualquer quadro pode ser renderizado
  isoladamente.
- **Câmera**: tremor e zoom de impacto guiados por uma lista de *hits*, com aberração cromática.
- **Acabamento**: bloom com limiar, vinheta e brilho com *dither* (sem banding), grão de filme
  e HUD de transmissão que troca de cor conforme o fundo.
- **Trilha sonora**: kick, clap, hats, baixo com sidechain, pads, arpejos, lead, whooshes, risers,
  impactos e reverb por convolução — 120 BPM em Lá menor, tudo gerado em `audio/soundtrack.py`.

## Como renderizar

Requisitos: Node 20+, Python 3 com `numpy` e `scipy`, `ffmpeg`, e as fontes Inter, Inter Display
e DejaVu Sans Mono instaladas no sistema.

```bash
npm install
npm run render            # trilha + 2.880 quadros em paralelo + encode final
node tools/preview.mjs --t 12.5                     # um quadro em PNG
node tools/preview.mjs --range 22:28:0.25 --cols 5  # folha de contato de um trecho
```

## Estrutura

```
src/core.js        matemática, easings, molas, ruído simplex, cores
src/engine.js      compositor: cena ativa, sub-quadros, câmera, pós e HUD
src/post.js        bloom, aberração cromática, vinheta, grão, dither
src/hud.js         overlay com timecode, contador de frames e capítulos
src/ui.js          componentes tipográficos reutilizados (legendas, rótulos)
src/particles.js   sistema de partículas compartilhado pelas cenas 05 e 06
src/meta.js        metaballs com anti-aliasing analítico
src/scenes/        as oito cenas
audio/soundtrack.py  síntese da trilha
tools/             render paralelo, prévias e relatório de áudio
```
