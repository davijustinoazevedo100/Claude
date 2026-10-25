// placeholder
import { PAL } from '../config.js';
export default {
  draw(ctx, t, lt, env) {
    env.fill(ctx, PAL.dark);
    ctx.fillStyle = PAL.paper;
    ctx.font = '700 80px "Inter Display"';
    ctx.fillText('s2_timing ' + lt.toFixed(2), 200, 540);
  },
};
