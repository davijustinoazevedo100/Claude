// Global spec of the piece: format, tempo, palette, type and the scene map.

export const W = 1920;
export const H = 1080;
export const FPS = 60;
export const BPM = 120;
export const BEAT = 60 / BPM; // 0.5 s
export const BAR = BEAT * 4; // 2 s
export const DURATION = 48;
export const FRAMES = DURATION * FPS;

// Shutter for the accumulated motion blur, as a fraction of a frame (0.5 = 180 deg).
export const SHUTTER = 0.5;

export const PAL = {
  dark: '#0E0E11',
  night: '#08080A',
  paper: '#F3EEE6',
  ink: '#121215',
  coral: '#FF5A36',
  blue: '#2F4BFF',
  yellow: '#FFC83D',
  mint: '#16C79A',
  gray: '#8B8A93',
  lilac: '#A78BFA',
};

export const FONT = {
  display: 'Inter Display',
  text: 'Inter',
  mono: 'DejaVu Sans Mono',
};

export const font = (weight, size, family = FONT.display) => `${weight} ${size}px "${family}"`;

// Scene map. Each scene owns [start, end) and hands its last frame to the next
// one as a match cut, so the piece reads as one continuous shot.
export const SCENES = [
  { id: 's0', file: 's0_ponto.js', index: '01', name: 'PONTO', start: 0, end: 4 },
  { id: 's1', file: 's1_tipografia.js', index: '02', name: 'TIPOGRAFIA', start: 4, end: 10 },
  { id: 's2', file: 's2_timing.js', index: '03', name: 'TIMING', start: 10, end: 16 },
  { id: 's3', file: 's3_forma.js', index: '04', name: 'FORMA', start: 16, end: 22 },
  { id: 's4', file: 's4_particulas.js', index: '05', name: 'PARTÍCULAS', start: 22, end: 28 },
  { id: 's5', file: 's5_profundidade.js', index: '06', name: 'PROFUNDIDADE', start: 28, end: 34 },
  { id: 's6', file: 's6_dados.js', index: '07', name: 'DADOS', start: 34, end: 40 },
  { id: 's7', file: 's7_assinatura.js', index: '08', name: 'ASSINATURA', start: 40, end: 48 },
];

// Hits that shake the camera and split the colour channels for a moment.
export const IMPACTS = [
  { t: 4.0, amp: 10, ca: 6 },
  { t: 10.0, amp: 6, ca: 4 },
  { t: 16.0, amp: 5, ca: 3 },
  { t: 22.0, amp: 9, ca: 6 },
  { t: 28.0, amp: 16, ca: 10 },
  { t: 34.0, amp: 6, ca: 4 },
  { t: 42.0, amp: 7, ca: 5 },
];
