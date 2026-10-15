# Comercial Pomar Distribuidora · motion graphics (60 s)

Vídeo final: `output/pomar-distribuidora-comercial.mp4` (1920x1080, 60 fps, H.264 + AAC, 60 s).
Sem narração e sem falas: só texto na tela e uma trilha calma original.

Também nesta pasta:

- `output/trilha-pomar.m4a` e `output/trilha-pomar.wav`: a trilha sozinha, para usar em outras edições.
- `PROMPTS-OMNI.md`: três prompts para gerar uma versão com IA no Gemini Omni 1.1 Flash.
- `keyframes/`: quadros do comercial para usar como referência de estilo e como último quadro no Omni.

## Roteiro

| Tempo | Cena | Texto na tela | Movimento |
|---|---|---|---|
| 0:00 – 0:10 | Amanhecer no campo | Tudo começa no campo. | Um ponto laranja nasce na linha do horizonte, vira sol; colinas sobem em camadas e brotos se abrem no ritmo da música |
| 0:09 – 0:20 | Pomar | Colhido no ponto certo. | O sol encolhe e vira a primeira laranja de uma árvore; as frutas nascem verdes, amadurecem até o laranja e caem numa caixa |
| 0:19 – 0:30 | Variedade | Frutas, verduras e legumes / selecionados com cuidado | Uma folha gigante varre a tela; 14 hortifrútis ilustrados orbitam o texto em profundidade e caem numa caixa |
| 0:29 – 0:38 | Entrega | Do pomar até você. | Uma íris abre a estrada; a caixa cai no caminhão, que sai com fundo em paralaxe |
| 0:38 – 0:43 | Rota | Cuidado em cada entrega. | Mapa com rota desenhada até Mercados, Restaurantes e Hortifrútis |
| 0:42 – 0:48 | Valores | Qualidade, Frescor, Pontualidade | O ponto da rota cresce, preenche a tela e vira o primeiro de três círculos com ícones desenhados |
| 0:47 – 1:00 | Assinatura | POMAR DISTRIBUIDORA / Do pomar até você. | Os três círculos voam para as formas do logo, que se revela em partes: caule, folhas, crescente |

## O logo

O logo é a imagem enviada, sem nenhuma alteração: `assets/logo/logo-original.png` é cópia byte a byte do arquivo original.
Para a revelação final, `tools/logo_parts.py` separa a imagem original em cinco camadas (círculo, crescente, caule e as duas folhas),
mantendo as cores de cada pixel. Somadas, as camadas reproduzem a imagem original exatamente (o script confere isso),
e assim que a revelação termina a imagem inteira é exibida. O fundo do encerramento usa o mesmo cinza claro do arquivo (#F7F7F7).

## Trilha

Composição original em Ré maior, 72 BPM (1 compasso = 3,33 s), sintetizada do zero em `tools/music.py`:
piano abafado, pad suave, baixo leve, marimba, sinos tipo celesta e um chocalho discreto na cena do caminhão.
Brotos, frutas, caixas, pinos do mapa, os três valores e o logo caem em notas da música, usando os tempos exportados da própria animação.
Loudness final de -16 LUFS.

## Como gerar de novo

Requisitos: Node 18+ com Playwright (Chromium), Python 3 com numpy e scipy, ffmpeg.

```bash
cd pomar-comercial
python3 tools/logo_parts.py assets/logo/logo-original.png assets/logo 1.25   # camadas do logo
node tools/render.cjs cues tools/cues.json                                    # tempos da animação
python3 tools/music.py tools/cues.json output/trilha-pomar.wav                # trilha
node tools/render.cjs video /tmp/video.mp4 60 3                               # quadros 60 fps
bash tools/mux.sh /tmp/video.mp4 output/trilha-pomar.wav output/pomar-distribuidora-comercial.mp4
```

Para assistir no navegador: sirva a pasta (`npx serve .`) e abra `index.html?play` (clique para tocar a trilha)
ou `index.html?t=24.5` para ver um quadro.

## Créditos

- Ilustrações, animação e trilha: feitas para este comercial, sem bancos de imagem e sem emojis.
- Fonte Outfit (SIL Open Font License, `assets/fonts/OFL-Outfit.txt`).
- GSAP 3.13 (licença padrão gratuita, https://gsap.com/standard-license).
