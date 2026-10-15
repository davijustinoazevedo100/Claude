# Prompts para o Gemini Omni 1.1 Flash

Três prompts de 20 s cada, que juntos formam o comercial de 1 minuto da Pomar
Distribuidora, seguindo o mesmo roteiro do vídeo pronto em `output/`.

O Omni 1.1 Flash gera clipes de até 10 s e permite estender a cena em blocos de
10 s. Por isso cada prompt tem duas partes:

1. Gere a **Parte A** com duração de 10 s, formato 16:9.
2. Use **Estender cena (+10 s)** colando a **Parte B**.

Os prompts estão em inglês porque o modelo segue melhor as instruções assim.
Os textos que aparecem na tela continuam em português.

## Dicas antes de começar

- **Logo sem alteração:** na Parte B do Prompt 3, envie `keyframes/final-logo.png`
  como último quadro (last frame). Assim o vídeo termina exatamente no logo
  original. Se a IA ainda distorcer o logo, corte os últimos segundos e use o
  final do vídeo pronto, ou coloque o logo por cima na edição.
- **Emendar sem corte:** use o último quadro de cada clipe como primeiro quadro
  (first frame) do clipe seguinte.
- **Mesmo estilo nos três:** os quadros em `keyframes/` servem como imagem de
  referência de estilo.
- **Música contínua:** cada clipe gera um áudio diferente. Para ter uma música só
  no minuto inteiro, abaixe o áudio dos clipes e use `output/trilha-pomar.m4a`.
- **Texto com erro:** se alguma palavra sair escrita errada, gere de novo ou
  escreva o texto por cima na edição.

Prompt negativo (use nos três, se o campo existir):

```
people, hands, faces, live action, photorealistic, 3D render, glitches, flicker, warped or misspelled text, extra logos, watermark, emoji, characters with faces, fast cuts, camera shake, voice, narration, lyrics
```

---

## Prompt 1 · Campo e colheita (0:00 – 0:20)

**Parte A (gerar 10 s)**

```
2D flat vector motion graphics commercial for a fresh produce distributor, 16:9. Clean geometric shapes with soft two-tone shading, smooth fluid easing, slow continuous camera push-in, calm and premium mood. Palette: off-white background #F7F7F7, orange #FE6902, green #06A34E, dark green #04813F. A tiny orange dot appears in the center on a thin green horizon line that draws outward to both sides. The dot rises and grows into a large orange sun with soft peach halo rings, while three layers of rolling hills (pale mint, light green, green) glide up from the bottom. Small two-leaf sprouts pop up along the hills one by one and sway gently. At the top, the headline "Tudo começa no campo." rises word by word in a rounded geometric sans-serif, dark green with an orange period. Calm instrumental music only: soft felt piano, warm pad, gentle marimba. No voice, no narration, no people.
```

**Parte B (estender +10 s)**

```
Continue in the same flat vector style. The hills sink out of frame while the sun shrinks and glides onto the canopy of a round orchard tree that grows up from the ground; the background softens to pale mint #EAF6EE. Small green fruits pop onto the tree and ripen from green to golden to orange. Headline on the left in two lines: "Colhido no" in dark green and "ponto certo." in orange. Oranges drop one by one into a green perforated plastic produce crate with a soft bounce. End with a giant green leaf sweeping diagonally across the frame and covering everything in deep green #045C2E. Calm instrumental music only, no voice.
```

## Prompt 2 · Variedade e entrega (0:20 – 0:40)

**Parte A (gerar 10 s)**

```
2D flat vector motion graphics commercial, 16:9, clean geometric style with soft two-tone shading and smooth fluid easing. Deep green background #045C2E with a soft radial glow in the center. Centered white headline "Frutas, verduras e legumes" with a smaller mint subtitle "selecionados com cuidado". Flat illustrated produce (orange, red apple, banana, purple grapes, strawberry, lime, watermelon slice, tomato, carrot, broccoli, lettuce, yellow bell pepper, eggplant, avocado) spiral in and orbit slowly around the text on a wide tilted ellipse, front items larger, each one gently rotating. Near the end the orbit tightens and every item drops into a green perforated plastic crate in the center; the crate falls and a circular iris opens from the bottom onto a light mint sky. Calm instrumental music only, no voice, no people.
```

**Parte B (estender +10 s)**

```
Continue in the same flat vector style. Light mint sky, orange sun with a peach halo, small white clouds, soft green hills, a row of round trees and a dark gray road with white dashes. A side-view box truck with an orange cab and a plain off-white cargo box with a green and orange stripe (no text and no logo on the truck) receives a falling crate, bounces softly and drives to the right while the background scrolls in gentle parallax. Headline at the top: "Do pomar até você." Then the camera slides down to a minimal top-down city map in light greens: an orange route line draws from a hub pin to three green map pins labeled "Mercados", "Restaurantes" and "Hortifrútis", with an orange dot traveling along the route. Headline: "Cuidado em cada entrega." Calm instrumental music only, no voice.
```

## Prompt 3 · Valores e logo (0:40 – 1:00)

**Parte A (gerar 10 s)**

```
2D flat vector motion graphics commercial, 16:9, clean geometric style and smooth fluid easing. An orange dot swells until the whole frame is orange #FE6902, then shrinks back into an orange circle on an off-white background #F7F7F7. Two more circles pop in beside it with a soft bounce: green #06A34E and dark green #04813F. White line icons draw themselves inside the circles: a quality seal with a check mark, a leaf, and a clock whose hand spins once. Labels rise under each circle in dark green rounded sans-serif: "Qualidade", "Frescor", "Pontualidade". Everything floats gently. Calm instrumental music only, no voice, no people.
```

**Parte B (estender +10 s, com `keyframes/final-logo.png` como último quadro)**

```
Continue in the same style. The labels and icons fade, and the three circles glide to the center of the off-white background and resolve exactly into the brand logo from the reference image (orange circle, green crescent, green stem with two leaves). The logo then stays perfectly still and unchanged. Below it, the text "POMAR" in bold dark green with wide letter spacing, "DISTRIBUIDORA" in small orange with very wide letter spacing, and "Do pomar até você." in muted green appear softly. Very slow push-in, hold calmly until the end. Do not redraw, recolor or distort the logo. Calm instrumental music resolving softly, no voice.
```
