# Edição com motion graphics: Devlog dia 2 ("o NPC")

Vídeo final: `../output/devlog-dia2-motion.mp4` (1920x1080, 30 fps, H.264 + AAC, ~81,6 s).
Legendas separadas: `legendas.srt`.

## Estrutura

1. **Gancho de abertura (0–3,4 s):** trecho de suspense do fim do vídeo ("ele vai... MORRER?!") em
   preto e branco avermelhado, com faixas de cinema, batimentos cardíacos, silhueta do boneco e glitch.
2. **Vinheta "DEVLOG · DIA 2" (3,4–5,8 s):** títulos batendo na tela, faíscas e zoom atravessando o título para dentro do vídeo.
3. **Vídeo completo com gráficos sincronizados a cada fala**
4. **Encerramento:** boneco recortado + "CONTINUA... / DIA 3 EM BREVE".

## Gráficos (tempo do vídeo original)

| Tempo | Fala | Motion graphic |
|---|---|---|
| 0,0 s | "Tudo bem?" | Mão acenando |
| 0,8 s | "meu nome é Pedro" | Nome em lower-third + zoom |
| 2,1 – 4,9 s | "tentando desenvolver jogos de terror" | Card "DESENVOLVENDO..." com barra de progresso que dá glitch e vira card de TERROR (fantasma + zumbi) |
| 5,2 – 7,5 s | "o de sobrevivência vai pra lá" | Card de sobrevivência leva um X vermelho e é arremessado para fora da tela |
| 9,1 – 10,9 s | "hoje é o dia 2" | Folha "1" do calendário é arrancada, mostra o "2" e voa até virar o selo "DIA 02 · DEVLOG" |
| 11,1 – 13,0 s | "eu tive muito tempo pra isso" | Relógio com ponteiros girando + ampulheta |
| 13,0 s | "Claramente." | Zoom cômico no rosto + emoji de deboche + scratch de disco |
| 16,8 – 18,9 s | "mais spoilers pra dar" | Fitas de isolamento "SPOILER" + sirene com luzes vermelho/azul |
| 19,5 – 25,8 s | "vai ter um NPC... meu brinquedo favorito" | Banner 8-bit "NOVO NPC DESBLOQUEADO!" digitado + card de personagem misterioso (silhueta do boneco) que vira "FAVORITO" com corações |
| 25,8 – 28,3 s | "eu brinco desde criança com ele" | Flashback em fita VHS (scanlines, ruído, "PLAY", contador) e a trilha fica abafada e "ondulada" |
| 29,4 – 32,9 s | "vou dar um cortezinho rápido" | Linha tracejada atravessa a tela, tesoura percorre a linha e, **no corte real do vídeo**, a imagem se parte em duas |
| 33,4 – 35,1 s | "isso é como mágica!" | Varinha, explosão de brilhos e "MÁGICA!" em degradê |
| 35,1 – 36,7 s | "voltei rápido, né?" | Linhas de velocidade estilo anime + raio |
| 36,9 – 39,5 s | "olha! esse carinha aqui" | "!" de alerta de videogame sobre o boneco, anel e holofote **seguindo o boneco** |
| 40,9 – 46 s | "meu primeiro brinquedo... tá até escrito em cima da cabeça dele" | **Placa de NPC flutuando em cima da cabeça do boneco** (rastreada quadro a quadro): "MEU PRIMEIRO BRINQUEDO", nível e barra de vida |
| 50 – 68,5 s | "NPC principal... vai estar com você... vai te perseguir... dicas..." | Ficha de personagem com o boneco recortado do vídeo; as habilidades aparecem conforme ele fala e a barra "jogo todo" enche |
| 63,6 – 66,8 s | "mas num momento ele vai..." | Suspense: faixas de cinema, imagem dessaturando, zoom lento, batimentos, a trilha para (tape stop) |
| 66,8 s | "MORRER!" | Impacto, tela vermelha, glitch, "MORRER!" gigante, barra de vida zera, X no retrato, "PLOT TWIST" |
| 71 – 72,5 s | "o jogo vai ficar bom" | 5 estrelas acendendo, joinha e confete |

Também: legendas palavra por palavra (palavras-chave coloridas), correção de cor, nitidez, vinheta,
grão de filme, câmera com zoom/tremidas nos momentos fortes centrada no rosto, voz limpa e normalizada,
trilha chiptune sintetizada (abaixa sozinha quando ele fala) e ~70 efeitos sonoros sintetizados.

## Fontes dos materiais

- Emojis animados: Google Noto Animated Emoji e Microsoft Fluent Emoji (versão animada em
  github.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis)
- Fontes: Google Fonts (Montserrat, Anton, Bungee, Creepster, Black Ops One, Press Start 2P)
- Transcrição: Whisper medium (texto) e Parakeet TDT 0.6b v3 (tempo de cada palavra), via sherpa-onnx
- Rosto: MediaPipe Face Detector; boneco: segmentação por cor (verde) com OpenCV
- Trilha e efeitos sonoros: sintetizados em `sfx.py`

## Como gerar de novo

```bash
# pasta de trabalho com input.mp4, assets/ (emojis + toy.png) e fonts/
ffmpeg -i input.mp4 -f rawvideo -pix_fmt bgr24 frames.u8
python3 tools/analyze.py input.mp4 blaze_face_short_range.tflite track.json
ffmpeg -i input.mp4 -vn -af "highpass=f=80,afftdn=nf=-28,acompressor=threshold=-22dB:ratio=3:attack=5:release=90:makeup=2,loudnorm=I=-16:TP=-1.5:LRA=9" -ar 48000 -ac 2 voice.wav
python3 sfx.py voice.wav mix.wav
python3 edit.py render <pasta> saida.mp4 4      # 4 processos em paralelo
```
