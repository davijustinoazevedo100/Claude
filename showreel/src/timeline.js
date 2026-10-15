// Single source of truth for timing, palette and scene layout.
// The whole reel sits on a 128 BPM grid: 32 beats = 15.000 s exactly.

export const W = 1920;
export const H = 1080;
export const FPS = 60;
export const DUR = 15;

export const BPM = 128;
export const BEAT = 60 / BPM; // 0.46875 s
export const b = (n) => n * BEAT; // beats -> seconds

export const PAL = {
  ink: '#0E0D0C',
  ink2: '#1B1917',
  paper: '#F3EEE6',
  white: '#FFFFFF',
  orange: '#FF5A1F',
  blue: '#2D4BFF',
  lime: '#D4F24A',
  pink: '#FFA9D0',
  grey: '#8C877F',
};

// Scene table. Scenes may overlap; later scenes draw on top.
export const SCENES = [
  { id: 's1', label: 'SQUASH & STRETCH', from: 0, to: b(4) },
  { id: 's2', label: 'KINETIC TYPE', from: b(4), to: b(10.25) },
  { id: 's3', label: 'SHAPE SYSTEMS', from: b(9.75), to: b(14) },
  { id: 's4', label: '3D / CGI', from: b(14), to: b(18) },
  { id: 's5', label: 'UI MOTION', from: b(18), to: b(22) },
  { id: 's6', label: 'GENERATIVE', from: b(22), to: b(25) },
  { id: 's7', label: 'RANGE', from: b(25), to: b(28) },
  { id: 's8', label: 'HELLO', from: b(28), to: DUR },
];

// HUD section labels switch on these beats.
export const SECTIONS = [
  { at: 0, n: '01', label: 'SQUASH & STRETCH' },
  { at: b(4), n: '02', label: 'KINETIC TYPE' },
  { at: b(10), n: '03', label: 'SHAPE SYSTEMS' },
  { at: b(14), n: '04', label: '3D / CGI' },
  { at: b(18), n: '05', label: 'UI MOTION' },
  { at: b(22), n: '06', label: 'GENERATIVE' },
  { at: b(25), n: '07', label: 'RANGE' },
  { at: b(28), n: '08', label: 'HELLO' },
];
