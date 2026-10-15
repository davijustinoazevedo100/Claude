// Raymarched metaballs (WebGL2). Glossy "candy" material in a procedural
// studio, analytic silhouette anti-aliasing, and a flat<->lit mix so a 2D
// circle can become a 3D sphere (and back) in a single match cut.

const VS = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform vec3 uCamPos;
uniform mat3 uCamRot;
uniform float uFocal;
uniform vec4 uBlobs[7];
uniform vec3 uCols[7];
uniform float uK;
uniform float uShade;
uniform vec3 uBgA;
uniform vec3 uBgB;
uniform vec3 uBgFlat;
uniform float uBgFlatMix;
uniform float uTime;
uniform float uFloor;
out vec4 frag;

float smin(float a, float b, float k){
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * h * k * (1.0 / 6.0);
}

float map(vec3 p){
  float d = 1e5;
  for (int i = 0; i < 7; i++){
    if (uBlobs[i].w <= 0.0) continue;
    float di = length(p - uBlobs[i].xyz) - uBlobs[i].w;
    d = smin(d, di, uK);
  }
  return d;
}

vec3 albedo(vec3 p){
  vec3 c = vec3(0.0); float ws = 0.0;
  for (int i = 0; i < 7; i++){
    if (uBlobs[i].w <= 0.0) continue;
    float di = length(p - uBlobs[i].xyz) - uBlobs[i].w;
    float w = exp(-max(di, 0.0) * 16.0);
    c += uCols[i] * w; ws += w;
  }
  return c / max(ws, 1e-5);
}

vec3 nrm(vec3 p){
  const vec2 k = vec2(1.0, -1.0);
  float h = 0.0012;
  return normalize(k.xyy * map(p + k.xyy * h) + k.yyx * map(p + k.yyx * h) +
                   k.yxy * map(p + k.yxy * h) + k.xxx * map(p + k.xxx * h));
}

float ao(vec3 p, vec3 n){
  float o = 0.0, s = 1.0;
  for (int i = 1; i <= 4; i++){
    float h = 0.04 * float(i);
    o += (h - map(p + n * h)) * s;
    s *= 0.7;
  }
  return clamp(1.0 - 2.2 * o, 0.0, 1.0);
}

float box(vec2 q, vec2 size, float soft){
  vec2 d = abs(q) - size;
  float e = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  return 1.0 - smoothstep(-soft, soft, e);
}

// Procedural photo studio: big overhead softbox, two strip lights, warm/cool kickers.
vec3 env(vec3 r){
  vec3 c = mix(vec3(0.006, 0.006, 0.009), vec3(0.035, 0.034, 0.042), smoothstep(-0.4, 0.9, r.y));
  // overhead softbox
  vec3 s = normalize(vec3(-0.35, 1.0, -0.55));
  float d = dot(r, s);
  if (d > 0.0){
    vec3 u = normalize(cross(s, vec3(0.0, 0.0, 1.0)));
    vec3 v = cross(u, s);
    vec2 q = vec2(dot(r, u), dot(r, v)) / d;
    c += vec3(1.0, 0.98, 0.95) * 5.0 * box(q, vec2(0.62, 0.38), 0.06);
  }
  // left strip (cool)
  vec3 s2 = normalize(vec3(-1.0, 0.15, 0.25));
  float d2 = dot(r, s2);
  if (d2 > 0.0){
    vec3 u = normalize(cross(s2, vec3(0.0, 1.0, 0.0)));
    vec2 q = vec2(dot(r, u), r.y - 0.15 * d2) / d2;
    c += vec3(0.55, 0.65, 1.0) * 3.0 * box(q, vec2(0.07, 0.9), 0.04);
  }
  // right strip (warm)
  vec3 s3 = normalize(vec3(1.0, 0.25, 0.1));
  float d3 = dot(r, s3);
  if (d3 > 0.0){
    vec3 u = normalize(cross(s3, vec3(0.0, 1.0, 0.0)));
    vec2 q = vec2(dot(r, u), r.y - 0.25 * d3) / d3;
    c += vec3(1.0, 0.55, 0.3) * 2.6 * box(q, vec2(0.09, 0.8), 0.05);
  }
  // floor bounce
  c += vec3(0.05, 0.03, 0.025) * smoothstep(0.0, -0.8, r.y);
  return c;
}

vec3 tone(vec3 x){
  // soft knee: linear below 0.7, smooth roll-off above (keeps flat colours exact)
  vec3 a = vec3(0.7);
  vec3 over = max(x - a, 0.0);
  return min(x, a) + (1.0 - a) * (1.0 - exp(-over / (1.0 - a)));
}

vec3 shade(vec3 p, vec3 n, vec3 rd){
  vec3 al = albedo(p);
  vec3 L = normalize(vec3(-0.45, 0.8, -0.5));
  float ndl = dot(n, L);
  float diff = clamp((ndl + 0.25) / 1.25, 0.0, 1.0);
  float occ = ao(p, n);
  vec3 amb = mix(vec3(0.05, 0.045, 0.05), vec3(0.16, 0.16, 0.19), n.y * 0.5 + 0.5);
  vec3 col = al * (diff * vec3(1.05, 1.0, 0.95) * 1.05 + amb) * occ;
  // subsurface-ish wrap: candy glow on the shadow side
  col += al * al * 0.22 * pow(clamp(1.0 - abs(ndl), 0.0, 1.0), 2.0);
  // rim kickers
  float rim = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 3.0);
  col += rim * (vec3(0.25, 0.35, 1.0) * smoothstep(0.2, -0.6, n.x) + vec3(1.0, 0.45, 0.2) * smoothstep(-0.2, 0.6, n.x)) * 0.55;
  // clear-coat reflection
  vec3 r = reflect(rd, n);
  float fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 5.0);
  col = mix(col, env(r), fres * 0.9);
  col += env(r) * 0.12 * occ;
  float spec = pow(max(dot(r, L), 0.0), 120.0);
  col += vec3(1.0) * spec * 1.4;
  return col;
}

vec3 background(vec2 uv){
  float r = length(uv - vec2(0.0, 0.08));
  vec3 c = mix(uBgA, uBgB, smoothstep(0.0, 1.05, r));
  c += vec3(1.0, 0.35, 0.12) * 0.035 * exp(-pow(length(uv - vec2(0.75, -0.42)), 2.0) * 3.0);
  c += vec3(0.18, 0.25, 1.0) * 0.04 * exp(-pow(length(uv - vec2(-0.8, 0.45)), 2.0) * 3.0);
  return c;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec3 rd = normalize(uCamRot * vec3(uv, uFocal));
  vec3 ro = uCamPos;
  float px = 1.0 / (uRes.y * uFocal);
  float t = 0.0, tmin = 0.0, dmin = 1e9;
  bool hit = false;
  for (int i = 0; i < 140; i++){
    vec3 p = ro + rd * t;
    float d = map(p);
    float rr = d / (t * px + 1e-5);
    if (rr < dmin){ dmin = rr; tmin = t; }
    if (d < 0.00035 * t){ hit = true; break; }
    t += d * 0.92;
    if (t > 16.0) break;
  }
  vec3 bg = mix(background(uv), uBgFlat, uBgFlatMix);
  vec3 col = bg;
  float cov = hit ? 1.0 : 1.0 - smoothstep(0.0, 1.25, dmin);
  if (cov > 0.0){
    float ts = hit ? t : tmin;
    vec3 p = ro + rd * ts;
    vec3 n = nrm(p);
    vec3 lit = tone(shade(p, n, rd));
    vec3 flat_ = albedo(p);
    vec3 c = mix(flat_, lit, uShade);
    col = mix(bg, c, cov);
  }
  // sRGB encode
  col = clamp(col, 0.0, 1.0);
  vec3 srgb = mix(col * 12.92, 1.055 * pow(col, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, col));
  frag = vec4(srgb, 1.0);
}`;

export class BlobGL {
  constructor(w, h) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    const gl = this.canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, alpha: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    this.prog = p;
    gl.useProgram(p);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.loc = {};
    for (const n of ['uRes', 'uCamPos', 'uCamRot', 'uFocal', 'uBlobs', 'uCols', 'uK', 'uShade', 'uBgA', 'uBgB', 'uBgFlat', 'uBgFlatMix', 'uTime', 'uFloor'])
      this.loc[n] = gl.getUniformLocation(p, n);
  }

  // u: { camPos:[3], camRot:Float32Array(9), focal, blobs:Float32Array(28), cols:Float32Array(21),
  //      k, shade, bgA:[3], bgB:[3], bgFlat:[3], bgFlatMix, time }
  render(u, vw, vh) {
    const gl = this.gl, L = this.loc;
    vw = Math.round(vw);
    vh = Math.round(vh);
    gl.viewport(0, 0, vw, vh);
    gl.uniform2f(L.uRes, vw, vh);
    gl.uniform3fv(L.uCamPos, u.camPos);
    gl.uniformMatrix3fv(L.uCamRot, false, u.camRot);
    gl.uniform1f(L.uFocal, u.focal);
    gl.uniform4fv(L.uBlobs, u.blobs);
    gl.uniform3fv(L.uCols, u.cols);
    gl.uniform1f(L.uK, u.k);
    gl.uniform1f(L.uShade, u.shade);
    gl.uniform3fv(L.uBgA, u.bgA);
    gl.uniform3fv(L.uBgB, u.bgB);
    gl.uniform3fv(L.uBgFlat, u.bgFlat);
    gl.uniform1f(L.uBgFlatMix, u.bgFlatMix);
    gl.uniform1f(L.uTime, u.time || 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return { canvas: this.canvas, sx: 0, sy: this.canvas.height - vh, w: vw, h: vh };
  }
}
