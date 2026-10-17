# Realistic Water (macOS fix) — modified build

**This is a modified version of Realistic Water, not the original mod.** The original mod is made by
**Skaffy**: https://github.com/sskaffy/Realistic-Water. This build is distributed under the same license
(see [LICENSE](LICENSE), kept unchanged) and is based on the original 1.2.1 source for Minecraft 26.3.

It fixes the Vulkan code so it runs on macOS (MoltenVK), including older Macs on Big Sur, and adds a few
things the original doesn't have (see "Additions" below).

### macOS fixes

- No subgroup operations in the particle compaction shaders (`g2p.comp`, `mpm_g2p.comp`): workgroup scans
  in shared memory instead, which every Metal GPU supports.
- The coarse multigrid solve (`mg_coarse.comp`) uses 256 threads per workgroup instead of 1024, which older
  Mac GPUs can't run in one Metal threadgroup.
- Inf/NaN checks use bit patterns, so they still work under Metal's fast-math mode, and NaN preservation is
  requested from the driver when it supports it. Particle splatting is clamped to the grid, so a stray
  particle can no longer stall the GPU until macOS resets it.
- Shaders ship precompiled to SPIR-V, so the mod no longer depends on the shaderc native library at runtime
  (it still compiles at runtime if a shader was edited without regenerating the SPIR-V).
- Falls back to normal descriptor sets when the device has no push descriptors, and to
  `VK_KHR_dynamic_rendering` when core Vulkan 1.3 dynamic rendering is missing.
- Uses a 16-bit thickness target when the GPU can't blend or filter 32-bit floats.
- Sizes the surface mesh and particle buffers to fit `maxStorageBufferRange` and the GPU's memory; on GPUs
  with less than 3 GB the default simulation resolution is lowered (`/water set resolution 6` restores it).
- Clearer chat message when Minecraft itself couldn't start Vulkan (macOS OpenGL has no compute shaders,
  so the mod needs Minecraft's Vulkan renderer).
- Lava fire spreading and lava entity effects switch themselves off with a log line, instead of crashing
  the game, if a Minecraft method they call is missing.

### Additions

- **Realistic Slime** (Natural Blocks tab, next to Realistic Sand): an elastic jelly cube simulated with MPM.
  It sticks to the blocks it touches (walls, floors, ceilings) and wobbles, but bounces off anvils. Spawn one
  in front of you with `/water slime [size]`, remove all with `/water remove slime`. Tunable with
  `/water set slimeStiffness|slimeDamping|slimeBounce|slimeGrip <value>`.
- **Slow, thick lava**: lava now has real viscosity (an implicit viscosity solve on the grid with no-slip walls),
  so it creeps down walls and spreads in thick lobes instead of falling at a fixed speed
  (`lavaViscosity`, `lavaViscositySweeps`, `lavaMaxSpeed`).
- **Molten lava look**: a cooled crust torn into streaks along the flow, with bright hot channels between them;
  the pattern moves with the lava and its relief catches the sunlight.
- **Better foam**: foam lasts longer, gathers in islands and streaks with a bubbly texture that drifts with
  the current, and is lit by the sun.
- **Freezing water**: water touching ice (ice, packed ice, blue ice or frosted ice blocks) freezes where it is, and the
  frost spreads through the water touching it, so a splash or a waterfall stops in time as ice. In snowy biomes water
  also freezes from its surface. Walking (or anything else moving) into frozen water shatters it like glass, with the
  ice-breaking sound and shards. Once nothing cold is left nearby the ice slowly melts back into water. Tunable with
  `/water set freezing|freezeSpeed|coldBiomeFreezeRate|meltRate|shatterRadius|shatterEffects <value>`
  (`/water set coldBiomeFreezeRate 0` keeps water liquid in snowy biomes, `/water set freezing false` turns it all off).

### Other fixes

- Water shut in with no air (for example covered with glass) no longer churns, and no longer bursts out and lags the
  game when the seal is broken: the solver used to ask shut-in water to spread out, which it can't, and the pressure
  piled up.
- The underwater look switches exactly when the drawn water surface passes the camera (it used to flicker near the
  surface), and droplets right in front of the camera aren't drawn.

The images in [screenshots](screenshots) come from the headless test renderer used during development (the
mod's own simulation and shaders, with simple stand-in blocks instead of Minecraft's world).

### Troubleshooting

On startup the log (`logs/latest.log`) gets a line starting with `Realistic Water on` that lists the GPU and
the code paths in use. Two JVM flags exist for troubleshooting: `-Drealisticwater.noPushDescriptors=true`
forces descriptor sets, and `-Drealisticwater.fastMath=true` turns off the NaN-preserving shader variants.

Building: `./gradlew build` as usual. After editing a shader, run `tools/precompile-shaders.sh` (Linux or
macOS, JDK 17+) to regenerate `src/client/resources/assets/realistic-water/shaders/spv`.

The original README follows.

---

# Realistic Water
A Minecraft mod that adds the realistic waters and sands from Blender animations.

<img width="1280" height="720" alt="New Project - 2026-10-07T160439 375" src="https://github.com/user-attachments/assets/4b14b99f-3358-46a7-9d70-85322b1433c2" />

#

How to use:

1. Download the latest version from: https://github.com/sskaffy/Realistic-Water/releases/
2. Install Fabric (Tutorial: https://docs.fabricmc.net/players/installing-fabric/)
3. Put the mod to the mods folder
4. Open the game and set the Graphics API in the Video Settings to Vulkan and then restart the game
5. Place down a ball of water with "/water ball"
6. Or go in your Creative inventory and get a "Realistic Water Bucket" or "Realistic Lava Bucket"
7. Spawn lava with "/water lava" or "/water ball lava [size]"; remove with "/water remove lava"

#

Screenshots:

<img width="1920" height="1080" alt="Still 2026-10-12 141111_1 7 2" src="https://github.com/user-attachments/assets/86db4ca0-0c4f-4384-91ad-24cdfabd50fd" />


<img width="1280" height="720" alt="New Project - 2026-10-07T163030 494" src="https://github.com/user-attachments/assets/fbba1b63-390b-4d88-aa66-26260c843ef5" />

IMPORTANT:The mod is coded by Claude but it is looked through by me and the idea for how things work is on me too
