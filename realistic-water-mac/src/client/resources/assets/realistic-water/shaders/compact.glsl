// Workgroup-wide stand-ins for the subgroup operations the particle kernels used to compact their output.
// MoltenVK can't run subgroup arithmetic/ballot on many Macs, so this only uses shared memory and barrier().
// Every invocation of the workgroup has to reach these calls (no early returns before them).
// Needs local_size_x = COMPACT_GROUP and a `counters` buffer; define COMPACT_AWAKE to also sum an awake count.
#define COMPACT_GROUP 256u

shared uint compactScan[COMPACT_GROUP];
shared uint compactBase;
shared uvec4 compactLo[COMPACT_GROUP];
shared uvec4 compactHi[COMPACT_GROUP];
#ifdef COMPACT_AWAKE
shared uint compactAwake[COMPACT_GROUP];
#endif

// Exclusive count of the live invocations before this one (in invocation order) and the group total.
uint compactSlot(bool alive, out uint total) {
    uint lid = gl_LocalInvocationIndex;
    compactScan[lid] = alive ? 1u : 0u;
    barrier();
    for (uint offset = 1u; offset < COMPACT_GROUP; offset <<= 1u) {
        uint add = lid >= offset ? compactScan[lid - offset] : 0u;
        barrier();
        compactScan[lid] += add;
        barrier();
    }
    total = compactScan[COMPACT_GROUP - 1u];
    return compactScan[lid] - (alive ? 1u : 0u);
}

// Reserves `total` slots of counters[counter] with one atomic for the whole group; returns the first slot.
uint compactReserve(uint counter, uint total) {
    if (gl_LocalInvocationIndex == 0u && total > 0u) {
        compactBase = atomicAdd(counters[counter], total);
    }
    barrier();
    return compactBase;
}

// Folds max speed (live particles) and the cell AABB (written particles) into counters[6] and [8..13].
void compactStats(bool alive, float speed, bool written, vec3 pos, uint awake) {
    uint lid = gl_LocalInvocationIndex;
    uvec3 cell = written ? uvec3(ivec3(floor(pos)) + AABB_BIAS) : uvec3(0u);
    compactLo[lid] = uvec4(written ? cell : uvec3(0xFFFFFFFFu), 0u);
    compactHi[lid] = uvec4(written ? cell : uvec3(0u), alive ? floatBitsToUint(speed) : 0u);
#ifdef COMPACT_AWAKE
    compactAwake[lid] = alive ? awake : 0u;
#endif
    barrier();
    for (uint s = COMPACT_GROUP / 2u; s > 0u; s >>= 1u) {
        if (lid < s) {
            compactLo[lid] = min(compactLo[lid], compactLo[lid + s]);
            compactHi[lid] = max(compactHi[lid], compactHi[lid + s]);
#ifdef COMPACT_AWAKE
            compactAwake[lid] += compactAwake[lid + s];
#endif
        }
        barrier();
    }
    if (lid == 0u) {
        uvec4 lo = compactLo[0];
        uvec4 hi = compactHi[0];
        if (hi.w != 0u) {
            atomicMax(counters[6], hi.w);
        }
        if (lo.x != 0xFFFFFFFFu) {
            atomicMin(counters[8], lo.x);
            atomicMin(counters[9], lo.y);
            atomicMin(counters[10], lo.z);
            atomicMax(counters[11], hi.x);
            atomicMax(counters[12], hi.y);
            atomicMax(counters[13], hi.z);
        }
#ifdef COMPACT_AWAKE
        if (compactAwake[0] != 0u) {
            atomicAdd(counters[C_AWAKE], compactAwake[0]);
        }
#endif
    }
}
