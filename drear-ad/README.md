# Anúncio "Opium 5 / Drear" — Gravity.Ai

Vídeo final: `output/drear-opium5-ad.mp4` (1920x1080, 60 fps, H.264 + AAC 48 kHz, 2:00, −14 LUFS).
Quadro de capa: `output/poster.png`.

Motion graphics em preto e branco sobre fundo branco, no mesmo estilo do anúncio "The X Subscription"
da xAI: painéis em traço fino com recortes ampliados dos logos em contorno, transições em que um
quadrado novo cresce a partir do canto inferior esquerdo enquanto o antigo encolhe para o canto
superior direito (com guias tracejadas), escada de painéis que vira ícones sólidos, e títulos em
sans-serif regular cujo espaço entre as palavras se fecha. As cenas de uso são como gravações de tela:
sem pessoas e sem narração, só o que está sendo feito (cursor, digitação, cliques e o resultado).

## Valores medidos na referência e usados aqui

| Elemento | Valor |
|---|---|
| Fundo | `#FFFFFF` |
| Painéis | preenchimento `#FBFBFB`, traço preto de 2 px, cantos de 6 px |
| Guias | tracejado `#CACACA`, 2 px, traço 10 / espaço 10 |
| Painel principal | 720 x 720 centralizado (x 600–1320, y 180–900) |
| Tipografia | Inter Display Regular, 92 px (substitui a Universal Sans da xAI); Inter e JetBrains Mono nas telas de app |
| Áudio | −14 LUFS integrado, como a referência (−14,4) |

## Roteiro

| Tempo | Cena |
|---|---|
| **0:00 – 0:30** | **Opium 5** |
| 0,3 s | **"Introducing Opium 5"**; o painel cresce do canto e apaga o título |
| 2,5 – 8 s | Recortes em contorno: braço do logo da Gravity, o "O" e o "5" gigantes, o centro do logo, o "i" |
| 8 – 12,4 s | Escada com 4 painéis (a "família": o logo com 1, 2, 3 e 4 braços), que viram ícones sólidos e se fundem no logo completo |
| 13 – 16 s | "A new family of models" |
| 16,6 – 21,6 s | Os lóbulos do logo se soltam e orbitam o centro em espiral, e voltam a se unir |
| 22 – 26 s | "Think." "Reason." "Code." "Create." |
| 26 – 29,7 s | Assinatura: logo + **Opium 5** "by Gravity.Ai" |
| **0:30 – 1:00** | **Alguém usando o Opium 5** |
| | A janela do app abre; o cursor clica e digita "How does gravity bend light? Draw it for me." |
| | O modelo "pensa" (o logo vira um spinner orbitando), responde, e abre um painel com o diagrama de lente gravitacional sendo desenhado (grade do espaço-tempo se curvando, raios de luz, imagens aparentes) |
| | Segundo pedido, "Now simulate it.": o código aparece linha a linha, o cursor clica em Run e 24 raios de luz atravessam a massa, formando o anel de Einstein |
| **1:00 – 1:30** | **Drear** |
| 1:00 | O Drear surge + **"Introducing Drear"**; pisca e olha para os lados |
| 1:03 – 1:08 | Recortes do Drear em contorno (os olhos piscam), até o Drear inteiro |
| 1:08 – 1:16 | Grade 3x3 com o Drear no centro e 8 tarefas; ele olha para cada uma e ela vira sólida; as tarefas orbitam e ele as absorve |
| 1:17 – 1:23 | "One agent. Many tasks." / "Powered by ✣ Opium 5" |
| **1:23 – 1:53** | **Alguém usando o Drear** |
| | O Drear entra na janela do app; o cursor digita "Plan our Lisbon offsite: venue, flights, agenda, invites." e clica |
| | O Drear monta o plano (4 itens) e abre 4 painéis que trabalham ao mesmo tempo: busca de local, comparação de voos e reserva dos 6 assentos, agenda de 2 dias, e o convite (que recebe os anexos à medida que as outras tarefas terminam e é enviado) |
| | Os olhos do Drear seguem o painel onde algo acabou de acontecer; cada tarefa concluída marca o check |
| | Resumo "Offsite ready." e o cursor clica em Approve |
| **1:53 – 2:00** | Assinatura final: Drear + **Drear** + "Powered by ✣ Opium 5", rodapé ✣ Gravity.Ai |

## Trilha e efeitos

`audio/soundtrack.py` é toda sintetizada, 120 BPM em Ré maior, com mixagem em barramentos
(sidechain do kick, reverb, delay ping-pong, chorus):

- **Opium 5**: plucks, pad supersaw, baixo e bateria (kick, clap, hats); breakdown na órbita; batidas nas palavras.
- **Opium 5 em uso**: groove calmo de piano elétrico FM que deixa espaço para o som do teclado e cresce
  com o diagrama, o código e a simulação.
- **Drear**: parte mais alegre, four-on-the-floor e a melodia das tarefas sendo concluídas.
- **Drear em uso**: groove mais intenso; cada painel que começa acrescenta uma camada (hats, arpejo, clap,
  percussão) e cada tarefa concluída toca um sino; acorde de sucesso no resumo.
- **Assinatura sonora**: um motivo de 4 notas no piano elétrico no título, na assinatura do Opium 5 e no final.
- **Foley de interface**: teclas (com som de apertar e soltar, barra de espaço mais grave), cliques do
  mouse, envio, pops, ticks do agente, checks, whooshes das janelas e impactos nos cortes.

Os tempos de cada som vêm da própria animação (`node render.mjs cues build/cues.json`), então cada
tecla e cada clique caem no quadro certo. `audio/normalize.sh` normaliza para −14 LUFS / −1,5 dBTP.

## Logos vetorizados

`tools/fit_shapes.py` transforma os PNGs em geometria limpa, que fica perfeita em qualquer zoom:

- **Drear** (`assets/drear.png`): união de 6 círculos (IoU de 99,5 % com a imagem) + 2 olhos em pílula,
  que piscam e olham em volta.
- **Gravity.Ai** (`assets/gravity.png`): círculo central + 4 lóbulos + pescoços em curva de Bézier
  ajustada ao perfil medido (erro máximo de 0,29 px).

As uniões booleanas são feitas com paper.js (`src/geometry.js`), onde também ficam os ícones de tarefa.
As cenas de uso estão em `src/demos.js`.

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
node render.mjs sheet prévia.png 30 60 36           # folha de contato com 36 quadros entre 30 e 60 s
node render.mjs stills pasta/ 43.6 99.8              # quadros em resolução total
node render.mjs video saida.mp4 --fps 60 --audio build/soundtrack.wav --from 83 --to 114
```

Para ver um quadro no navegador, sirva a pasta por HTTP (`npx serve .`) e abra `src/index.html?t=43.6`.

Dependências: Node 18+ (Playwright + Chromium, paper.js), Python 3 com numpy, scipy, opencv e
Pillow, e ffmpeg. Fontes: Inter / Inter Display e JetBrains Mono (SIL OFL 1.1, ver `fonts/`).
