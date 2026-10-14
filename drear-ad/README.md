# Anúncio "Opium 5 / Drear" — Gravity.Ai

Vídeo final: `output/drear-opium5-ad.mp4` (1920x1080, 60 fps, H.264 + AAC 48 kHz, 60,0 s, −14 LUFS).
Quadro de capa: `output/poster.png`.

Motion graphics em preto e branco sobre fundo branco, no mesmo estilo do anúncio "The X Subscription"
da xAI: painéis em traço fino com recortes ampliados dos logos em contorno, transições em que um
quadrado novo cresce a partir do canto inferior esquerdo enquanto o antigo encolhe para o canto
superior direito (com guias tracejadas), escada de painéis que vira ícones sólidos, e títulos em
sans-serif regular cujo espaço entre as palavras se fecha.

## Valores medidos na referência e usados aqui

| Elemento | Valor |
|---|---|
| Fundo | `#FFFFFF` |
| Painéis | preenchimento `#FBFBFB`, traço preto de 2 px, cantos de 6 px |
| Guias | tracejado `#CACACA`, 2 px, traço 10 / espaço 10 |
| Painel principal | 720 x 720 centralizado (x 600–1320, y 180–900) |
| Tipografia | Inter Display Regular, 92 px (substitui a Universal Sans da xAI) |
| Áudio | −14 LUFS integrado, como a referência (−14,4) |

## Roteiro

| Tempo | Cena |
|---|---|
| 0,3 – 3,6 s | **"Introducing Opium 5"**, o espaço entre as palavras se fecha; o painel cresce do canto e apaga o título |
| 2,5 – 8,0 s | Recortes em contorno: braço do logo da Gravity, o "O" e o "5" gigantes, o centro do logo, o "i" — trocados pela transição de canto |
| 8,0 – 10,5 s | Escada com 4 painéis: a "família" Opium 5 (o logo com 1, 2, 3 e 4 braços) |
| 9,75 – 12,4 s | Os painéis viram ícones sólidos em fila, a fila se contrai e os quatro se fundem no logo completo |
| 13,0 – 16,0 s | "A new family of models" |
| 16,6 – 21,6 s | Os lóbulos se soltam e orbitam o centro em espiral (gravidade), com órbitas tracejadas, e voltam a se unir |
| 22 – 26 s | "Think." "Reason." "Code." "Create." |
| 26 – 29,7 s | Assinatura: logo + **Opium 5** "by Gravity.Ai", que se recolhe num ponto |
| 30,0 – 33,6 s | O Drear surge desse ponto + **"Introducing Drear"**; ele pisca e olha para os lados |
| 33 – 38,75 s | Recortes do Drear em contorno: os olhos (que piscam), as curvas da nuvem, um olho, o Drear inteiro |
| 38,75 – 43,25 s | O painel vira uma grade 3x3: Drear no centro e 8 tarefas (código, web, documento, gráfico, e-mail, agenda, imagem, busca). Ele olha para cada uma e ela vira sólida — multitarefa |
| 43,5 – 46,5 s | As tarefas orbitam o Drear, que as acompanha com os olhos e as absorve |
| 47,25 s | "One agent. Many tasks." |
| 50,25 s | "Powered by ✣ Opium 5" |
| 53,5 – 60 s | Assinatura final: Drear + **Drear** + "Powered by ✣ Opium 5", rodapé ✣ Gravity.Ai |

## Logos vetorizados

`tools/fit_shapes.py` transforma os PNGs em geometria limpa, que fica perfeita em qualquer zoom:

- **Drear** (`assets/drear.png`): união de 6 círculos (um por "gomo" da nuvem, IoU de 99,5 % com a
  imagem) + 2 olhos em formato de pílula, que piscam e olham em volta.
- **Gravity.Ai** (`assets/gravity.png`): círculo central + 4 lóbulos + pescoços em curva de Bézier
  ajustada ao perfil medido (erro máximo de 0,29 px).

As uniões booleanas são feitas com paper.js (`src/geometry.js`); os ícones de tarefa são desenhados lá também.

## Trocar os nomes

No topo de `src/anim.js`:

```js
const MODEL = 'Opium 5', PRODUCT = 'Drear', BRAND = 'Gravity.Ai';
```

As letras gigantes dos recortes seguem o `MODEL` (primeira e última letra). Depois é só gerar de novo.

## Como gerar de novo

```bash
./build.sh          # ajusta os logos, exporta a linha do tempo, sintetiza a trilha e renderiza o MP4
```

Partes avulsas:

```bash
node render.mjs sheet prévia.png 0 30 36            # folha de contato com 36 quadros entre 0 e 30 s
node render.mjs stills pasta/ 12.5 40.2              # quadros em resolução total
node render.mjs video saida.mp4 --fps 60 --audio build/soundtrack.wav --from 30 --to 40
```

Para ver um quadro no navegador, sirva a pasta por HTTP (`npx serve .`) e abra `src/index.html?t=12.5`.

A trilha (`audio/soundtrack.py`) é toda sintetizada: 120 BPM em Ré maior (pad, arpejos FM, baixo,
kick, hats) e sons de interface (ticks, whooshes, impactos, "pop" do Drear, piscadas). Os tempos vêm
da própria animação (`node render.mjs cues build/cues.json`), então cada som cai no quadro certo.
`audio/normalize.sh` normaliza para −14 LUFS / −1,5 dBTP.

Dependências: Node 18+ (Playwright + Chromium, paper.js), Python 3 com numpy, scipy, opencv e
Pillow, e ffmpeg. Fonte: Inter Display (SIL OFL 1.1, ver `fonts/LICENSE-Inter.txt`).
