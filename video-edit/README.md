# Edição com motion graphics: "Sobrevivência ou Terror?"

Vídeo final: `output/devlog-dia1-motion.mp4` (1920x1080, 30 fps, H.264 + AAC, ~27,7 s).
Legendas separadas: `legendas.srt`.

## O que foi feito

| Tempo | Fala | Motion graphic |
|---|---|---|
| 0,0 – 1,0 s | (antes de falar) | Título de abertura "SOBREVIVÊNCIA ou TERROR?" sobre o fundo desfocado |
| 1,0 s | "Tudo bem?" | Mão acenando animada |
| 2,6 s | "meu nome é Pedro" | Lower-third "MEU NOME É / PEDRO" + zoom no rosto |
| 5,4 s | "primeiro dia" | Calendário "DIA 1" que voa para o canto e vira o selo "DIA 01 · DEVLOG" |
| 6,3 s | "tentando desenvolver um jogo" | Controle de videogame + barra "CRIANDO UM JOGO..." carregando |
| 8,5 – 11 s | "de sobrevivência ou de terror" | Cards de escolha (acampamento x zumbi) + "OU?" |
| 11,8 – 13,8 s | "esse lado de sobrevivência" | Kit de sobrevivência (barraca, fogueira animada, machado, mochila) **flutuando sobre a palma da mão**, que segue a mão quadro a quadro |
| 14,9 – 16,5 s | "esse outro lado de terror" | **Zumbi animado sobre a outra mão**, morcegos, brilho vermelho, tremida e "TERROR" |
| 17,2 s | "meu amigo já está fazendo um jogo de terror" | Card "MEU AMIGO / JÁ FAZ UM DE TERROR" |
| 21,8 s | "vamos fazer um de terror, claro!" | Carimbo "DECIDIDO: TERROR" com impacto |
| 24,6 s | "o nome dele é Davi" | Lower-third "O NOME DELE É / DAVI" |
| 25,5 – 27,7 s | — | Encerramento "CONTINUA... / DIA 2 EM BREVE" |

Também: legendas palavra por palavra (palavras-chave coloridas), correção de cor,
nitidez, vinheta, voz limpa e normalizada (−14,7 LUFS) e efeitos sonoros (whoosh, pop, impacto, sinos).

## Fontes dos materiais

- Emojis 3D animados (zumbi, morcego, caveira, aperto de mão etc.): Microsoft Fluent Emoji, versão animada em
  github.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis
- Fogo animado: Google Noto Animated Emoji
- Fontes: Google Fonts (Montserrat, Anton, Black Ops One, Creepster)
- Transcrição: Whisper medium (sherpa-onnx); rastreamento das mãos: MediaPipe Hand Landmarker
- Efeitos sonoros: sintetizados em `sfx.py`

## Como gerar de novo

```bash
# dentro de uma pasta de trabalho com input.mp4, assets/ e fonts/
python3 tools/track_hands.py input.mp4 hand_landmarker.task hands.json
ffmpeg -i input.mp4 -vn -af "highpass=f=80,afftdn=nf=-28,acompressor=threshold=-22dB:ratio=3:attack=5:release=90:makeup=2,loudnorm=I=-16:TP=-1.5:LRA=9" -ar 48000 -ac 2 voice.wav
python3 sfx.py voice.wav mix.wav 27.706
python3 edit.py render <pasta> saida.mp4
```
