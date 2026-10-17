#version 450
#include "common.glsl"
layout(std430, binding = 3) readonly buffer ViewState { vec4 viewState; };
layout(std430, binding = 4) readonly buffer Vel { float vel[]; };
layout(std430, binding = 5) readonly buffer IceCount { int iceCount[]; };
#include "gridsample.glsl"
layout(location = 0) in vec3 vView;
layout(location = 1) in vec3 vNormal;
layout(location = 2) in float vWall;
layout(location = 3) in vec3 vGrid;
layout(location = 0) out vec4 outG;
layout(location = 1) out vec4 outMat;

bool icyAt(vec3 g) {
    ivec3 b = ivec3(floor(g - 0.5));
    for (int k = 0; k < 8; k++) {
        ivec3 c = b + ivec3(k & 1, (k >> 1) & 1, k >> 2);
        if (inBox(c) && iceCount[cellIndex(c)] > 0) {
            return true;
        }
    }
    return false;
}

void main() {
    float dist = -vView.z;
    if (dist < G.surf.z) {
        discard;
    }
    if (viewState.x > 0.5 && vWall > 0.5) {
        discard;
    }
    outG = vec4(normalize(vNormal), dist);
    // The surface's flow (grid velocity, blocks per second): lava's crust and water's foam drift with it.
    vec3 flow = isSand() || isSlime() ? vec3(0.0) : sampleVel(vGrid) * G.domainOrigin.w;
    bool icy = isWater() && icyAt(vGrid);
    outMat = vec4(icy ? ICE_MAT : G.matA.x, icy ? vec3(0.0) : flow);
}
