#version 450
#include "common.glsl"
layout(binding = 1) uniform sampler2D gbuffer;
layout(binding = 2) uniform sampler2D thicknessTex;
layout(binding = 3) uniform sampler2D sceneColor;
layout(binding = 4) uniform sampler2D sceneDepth;
layout(binding = 5) uniform sampler2D foamTex;
layout(binding = 6) uniform sampler2D materialTex;
layout(std430, binding = 7) readonly buffer ViewState { vec4 viewState; };
layout(push_constant) uniform Push { float filterMat; } pc;
layout(location = 0) out vec4 outColor;

const float PI = 3.14159265;

float linearDepth(float device) {
    vec4 v = G.invProj * vec4(0.0, 0.0, device, 1.0);
    return -v.z / v.w;
}

vec3 viewPosAt(vec2 uv, float dist) {
    vec4 v = G.invProj * vec4(uv * 2.0 - 1.0, 0.5, 1.0);
    vec3 dir = v.xyz / v.w;
    return dir * (dist / -dir.z);
}

float pixelFootprint(float dist) {
    return 2.0 * dist / max(G.proj[1][1] * G.screen.y, 1e-4);
}

vec3 skyColor(vec3 dirWorld) {
    float t = dirWorld.y;
    vec3 horizon = G.fogColor.rgb;
    vec3 zenith = G.skyColor.rgb;
    if (t >= 0.0) {
        return mix(horizon, zenith, smoothstep(0.0, 0.45, t));
    }
    return horizon * mix(0.9, 0.35, smoothstep(0.0, 0.35, -t));
}

vec3 traceReflection(vec3 origin, vec3 R, out float hit) {
    hit = 0.0;
    vec3 pos = origin;
    float stepLen = 0.15;
    for (int i = 0; i < 48; i++) {
        pos += R * stepLen;
        stepLen *= 1.1;
        vec4 clip = G.proj * vec4(pos, 1.0);
        if (clip.w <= 0.0) {
            break;
        }
        vec2 suv = clip.xy / clip.w * 0.5 + 0.5;
        if (any(lessThan(suv, vec2(0.0))) || any(greaterThan(suv, vec2(1.0)))) {
            break;
        }
        float sceneDist = linearDepth(texture(sceneDepth, suv).r);
        float rayDist = -pos.z;
        if (rayDist > sceneDist && rayDist - sceneDist < stepLen * 2.0 + 0.25) {
            vec2 edge = smoothstep(vec2(0.0), vec2(0.08), suv) * (1.0 - smoothstep(vec2(0.92), vec2(1.0), suv));
            hit = edge.x * edge.y;
            return texture(sceneColor, suv).rgb;
        }
    }
    return vec3(0.0);
}

const vec2 RIPPLE_DIR[5] = vec2[](vec2(0.94, 0.34), vec2(-0.42, 0.91), vec2(0.71, -0.70), vec2(-0.86, -0.51), vec2(0.21, 0.98));
const float RIPPLE_FREQ[5] = float[](1.0, 1.93, 3.57, 6.41, 11.7);
const float RIPPLE_WEIGHT[5] = float[](0.357, 0.250, 0.179, 0.125, 0.089);

vec2 rippleGradient(vec2 p, float t, float footprint) {
    vec2 g = vec2(0.0);
    vec2 q = p;
    for (int i = 0; i < 5; i++) {
        float lambda = 6.2831853 / RIPPLE_FREQ[i];
        float fade = smoothstep(1.5, 4.0, lambda / max(footprint, 1e-5));
        if (fade <= 0.0) {
            break;
        }
        float phase = dot(q, RIPPLE_DIR[i]) * RIPPLE_FREQ[i] + t * (0.8 + 0.3 * float(i));
        g += RIPPLE_DIR[i] * (RIPPLE_WEIGHT[i] * fade * cos(phase));
        q += RIPPLE_DIR[i].yx * (RIPPLE_WEIGHT[i] / RIPPLE_FREQ[i] * sin(phase) * 0.6);
    }
    return g;
}

vec3 rippleNormal(vec3 nView, vec3 viewPos, float footprint) {
    if (G.shadeA.x <= 0.0) {
        return nView;
    }
    vec3 nWorld = normalize(mat3(G.invView) * nView);
    vec3 world = G.misc.yzw + (G.invView * vec4(viewPos, 0.0)).xyz;
    float scale = max(G.shadeA.y, 1e-3);
    vec2 grad = rippleGradient(world.xz * scale, G.simB.z * G.shadeA.z, footprint * scale);
    vec3 g = vec3(grad.x, 0.0, grad.y) * G.shadeA.x;
    return normalize(mat3(G.view) * normalize(nWorld - (g - nWorld * dot(g, nWorld))));
}

vec3 sunSpecular(vec3 n, vec3 V, float footprint) {
    vec3 L = normalize(G.sunDir.xyz);
    float NoL = dot(n, L);
    if (NoL <= 0.0 || G.sunDir.w <= 0.0) {
        return vec3(0.0);
    }
    vec3 H = normalize(L + V);
    float NoH = max(dot(n, H), 0.0);
    float NoV = max(dot(n, V), 1e-3);
    float rough = clamp(G.shadeA.w + footprint * 0.25, 0.02, 0.7);
    float a2 = rough * rough * rough * rough;
    float den = NoH * NoH * (a2 - 1.0) + 1.0;
    float D = a2 / max(PI * den * den, 1e-9);
    float F = 0.02 + 0.98 * pow(1.0 - max(dot(V, H), 0.0), 5.0);
    float k = rough * rough * 0.5;
    float Vis = 0.5 / max(NoL * (NoV * (1.0 - k) + k) + NoV * (NoL * (1.0 - k) + k), 1e-5);
    return vec3(1.0, 0.96, 0.88) * min(D * Vis * F * NoL * G.shadeB.x, 30.0) * G.sunDir.w;
}

// ---- lava: a cooled crust torn into streaks along the flow, hot glowing channels between them ----

float cellRand(ivec2 c) {
    return float(hash(uint(c.x) * 73856093u ^ uint(c.y) * 19349663u) >> 8) * (1.0 / 16777216.0);
}

// Value noise with its gradient: (value, d/dx, d/dy).
vec3 valueNoise(vec2 p) {
    ivec2 i = ivec2(floor(p));
    vec2 f = p - vec2(i);
    vec2 u = f * f * (3.0 - 2.0 * f);
    vec2 du = 6.0 * f * (1.0 - f);
    float a = cellRand(i);
    float b = cellRand(i + ivec2(1, 0));
    float c = cellRand(i + ivec2(0, 1));
    float d = cellRand(i + ivec2(1, 1));
    float k = a - b - c + d;
    return vec3(a + (b - a) * u.x + (c - a) * u.y + k * u.x * u.y, du.x * (b - a + k * u.y), du.y * (c - a + k * u.x));
}

// Noise squeezed across the flow (q.x) and stretched along it (q.y); octaves finer than a few pixels fade to their mean.
vec3 streakNoise(vec2 q, float footprint) {
    vec3 sum = vec3(0.0);
    float amp = 0.55;
    float norm = 0.0;
    vec2 scale = vec2(4.5, 0.3);
    vec2 offset = vec2(0.0);
    for (int k = 0; k < 3; k++) {
        float fade = smoothstep(1.5, 4.0, 1.0 / (scale.x * max(footprint, 1e-5)));
        vec3 n = valueNoise(q * scale + offset);
        sum += amp * mix(vec3(0.5, 0.0, 0.0), vec3(n.x, n.yz * scale), fade);
        norm += amp;
        amp *= 0.5;
        scale *= 2.0;
        offset += vec2(13.7, 41.3);
    }
    return sum / norm;
}

// The streak pattern at world point W for a surface with normal n flowing along d (b = across). Frames are anchored on
// a lattice so turning flow can't swirl the pattern far away, blended with variance-preserving weights; two phases
// slide it downstream at the flow speed and take turns resetting (a flow map). Returns value and world gradient.
vec4 lavaPattern(vec3 W, vec3 n, vec3 d, vec3 b, float speed, float t, float footprint) {
    vec3 an = abs(n);
    int k = an.x > an.y ? (an.x > an.z ? 0 : 2) : (an.y > an.z ? 1 : 2);
    int ia = k == 0 ? 1 : 0;
    int ib = k == 2 ? 1 : 2;
    const float SPACING = 1.5;
    const float PERIOD = 3.0;
    vec2 g = vec2(W[ia], W[ib]) / SPACING;
    ivec2 g0 = ivec2(floor(g));
    vec2 f = g - vec2(g0);
    float value = 0.0;
    vec3 grad = vec3(0.0);
    float w2 = 0.0;
    for (int phase = 0; phase < 2; phase++) {
        float cycle = t / PERIOD + 0.5 * float(phase);
        float ph = fract(cycle);
        float wp = 1.0 - abs(2.0 * ph - 1.0);
        float shift = speed * (ph - 0.5) * PERIOD;
        uint cycleSeed = uint(int(floor(cycle))) * 2654435761u + uint(phase) * 97u;
        for (int c = 0; c < 4; c++) {
            ivec2 cell = g0 + ivec2(c & 1, c >> 1);
            vec2 cw = mix(1.0 - f, f, vec2(c & 1, c >> 1));
            float w = wp * cw.x * cw.y;
            vec3 L = W;
            L[ia] = float(cell.x) * SPACING;
            L[ib] = float(cell.y) * SPACING;
            vec3 Q = W - L;
            uint s = hash(uint(cell.x) * 73856093u ^ uint(cell.y) * 19349663u ^ cycleSeed);
            vec2 jitter = vec2(float(s & 0xFFFFu), float(s >> 16)) * (61.0 / 65536.0);
            vec3 sn = streakNoise(vec2(dot(Q, b), dot(Q, d) - shift) + jitter, footprint);
            value += w * sn.x;
            grad += w * (sn.y * b + sn.z * d);
            w2 += w * w;
        }
    }
    float inv = inversesqrt(max(w2, 1e-4));
    return vec4(clamp(0.5 + (value - 0.5) * inv, 0.0, 1.0), grad * inv);
}

vec3 lavaRamp(float x) {
    const vec3 C0 = vec3(0.46, 0.10, 0.02);
    const vec3 C1 = vec3(0.76, 0.24, 0.03);
    const vec3 C2 = vec3(0.98, 0.45, 0.05);
    const vec3 C3 = vec3(1.00, 0.68, 0.14);
    const vec3 C4 = vec3(1.00, 0.87, 0.40);
    x = clamp(x, 0.0, 1.0) * 4.0;
    return x < 1.0 ? mix(C0, C1, x) : x < 2.0 ? mix(C1, C2, x - 1.0) : x < 3.0 ? mix(C2, C3, x - 2.0) : mix(C3, C4, x - 3.0);
}

vec3 shadeAboveLava(vec2 uv, vec3 n, float fd, float ambient, vec3 flow) {
    vec3 P = viewPosAt(uv, fd);
    vec3 V = normalize(-P);
    n = dot(n, V) < 0.0 ? -n : n;
    float footprint = pixelFootprint(fd);
    vec3 nW = normalize(mat3(G.invView) * n);
    vec3 W = G.misc.yzw + (G.invView * vec4(P, 0.0)).xyz;

    // Flow in the surface plane; a still pool falls back to the downhill (or a fixed) direction.
    vec3 ft = flow - nW * dot(flow, nW);
    float speed = length(ft);
    vec3 rest = vec3(0.0, -1.0, 0.0) + nW * nW.y;
    if (dot(rest, rest) < 1e-3) {
        rest = vec3(0.8, 0.0, 0.6) - nW * dot(vec3(0.8, 0.0, 0.6), nW);
    }
    vec3 d = normalize(ft + normalize(rest) * 0.08);
    vec3 b = normalize(cross(nW, d));
    d = cross(b, nW);
    vec4 pat = lavaPattern(W, nW, d, b, speed, G.simB.z, footprint);

    float path = max(texture(thicknessTex, uv).r, 0.0);
    float thin = 1.0 - smoothstep(0.03, 0.3, path);
    float heat = clamp(speed * 0.18, 0.0, 0.3) + 0.3 * thin;
    float x = smoothstep(0.3, 0.7, pat.x) * 0.8 + 0.08 + heat;
    vec3 color = lavaRamp(x);

    // Relief: the crust ridges tilt the surface; their sunny sides brighten and the grooves fall into shade.
    vec3 bumped = normalize(nW - 0.3 * pat.yzw);
    vec3 nV = normalize(mat3(G.view) * bumped);
    float relief = dot(bumped - nW, normalize(mat3(G.invView) * G.sunDir.xyz));
    color *= clamp(1.0 + 0.9 * relief, 0.7, 1.25);
    float fresnel = pow(1.0 - clamp(dot(nV, V), 0.0, 1.0), 3.0);
    color += lavaRamp(x + 0.25) * fresnel * 0.35;
    color += sunSpecular(nV, V, footprint) * vec3(1.0, 0.7, 0.4) * (0.25 + 0.5 * (1.0 - clamp(x, 0.0, 1.0)));
    return color * (0.9 + 0.1 * ambient);
}

// ---- slime: a clear green jelly, coloured by the light it scatters on the way through ----

vec3 shadeAboveSlime(vec2 uv, vec3 n, float fd, float ambient) {
    vec3 P = viewPosAt(uv, fd);
    vec3 V = normalize(-P);
    n = dot(n, V) < 0.0 ? -n : n;
    float footprint = pixelFootprint(fd);
    float thickness = max(texture(thicknessTex, uv).r, 0.0);
    vec2 offset = n.xy * G.waterA.z * clamp(thickness, 0.0, 1.5) / max(fd, 1.0);
    vec2 ruv = clamp(uv + offset, vec2(0.0), vec2(1.0));
    if (linearDepth(texture(sceneDepth, ruv).r) < fd) {
        ruv = uv;
    }
    float path = thickness * G.waterA.y;
    vec3 under = texture(sceneColor, ruv).rgb;
    vec3 transmitted = under * exp(-G.absorb.rgb * path);
    // Light scattered inside the gel: brighter on the side facing the sun, deeper green where it is thick.
    vec3 L = normalize(G.sunDir.xyz);
    float wrapLit = clamp(dot(n, L) * 0.5 + 0.5, 0.0, 1.0) * G.sunDir.w;
    vec3 body = G.scatter.rgb * (0.3 * ambient + 0.25 + 0.75 * wrapLit);
    vec3 scattered = body * (1.0 - exp(-G.scatter.w * path));
    float rim = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 2.0);
    vec3 jelly = transmitted + scattered + G.scatter.rgb * vec3(1.2, 1.0, 1.4) * rim * 0.35 * (0.4 + 0.6 * ambient);

    vec3 Rv = reflect(-V, n);
    vec3 Rw = (G.invView * vec4(Rv, 0.0)).xyz;
    float hit;
    vec3 ssr = traceReflection(P + n * 0.05, Rv, hit);
    vec3 reflection = mix(skyColor(Rw), ssr, hit);
    float F = 0.03 + 0.97 * pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 5.0);
    return mix(jelly, reflection, F * 0.7) + sunSpecular(n, V, footprint);
}

vec3 shadeAboveWater(vec2 uv, vec3 n, float fd, float sceneDist, float ambient) {
    vec3 P = viewPosAt(uv, fd);
    vec3 V = normalize(-P);
    n = dot(n, V) < 0.0 ? -n : n;
    float footprint = pixelFootprint(fd);
    float thickness = max(texture(thicknessTex, uv).r, 0.0);
    vec3 upV = normalize(mat3(G.view) * vec3(0.0, 1.0, 0.0));
    float vertical = thickness * abs(dot(V, upV));
    float film = 1.0 - smoothstep(0.02, max(G.shadeB.z, 0.03), vertical);
    n = normalize(mix(n, upV, film * 0.9));
    vec3 wrinkled = rippleNormal(n, P, footprint);
    n = normalize(mix(n, wrinkled, smoothstep(0.0, 0.15, dot(wrinkled, V))));

    vec2 offset = n.xy * G.waterA.z * clamp(thickness, 0.0, 2.0) / max(fd, 1.0);
    vec2 ruv = clamp(uv + offset, vec2(0.0), vec2(1.0));
    float refrDist = linearDepth(texture(sceneDepth, ruv).r);
    float path = max(texture(thicknessTex, ruv).r, 0.0);
    if (refrDist < fd) {
        ruv = uv;
        path = thickness;
    }
    path *= G.waterA.y;
    vec3 under = texture(sceneColor, ruv).rgb;
    float wet = G.shadeB.y * smoothstep(0.0, 0.03, path);
    under = pow(max(under, vec3(0.0)), vec3(1.0 + wet)) * (1.0 - 0.15 * wet);
    vec3 transmitted = under * exp(-G.absorb.rgb * path);
    vec3 scattered = G.scatter.rgb * ambient * (1.0 - exp(-G.scatter.w * path));
    vec3 water = transmitted + scattered;

    vec3 Rv = reflect(-V, n);
    vec3 Rw = (G.invView * vec4(Rv, 0.0)).xyz;
    float hit;
    vec3 ssr = traceReflection(P + n * 0.05, Rv, hit);
    vec3 reflection = mix(skyColor(Rw), ssr, hit);
    float F = 0.02 + 0.98 * pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 5.0);
    return mix(water, reflection, F) + sunSpecular(n, V, footprint);
}

// Distance to the nearest Voronoi cell wall (f2 - f1) at q, for bubble rims.
float bubbleWalls(vec2 q, uint salt) {
    ivec2 cell = ivec2(floor(q));
    float f1 = 9.0;
    float f2 = 9.0;
    for (int k = 0; k < 9; k++) {
        ivec2 c = cell + ivec2(k % 3 - 1, k / 3 - 1);
        uint s = hash(uint(c.x) * 73856093u ^ uint(c.y) * 19349663u ^ salt);
        vec2 feature = vec2(c) + 0.1 + 0.8 * vec2(rand(s), rand(s));
        float d = length(q - feature);
        if (d < f1) {
            f2 = f1;
            f1 = d;
        } else if (d < f2) {
            f2 = d;
        }
    }
    return f2 - f1;
}

// Foam texture: big and small bubbles whose rims thicken with foam density until the patch is solid white.
float foamTexture(vec2 p, float density, float footprint) {
    // Foam gathers in islands and streaks with clearer water between them.
    float patches = valueNoise(p * 0.8).x * 0.6 + valueNoise(p * 2.3 + vec2(31.7, 11.3)).x * 0.4;
    patches = smoothstep(0.25, 0.75, patches);
    density = clamp(density * (0.25 + 1.2 * patches), 0.0, 1.0);
    float size = max(G.shadeB.w, 1e-3);
    float rimBig = 1.0 - smoothstep(0.0, 0.04 + 0.32 * density * density, bubbleWalls(p / size, 0u));
    float rimSmall = 1.0 - smoothstep(0.0, 0.06 + 0.4 * density * density, bubbleWalls(p / (size * 0.38), 0x5bd1e995u));
    float lace = max(rimBig, 0.8 * rimSmall);
    float detail = smoothstep(0.7, 2.5, size * 0.38 / max(footprint, 1e-5));
    return mix(0.3 + 0.45 * density, lace, detail) * (0.35 + 0.75 * patches);
}

// The foam texture drifts with the surface current: two phases slide downstream and take turns resetting.
float foamLace(vec2 p, vec2 flow, float density, float footprint) {
    const float PERIOD = 4.0;
    float t = G.simB.z;
    float sum = 0.0;
    for (int phase = 0; phase < 2; phase++) {
        float cycle = t / PERIOD + 0.5 * float(phase);
        float ph = fract(cycle);
        float w = 1.0 - abs(2.0 * ph - 1.0);
        vec2 jitter = vec2(float(int(floor(cycle)) % 64) * 7.31, float(phase) * 13.7);
        sum += w * foamTexture(p - flow * (ph - 0.5) * PERIOD + jitter, density, footprint);
    }
    return sum;
}

// ---- ice: frozen water, milky white-blue inside, cracked, with a crisp glossy surface ----

vec3 shadeAboveIce(vec2 uv, vec3 n, float fd, float ambient) {
    vec3 P = viewPosAt(uv, fd);
    vec3 V = normalize(-P);
    n = dot(n, V) < 0.0 ? -n : n;
    float footprint = pixelFootprint(fd);
    vec3 nW = normalize(mat3(G.invView) * n);
    vec3 W = G.misc.yzw + (G.invView * vec4(P, 0.0)).xyz;
    vec3 an = abs(nW);
    vec2 q = an.y > max(an.x, an.z) ? W.xz : (an.x > an.z ? W.zy : W.xy);

    // Frost: a slightly uneven surface; cracks: big and small Voronoi walls.
    vec3 bump = valueNoise(q * 7.0);
    vec3 frostN = normalize(nW + 0.08 * vec3(bump.y, 0.0, bump.z));
    vec3 nV = normalize(mat3(G.view) * frostN);
    float detail = smoothstep(0.7, 2.5, 0.12 / max(footprint, 1e-5));
    float cracks = (1.0 - smoothstep(0.0, 0.03, bubbleWalls(q * 1.4, 0x9e3779b9u))) * 0.8
        + (1.0 - smoothstep(0.0, 0.025, bubbleWalls(q * 3.9 + 17.0, 0x7f4a7c15u))) * 0.35;
    cracks = clamp(cracks, 0.0, 1.0) * detail;

    float thickness = max(texture(thicknessTex, uv).r, 0.0);
    float path = thickness * G.waterA.y;
    vec2 ruv = clamp(uv + nV.xy * 0.02 * clamp(thickness, 0.0, 1.5) / max(fd, 1.0), vec2(0.0), vec2(1.0));
    if (linearDepth(texture(sceneDepth, ruv).r) < fd) {
        ruv = uv;
    }
    vec3 under = texture(sceneColor, ruv).rgb;
    vec3 transmitted = under * exp(-vec3(1.25, 0.5, 0.2) * path);
    float lit = clamp(dot(nV, normalize(G.sunDir.xyz)) * 0.5 + 0.5, 0.0, 1.0) * G.sunDir.w;
    vec3 frost = vec3(0.66, 0.84, 1.0) * (0.3 + 0.35 * ambient + 0.45 * lit);
    float cloud = 1.0 - exp(-1.2 * path - 0.15);
    vec3 ice = transmitted * (1.0 - 0.8 * cloud) + frost * cloud;
    ice = mix(ice, vec3(0.92, 0.97, 1.0) * (0.55 + 0.45 * ambient), cracks * 0.55);

    vec3 Rv = reflect(-V, nV);
    vec3 Rw = (G.invView * vec4(Rv, 0.0)).xyz;
    float hit;
    vec3 ssr = traceReflection(P + nV * 0.05, Rv, hit);
    vec3 reflection = mix(skyColor(Rw), ssr, hit);
    float F = 0.03 + 0.97 * pow(1.0 - clamp(dot(nV, V), 0.0, 1.0), 5.0);
    return mix(ice, reflection, F * 0.8) + sunSpecular(nV, V, footprint) * 1.3;
}

vec3 shadeSurfaceFromBelow(vec2 uv, vec3 n, float fd, vec3 deep) {
    vec3 P = viewPosAt(uv, fd);
    vec3 V = normalize(-P);
    n = dot(n, V) < 0.0 ? -n : n;
    vec3 wrinkled = rippleNormal(n, P, pixelFootprint(fd));
    n = normalize(mix(n, wrinkled, smoothstep(0.0, 0.15, dot(wrinkled, V))));
    float cosI = clamp(dot(n, V), 0.0, 1.0);
    const float ETA = 1.333;
    float sinT2 = ETA * ETA * (1.0 - cosI * cosI);
    if (sinT2 >= 1.0) {
        return deep * 1.4;
    }
    float cosT = sqrt(1.0 - sinT2);
    float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
    vec2 ruv = clamp(uv - n.xy * G.waterA.z * 0.6, vec2(0.0), vec2(1.0));
    vec3 above = texture(sceneColor, ruv).rgb;
    return mix(above, deep * 1.4, F);
}

void main() {
    vec2 uv = gl_FragCoord.xy * G.screen.zw;
    vec4 g = texture(gbuffer, uv);
    float fd = g.w;
    vec4 mat = texture(materialTex, uv);
    float matId = mat.r;
    bool lavaPass = abs(pc.filterMat - 2.0) < 0.5;
    bool slimePass = abs(pc.filterMat - 3.0) < 0.5;
    bool waterPass = !lavaPass && !slimePass;
    vec4 foam = waterPass ? texture(foamTex, uv) : vec4(0.0);
    float sceneDev = texture(sceneDepth, uv).r;
    float sceneDist = linearDepth(sceneDev);
    bool hasFluid = fd > 0.0 && fd < sceneDist;
    bool underwater = viewState.x > 0.5 && !slimePass;
    bool matTagged = matId >= -0.5;
    bool icy = waterPass && hasFluid && matTagged && abs(matId - ICE_MAT) < 0.08;
    if (hasFluid && matTagged) {
        if (abs(matId - pc.filterMat) > 0.25) {
            discard;
        }
    } else if (!waterPass) {
        discard;
    }
    if (!hasFluid && foam.a < 1e-3 && !underwater) {
        discard;
    }
    float ambient = G.skyColor.w;
    vec3 color = texture(sceneColor, uv).rgb;
    float outDepth = sceneDev;

    if (underwater) {
        vec3 deep = lavaPass ? G.scatter.rgb * (1.2 + ambient) : G.scatter.rgb * ambient;
        float visible = min(sceneDist, 160.0);
        if (hasFluid) {
            color = lavaPass ? deep * 1.35 : shadeSurfaceFromBelow(uv, g.xyz, fd, deep);
            visible = fd;
            vec4 clip = G.proj * vec4(viewPosAt(uv, fd), 1.0);
            outDepth = clip.z / clip.w;
        }
        float fog = G.scatter.w * G.misc.x;
        color = color * exp(-G.absorb.rgb * visible * G.misc.x) + deep * (1.0 - exp(-fog * visible));
    } else if (hasFluid) {
        color = lavaPass ? shadeAboveLava(uv, g.xyz, fd, ambient, mat.gba)
            : slimePass ? shadeAboveSlime(uv, g.xyz, fd, ambient)
            : icy ? shadeAboveIce(uv, g.xyz, fd, ambient) : shadeAboveWater(uv, g.xyz, fd, sceneDist, ambient);
        vec4 clip = G.proj * vec4(viewPosAt(uv, fd), 1.0);
        outDepth = clip.z / clip.w;
    }

    if (foam.a > 1e-4) {
        vec3 foamColor = foam.rgb / foam.a;
        float density = 1.0 - exp(-foam.a * G.foamA.y);
        float coverage = min(density, 0.9);
        float light = mix(0.25, 1.0, ambient);
        if (hasFluid && !underwater) {
            vec3 P = viewPosAt(uv, fd);
            vec3 world = G.misc.yzw + (G.invView * vec4(P, 0.0)).xyz;
            coverage *= foamLace(world.xz, mat.ga, density, pixelFootprint(fd));
            // Foam is a rough white layer: lit by the sun on top of the sky light.
            float sun = max(dot(normalize(g.xyz), normalize(G.sunDir.xyz)), 0.0) * G.sunDir.w;
            light = mix(0.3, 0.85, ambient) + 0.3 * sun;
        }
        color = mix(color, foamColor * light, coverage);
    }

    outColor = vec4(color, 1.0);
    gl_FragDepth = outDepth;
}
