// Recurring typographic components, so every scene speaks the same language.
import { clamp, prog, ease, rgba } from './core.js';
import { FONT, font } from './config.js';
import { layoutText, drawGlyphs, clipRect } from './gfx.js';
import { scramble } from './hud.js';

// Scene caption: small index line + a phrase whose words rise out of a mask.
// tIn / tOut are local times; colour is the ink for the current background.
export function caption(ctx, lt, { index, phrase, tIn = 0.2, tOut = 99, color, x = 120, y = 968, size = 54 }) {
  if (lt < tIn - 0.01) return;
  const words = phrase.split(' ');
  const space = size * 0.26;
  let cx = x;
  const outP = (i) => ease.inExpo(prog(lt, tOut + i * 0.035, tOut + 0.42 + i * 0.035));
  ctx.save();
  indexTag(ctx, lt, tIn, tOut, index, color, x, y - size - 34);
  for (let i = 0; i < words.length; i++) {
    const L = layoutText(ctx, words[i], 600, size, -size * 0.02);
    const pin = ease.outExpo(prog(lt, tIn + 0.08 + i * 0.06, tIn + 0.88 + i * 0.06));
    const pout = outP(i);
    const dy = (1 - pin) * size * 1.25 - pout * size * 1.25;
    ctx.save();
    clipRect(ctx, cx - 10, y - size * 1.12, L.width + 30, size * 1.42);
    drawGlyphs(ctx, L, cx, y + dy, color);
    ctx.restore();
    cx += L.width + space;
  }
  ctx.restore();
}

// Tiny mono label, decoded in over `dur` seconds.
export function label(ctx, str, x, y, lt, tIn, { color, size = 14, align = 'left', alpha = 0.85, dur = 0.5, tracking = 2.5, weight = 500 } = {}) {
  const p = prog(lt, tIn, tIn + dur);
  if (p <= 0) return;
  ctx.save();
  ctx.font = font(weight, size, FONT.mono);
  ctx.letterSpacing = `${tracking}px`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = rgba(color, alpha * clamp(p * 3));
  ctx.fillText(scramble(str, p, Math.floor(lt * 60) + str.length), x, y);
  ctx.restore();
}

// The short rule + decoded index that sits above every caption.
export function indexTag(ctx, lt, tIn, tOut, index, color, x, y) {
  const lp = ease.outExpo(prog(lt, tIn, tIn + 0.5));
  const lo = 1 - prog(lt, tOut, tOut + 0.3);
  if (lp <= 0 || lo <= 0) return;
  ctx.save();
  ctx.fillStyle = rgba(color, 0.9 * lo);
  ctx.fillRect(x, y, 28 * lp, 2);
  ctx.font = font(500, 14, FONT.mono);
  ctx.letterSpacing = '3px';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(scramble(index, prog(lt, tIn + 0.1, tIn + 0.6), Math.floor(lt * 60)), x + 42, y + 1);
  ctx.restore();
}
