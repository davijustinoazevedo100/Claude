package me.skaffy.client.water;

import com.mojang.blaze3d.pipeline.RenderTarget;
import com.mojang.renderpearl.backend.vulkan.VulkanGpuTexture;
import com.mojang.renderpearl.backend.vulkan.VulkanGpuTextureView;
import it.unimi.dsi.fastutil.bytes.ByteArrayList;
import it.unimi.dsi.fastutil.longs.Long2IntOpenHashMap;
import it.unimi.dsi.fastutil.longs.LongArrayList;
import it.unimi.dsi.fastutil.longs.LongOpenHashSet;
import java.nio.ByteBuffer;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import me.skaffy.ModContent;
import me.skaffy.RealisticWater;
import me.skaffy.block.RealisticHoneyBlock;
import me.skaffy.block.RealisticSandBlock;
import me.skaffy.block.RealisticSlimeBlock;
import me.skaffy.client.vk.Desc;
import me.skaffy.client.vk.Vk;
import me.skaffy.client.vk.VkBuf;
import me.skaffy.block.RealisticWaterBlock;
import me.skaffy.fluid.RealisticLavaFluid;
import me.skaffy.fluid.RealisticWaterFluid;
import me.skaffy.net.HoneySyncPayload;
import me.skaffy.net.LavaSyncPayload;
import me.skaffy.net.RemoveAllWaterPayload;
import me.skaffy.net.SandSyncPayload;
import me.skaffy.net.SlimeSyncPayload;
import me.skaffy.net.WaterSyncPayload;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.state.level.CameraRenderState;
import net.minecraft.client.renderer.state.level.LevelRenderState;
import net.minecraft.client.renderer.state.level.SkyRenderState;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.SectionPos;
import net.minecraft.network.chat.Component;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.piston.PistonMovingBlockEntity;
import net.minecraft.world.level.chunk.LevelChunk;
import net.minecraft.world.level.chunk.status.ChunkStatus;
import net.minecraft.world.level.chunk.LevelChunkSection;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;
import org.joml.Vector3f;
import org.joml.Vector4f;
import org.jspecify.annotations.Nullable;
import org.lwjgl.vulkan.VK10;
import org.lwjgl.vulkan.VkCommandBuffer;

public final class WaterWorld {
	private static final WaterWorld INSTANCE = new WaterWorld();
	static final int UBO_SLOT = 4096;
	static final int UBO_SIZE = 3952;
	static final float PARTICLES_PER_CELL = 8.0F;
	static final float SAND_POISSON = 0.3F;

	static float sandWaveSpeed() {
		float nu = SAND_POISSON;
		return (float) Math.sqrt(WaterSettings.sandStiffness * (1.0F - nu) / ((1.0F + nu) * (1.0F - 2.0F * nu)));
	}
	private static final double WORLD_WRAP = 4096.0;
	static final int MAX_ENTITIES = 32;
	static final int MAX_SOURCES = 64;
	static final int MAX_REGIONS = 16;
	private static final int JOIN_DISTANCE = 16;
	private static final int SYNC_INTERVAL = 30;
	private static final int ECHO_TIMEOUT = 200;
	private static final int BIOME_CHECK_TICKS = 40;
	private static final int SHATTER_EFFECT_TICKS = 4;

	public static final Matrix4f LEVEL_PROJECTION = new Matrix4f();

	private static final class Echoes {
		final Long2IntOpenHashMap expected = new Long2IntOpenHashMap();
		final Long2IntOpenHashMap frame = new Long2IntOpenHashMap();

		boolean consume(long key, int amount) {
			if (this.expected.containsKey(key) && this.expected.get(key) == amount) {
				this.expected.remove(key);
				this.frame.remove(key);
				return true;
			}
			return false;
		}

		void expect(long key, int amount, int frame) {
			this.expected.put(key, amount);
			this.frame.put(key, frame);
		}

		void expire(int now) {
			this.frame.long2IntEntrySet().removeIf(e -> {
				if (now - e.getIntValue() > ECHO_TIMEOUT) {
					this.expected.remove(e.getLongKey());
					return true;
				}
				return false;
			});
		}

		void clear() {
			this.expected.clear();
			this.frame.clear();
		}
	}

	private final List<WaterRegion> regions = new ArrayList<>();
	private final Map<BlockPos, Material> sources = new LinkedHashMap<>();
	private final ArrayDeque<ChunkPos> chunkScanQueue = new ArrayDeque<>();
	private final Echoes waterEchoes = new Echoes();
	private final Echoes sandEchoes = new Echoes();
	private final Echoes lavaEchoes = new Echoes();
	private final Echoes slimeEchoes = new Echoes();
	private final Echoes honeyEchoes = new Echoes();
	private final List<Object[]> pendingFills = new ArrayList<>();
	private final FlowSounds sounds = new FlowSounds();
	private @Nullable SolidCache solids;
	private @Nullable SolidCache sandSolids;
	private @Nullable SolidCache slimeSolids;
	private @Nullable WaterRenderer renderer;
	private @Nullable SandRenderer sandRenderer;
	private @Nullable VkBuf uboRing;
	private @Nullable VkBuf frameView;
	private boolean paused;
	private boolean failed;
	private long lastFrameNanos;
	private float simTime;
	private int frameCounter;
	private int ticks;
	private int nextRegionId;
	private int lastSteps;
	private float lastDt;
	private float smoothedFrameMs;
	private boolean localPlayerFirst;
	private int builtResolution = WaterSettings.resolution;
	private int builtSandResolution = WaterSettings.sandResolution;
	private int builtLavaResolution = WaterSettings.lavaResolution;
	private int builtSlimeResolution = WaterSettings.slimeResolution;
	private int builtHoneyResolution = WaterSettings.honeyResolution;
	private int lastSandSteps;
	private float lastSandDt;

	public static WaterWorld get() {
		return INSTANCE;
	}

	public static boolean isRealistic(FluidState state) {
		return RealisticWaterFluid.isRealistic(state);
	}

	private static int waterAmount(BlockState state) {
		FluidState fluid = state.getFluidState();
		return RealisticWaterFluid.isRealistic(fluid) ? fluid.getAmount() : 0;
	}

	private static int lavaAmount(BlockState state) {
		FluidState fluid = state.getFluidState();
		return RealisticLavaFluid.isRealistic(fluid) ? fluid.getAmount() : 0;
	}

	private static int amountOf(BlockState state, Material material) {
		return switch (material) {
			case SAND -> RealisticSandBlock.layers(state);
			case LAVA -> lavaAmount(state);
			case SLIME -> RealisticSlimeBlock.layers(state);
			case HONEY -> RealisticHoneyBlock.layers(state);
			default -> waterAmount(state);
		};
	}

	private static @Nullable Material springMaterial(BlockState state) {
		if (!RealisticWaterBlock.isInfinite(state)) {
			return null;
		}
		if (state.getBlock() == ModContent.REALISTIC_LAVA_BLOCK) {
			return Material.LAVA;
		}
		if (state.getBlock() == ModContent.REALISTIC_WATER_BLOCK) {
			return Material.WATER;
		}
		return null;
	}

	private Echoes echoes(Material material) {
		return switch (material) {
			case SAND -> this.sandEchoes;
			case LAVA -> this.lavaEchoes;
			case SLIME -> this.slimeEchoes;
			case HONEY -> this.honeyEchoes;
			default -> this.waterEchoes;
		};
	}

	public boolean togglePause() {
		this.paused = !this.paused;
		return this.paused;
	}

	private SolidCache solids(Material material) {
		return this.solids(material, resolutionFor(material));
	}

	private SolidCache solids(Material material, int res) {
		if (material == Material.SLIME) {
			if (this.slimeSolids == null || this.slimeSolids.res != res) {
				this.slimeSolids = SolidCache.forMaterial(material, res);
			}
			return this.slimeSolids;
		}
		if (material.isGranular()) {
			if (this.sandSolids == null || this.sandSolids.res != res) {
				this.sandSolids = SolidCache.forMaterial(material, res);
			}
			return this.sandSolids;
		}
		if (this.solids == null || this.solids.res != res) {
			this.solids = SolidCache.forMaterial(material, res);
		}
		return this.solids;
	}

	static int resolutionFor(Material material) {
		if (material == Material.SAND) {
			return Math.max(1, WaterSettings.sandResolution);
		}
		if (material == Material.LAVA) {
			return Math.max(1, WaterSettings.lavaResolution);
		}
		if (material == Material.SLIME) {
			return Math.max(1, WaterSettings.slimeResolution);
		}
		if (material == Material.HONEY) {
			return Math.max(1, WaterSettings.honeyResolution);
		}
		return Math.max(1, WaterSettings.resolution);
	}

	static float maxSpeed(Material material) {
		return switch (material) {
			case LAVA -> WaterSettings.lavaMaxSpeed;
			case SLIME -> WaterSettings.slimeMaxSpeed;
			case HONEY -> WaterSettings.honeyMaxSpeed;
			default -> WaterSettings.maxSpeed;
		};
	}

	static float underwaterFog(Material material) {
		return material == Material.LAVA ? WaterSettings.lavaUnderwaterFog : WaterSettings.underwaterFog;
	}

	static float slimeWaveSpeed() {
		float nu = Math.clamp(WaterSettings.slimePoisson, 0.0F, 0.45F);
		return (float) Math.sqrt(Math.max(WaterSettings.slimeStiffness, 0.0F) * (1.0F - nu) / ((1.0F + nu) * (1.0F - 2.0F * nu)));
	}

	/**
	 * Largest stable MPM step: the elastic wave may cross only part of a cell, particles at most one cell, and the slime's
	 * damping (an explicit viscosity, in cells^2 per second) may only smooth over a cell per step.
	 */
	static float mpmDtLimit(Material material, int res, float fastest) {
		boolean slime = material == Material.SLIME;
		float wave = slime ? slimeWaveSpeed() : sandWaveSpeed();
		float cfl = slime ? WaterSettings.slimeCfl : WaterSettings.sandCfl;
		float limit = Math.min(cfl / (res * Math.max(wave, 1e-3F)), 1.0F / (res * Math.max(fastest, 1e-3F)));
		if (slime) {
			limit = Math.min(limit, 0.12F / Math.max(WaterSettings.slimeDamping * res * res, 1e-3F));
		}
		return limit;
	}

	static int mpmMaxSteps(Material material) {
		return Math.max(1, material == Material.SLIME ? WaterSettings.slimeMaxStepsPerFrame : WaterSettings.sandMaxStepsPerFrame);
	}

	private static boolean isHost() {
		return Minecraft.getInstance().getSingleplayerServer() != null;
	}


	private @Nullable WaterRegion regionNear(BlockPos pos, int margin, Material material) {
		for (WaterRegion r : this.regions) {
			if (r.material == material && r.res == resolutionFor(material) && r.claims(pos, margin)) {
				return r;
			}
		}
		return null;
	}

	private WaterRegion regionFor(BlockPos pos, Material material) {
		WaterRegion r = this.regionNear(pos, JOIN_DISTANCE, material);
		if (r == null) {
			r = new WaterRegion(this.nextRegionId++, resolutionFor(material), material);
			this.regions.add(r);
		}
		return r;
	}

	private boolean warnedNoVulkan;
	private boolean tunedForGpu;

	private boolean vulkanReady() {
		if (Vk.tryDevice() != null) {
			this.tuneForGpu();
			return true;
		}
		Minecraft mc = Minecraft.getInstance();
		if (!this.warnedNoVulkan && mc.player != null) {
			this.warnedNoVulkan = true;
			mc.player.sendSystemMessage(Component.literal(noVulkanMessage()));
		}
		return false;
	}

	/** Why the simulation can't run: what Minecraft is actually drawing with, and what to do about it. */
	public static String noVulkanMessage() {
		boolean mac = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("mac");
		String api = Vk.graphicsApi();
		StringBuilder sb = new StringBuilder("Realistic Water can't run: it needs Minecraft's Vulkan renderer, but Minecraft is drawing with ")
			.append(api).append(" (").append(Vk.describeDevice()).append("). ");
		if (api.equals("OpenGL")) {
			sb.append("Set Options > Video Settings > Graphics API to Vulkan and restart the game. If it already says Vulkan, Minecraft's Vulkan "
				+ "renderer failed to start and the game went back to OpenGL by itself; logs/latest.log says why (search for \"Vulkan\").");
			if (mac) {
				sb.append(" On a Mac, Vulkan runs through MoltenVK, which needs a Metal GPU that Minecraft's renderer supports; macOS OpenGL has no "
					+ "compute shaders, so the simulation can't fall back to it.");
			}
		} else {
			sb.append("Please report this together with logs/latest.log.");
		}
		return sb.append(" (/water info shows this again.)").toString();
	}

	// Simulation memory grows with resolution cubed and a splash easily needs over a gigabyte at the defaults, which
	// GPUs with a small heap (older Macs share about 1.5 GB with macOS) can't give. Runs before the first region exists.
	private void tuneForGpu() {
		if (this.tunedForGpu) {
			return;
		}
		this.tunedForGpu = true;
		long heap = Vk.deviceLocalHeap();
		if (heap >= 3L << 30) {
			return;
		}
		if (WaterSettings.resolution == 6) {
			WaterSettings.resolution = 4;
		}
		if (WaterSettings.lavaResolution == 6) {
			WaterSettings.lavaResolution = 4;
		}
		if (WaterSettings.sandResolution == 12) {
			WaterSettings.sandResolution = 8;
		}
		if (WaterSettings.honeyResolution == 6) {
			WaterSettings.honeyResolution = 4;
		}
		this.builtResolution = WaterSettings.resolution;
		this.builtSandResolution = WaterSettings.sandResolution;
		this.builtLavaResolution = WaterSettings.lavaResolution;
		this.builtHoneyResolution = WaterSettings.honeyResolution;
		RealisticWater.LOGGER.info("Realistic Water: {} MiB GPU heap, using resolution {} / sand {} / lava {}", heap >> 20, WaterSettings.resolution,
			WaterSettings.sandResolution, WaterSettings.lavaResolution);
		Minecraft mc = Minecraft.getInstance();
		if (mc.player != null) {
			mc.player.sendSystemMessage(Component.literal("Realistic Water: small GPU memory (" + (heap >> 20) + " MB), using a lower simulation resolution. "
				+ "\"/water set resolution 6\" brings back full detail if your GPU can take it."));
		}
	}

	public void addWater(BlockPos pos, double y0, double y1) {
		this.addMaterial(pos, y0, y1, Material.WATER);
	}

	public void addSand(BlockPos pos, double y0, double y1) {
		this.addMaterial(pos, y0, y1, Material.SAND);
	}

	public void addLava(BlockPos pos, double y0, double y1) {
		this.addMaterial(pos, y0, y1, Material.LAVA);
	}

	public void addSlime(BlockPos pos, double y0, double y1) {
		this.addMaterial(pos, y0, y1, Material.SLIME);
	}

	public void addHoney(BlockPos pos, double y0, double y1) {
		this.addMaterial(pos, y0, y1, Material.HONEY);
	}

	private void addMaterial(BlockPos pos, double y0, double y1, Material material) {
		if (y1 <= y0 || !this.vulkanReady()) {
			return;
		}
		WaterRegion r = this.regionFor(pos, material);
		r.addEmitter(new WaterRegion.Emitter(pos.getX(), pos.getY() + y0, pos.getZ(), pos.getX() + 1, pos.getY() + y1, pos.getZ() + 1, 0, 0, 0));
		r.owned.add(pos.asLong());
	}

	public void addEmitter(WaterRegion.Emitter e, Material material) {
		if (!this.vulkanReady()) {
			return;
		}
		BlockPos center = BlockPos.containing((e.minX() + e.maxX()) / 2, (e.minY() + e.maxY()) / 2, (e.minZ() + e.maxZ()) / 2);
		this.regionFor(center, material).addEmitter(e);
	}

	private void removeMaterial(BlockPos pos, double y0, double y1, Material material) {
		for (WaterRegion r : this.regions) {
			if (r.material == material && (r.windowContains(pos, 1) || r.claims(pos, 1))) {
				r.removals.add(new WaterRegion.Removal(pos.getX(), pos.getY() + y0, pos.getZ(), pos.getX() + 1, pos.getY() + y1, pos.getZ() + 1));
				if (y0 <= 0.0) {
					r.owned.remove(pos.asLong());
				}
			}
		}
	}

	private void addSource(BlockPos pos, Material material) {
		BlockPos p = pos.immutable();
		if (this.sources.containsKey(p) || !this.vulkanReady()) {
			return;
		}
		if (this.sources.size() >= MAX_SOURCES) {
			BlockPos oldest = this.sources.keySet().iterator().next();
			this.sources.remove(oldest);
		}
		this.sources.put(p, material);
		this.regionFor(p, material).claimBlock(p);
	}

	public void removeAll(int radiusChunks, Material material) {
		if (ClientPlayNetworking.canSend(RemoveAllWaterPayload.TYPE)) {
			ClientPlayNetworking.send(new RemoveAllWaterPayload(radiusChunks, material.syncId()));
		}
		for (WaterRegion r : List.copyOf(this.regions)) {
			if (r.material == material) {
				this.regions.remove(r);
				r.close();
			}
		}
		this.echoes(material).clear();
		this.sources.entrySet().removeIf(e -> e.getValue() == material);
	}

	public void reload(ClientLevel level) {
		this.closeRegions();
		this.chunkScanQueue.clear();
		int radius = Minecraft.getInstance().options.renderDistance().get();
		ChunkPos center = ChunkPos.containing(Minecraft.getInstance().gameRenderer.gameRenderState().levelRenderState.cameraRenderState.blockPos);
		for (int dz = -radius; dz <= radius; dz++) {
			for (int dx = -radius; dx <= radius; dx++) {
				this.chunkScanQueue.add(new ChunkPos(center.x() + dx, center.z() + dz));
			}
		}
	}

	private void closeRegions() {
		for (WaterRegion r : this.regions) {
			r.close();
		}
		this.regions.clear();
		this.waterEchoes.clear();
		this.sandEchoes.clear();
		this.lavaEchoes.clear();
		this.slimeEchoes.clear();
		this.honeyEchoes.clear();
		this.pendingFills.clear();
		this.sounds.clear();
	}


	public void onBlockChanged(ClientLevel level, BlockPos pos, BlockState oldState, BlockState newState) {
		if (oldState == newState) {
			return;
		}
		Material oldSpring = springMaterial(oldState);
		Material newSpring = springMaterial(newState);
		long key = pos.asLong();
		if (newSpring != null) {
			this.addSource(pos, newSpring);
		} else if (oldSpring != null) {
			this.sources.remove(pos);
		}
		int waterBefore = waterAmount(oldState);
		int waterAfter = waterAmount(newState);
		if (waterBefore != waterAfter) {
			if (this.waterEchoes.consume(key, waterAfter)) {
			} else if (waterAfter > waterBefore) {
				this.addWater(pos.immutable(), waterBefore / 8.0, waterAfter >= 8 ? 1.0 : waterAfter / 8.0);
			} else {
				this.removeMaterial(pos.immutable(), waterAfter / 8.0, 1.0, Material.WATER);
			}
		}
		int lavaBefore = lavaAmount(oldState);
		int lavaAfter = lavaAmount(newState);
		if (lavaBefore != lavaAfter) {
			if (this.lavaEchoes.consume(key, lavaAfter)) {
			} else if (lavaAfter > lavaBefore) {
				this.addLava(pos.immutable(), lavaBefore / 8.0, lavaAfter >= 8 ? 1.0 : lavaAfter / 8.0);
			} else {
				this.removeMaterial(pos.immutable(), lavaAfter / 8.0, 1.0, Material.LAVA);
			}
		}

		int sandBefore = RealisticSandBlock.layers(oldState);
		int sandAfter = RealisticSandBlock.layers(newState);
		if (sandBefore != sandAfter && !this.sandEchoes.consume(key, sandAfter)) {
			if (sandAfter > sandBefore) {
				this.addSand(pos.immutable(), sandBefore / 8.0, sandAfter / 8.0);
			} else if (newState.isAir()) {
				this.removeMaterial(pos.immutable(), 0.0, 1.0, Material.SAND);
			}
		}

		int slimeBefore = RealisticSlimeBlock.layers(oldState);
		int slimeAfter = RealisticSlimeBlock.layers(newState);
		if (slimeBefore != slimeAfter && !this.slimeEchoes.consume(key, slimeAfter)) {
			if (slimeAfter > slimeBefore) {
				this.addSlime(pos.immutable(), slimeBefore / 8.0, slimeAfter / 8.0);
			} else if (newState.isAir()) {
				this.removeMaterial(pos.immutable(), 0.0, 1.0, Material.SLIME);
			}
		}

		int honeyBefore = RealisticHoneyBlock.layers(oldState);
		int honeyAfter = RealisticHoneyBlock.layers(newState);
		if (honeyBefore != honeyAfter && !this.honeyEchoes.consume(key, honeyAfter)) {
			if (honeyAfter > honeyBefore) {
				this.addHoney(pos.immutable(), honeyBefore / 8.0, honeyAfter / 8.0);
			} else if (newState.isAir()) {
				this.removeMaterial(pos.immutable(), 0.0, 1.0, Material.HONEY);
			}
		}

		if (oldState.getBlock() != newState.getBlock() || !oldState.getCollisionShape(level, pos).equals(newState.getCollisionShape(level, pos))) {
			for (Material m : Material.values()) {
				SolidCache cache = this.solids(m);
				if (cache.update(level, pos)) {
					for (WaterRegion r : this.regions) {
						if (r.res != cache.res || this.solids(r.material, r.res) != cache) {
							continue;
						}
						r.patchSolid(level, cache, pos);
					}
				}
			}
		}
	}

	public void onChunkLoad(ClientLevel level, LevelChunk chunk) {
		ChunkPos pos = chunk.getPos();
		for (SolidCache cache : new SolidCache[]{this.solids, this.sandSolids, this.slimeSolids}) {
			if (cache != null) {
				cache.invalidateChunk(pos.x(), pos.z());
			}
		}
		for (WaterRegion r : this.regions) {
			if (r.hasWindow && r.overlapsChunk(pos.x(), pos.z())) {
				r.markSolidsDirty(level, this.solids(r.material, r.res));
			}
		}
		this.chunkScanQueue.add(pos);
	}

	public void onChunkUnload(ClientLevel level, LevelChunk chunk) {
		for (SolidCache cache : new SolidCache[]{this.solids, this.sandSolids, this.slimeSolids}) {
			if (cache != null) {
				cache.invalidateChunk(chunk.getPos().x(), chunk.getPos().z());
			}
		}
	}

	private boolean owned(long key, Material material) {
		for (WaterRegion r : this.regions) {
			if (r.material == material && r.owned.contains(key)) {
				return true;
			}
		}
		return false;
	}

	private void scanChunk(ClientLevel level, ChunkPos chunkPos) {
		if (!level.hasChunk(chunkPos.x(), chunkPos.z())) {
			return;
		}
		LevelChunk chunk = level.getChunk(chunkPos.x(), chunkPos.z());
		LevelChunkSection[] sections = chunk.getSections();
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		for (int s = 0; s < sections.length; s++) {
			LevelChunkSection section = sections[s];
			if (section.hasOnlyAir()
				|| !section.maybeHas(state -> state.getBlock() == ModContent.REALISTIC_WATER_BLOCK
					|| state.getBlock() == ModContent.REALISTIC_LAVA_BLOCK
					|| state.getBlock() == ModContent.REALISTIC_SAND
					|| state.getBlock() == ModContent.REALISTIC_SLIME
					|| state.getBlock() == ModContent.REALISTIC_HONEY)) {
				continue;
			}
			int baseY = (level.getMinSectionY() + s) << 4;
			for (int i = 0; i < 4096; i++) {
				BlockState state = section.getBlockState(i & 15, (i >> 4) & 15, i >> 8);
				int water = waterAmount(state);
				int lava = lavaAmount(state);
				int sand = RealisticSandBlock.layers(state);
				int slime = RealisticSlimeBlock.layers(state);
				int honey = RealisticHoneyBlock.layers(state);
				if (water == 0 && lava == 0 && sand == 0 && slime == 0 && honey == 0) {
					continue;
				}
				pos.set((chunkPos.x() << 4) + (i & 15), baseY + ((i >> 4) & 15), (chunkPos.z() << 4) + (i >> 8));
				Material spring = springMaterial(state);
				if (spring != null) {
					this.addSource(pos, spring);
					continue;
				}
				long key = pos.asLong();
				if (water > 0 && !this.owned(key, Material.WATER)) {
					this.addWater(pos.immutable(), 0.0, water >= 8 ? 1.0 : water / 8.0);
				}
				if (lava > 0 && !this.owned(key, Material.LAVA)) {
					this.addLava(pos.immutable(), 0.0, lava >= 8 ? 1.0 : lava / 8.0);
				}
				if (sand > 0 && !this.owned(key, Material.SAND)) {
					this.addSand(pos.immutable(), 0.0, sand / 8.0);
				}
				if (slime > 0 && !this.owned(key, Material.SLIME)) {
					this.addSlime(pos.immutable(), 0.0, slime / 8.0);
				}
				if (honey > 0 && !this.owned(key, Material.HONEY)) {
					this.addHoney(pos.immutable(), 0.0, honey / 8.0);
				}
			}
		}
	}

	public void tick(Minecraft mc) {
		ClientLevel level = mc.level;
		if (level == null) {
			return;
		}
		if (WaterSettings.resolution != this.builtResolution
			|| WaterSettings.sandResolution != this.builtSandResolution
			|| WaterSettings.lavaResolution != this.builtLavaResolution
			|| WaterSettings.slimeResolution != this.builtSlimeResolution
			|| WaterSettings.honeyResolution != this.builtHoneyResolution) {
			this.builtResolution = WaterSettings.resolution;
			this.builtSandResolution = WaterSettings.sandResolution;
			this.builtLavaResolution = WaterSettings.lavaResolution;
			this.builtSlimeResolution = WaterSettings.slimeResolution;
			this.builtHoneyResolution = WaterSettings.honeyResolution;
			this.reload(level);
		}
		for (int i = 0; i < 4 && !this.chunkScanQueue.isEmpty(); i++) {
			this.scanChunk(level, this.chunkScanQueue.poll());
		}
		this.waterEchoes.expire(this.frameCounter);
		this.sandEchoes.expire(this.frameCounter);
		this.lavaEchoes.expire(this.frameCounter);
		this.slimeEchoes.expire(this.frameCounter);
		this.honeyEchoes.expire(this.frameCounter);
		Vec3 listener = mc.player != null ? mc.player.getEyePosition() : null;
		for (Object[] f : this.pendingFills) {
			WaterRegion r = (WaterRegion) f[0];
			WaterRegion.Fill fill = (WaterRegion.Fill) f[1];
			if (!this.regions.contains(r)) {
				continue;
			}
			if (listener != null) {
				this.sounds.onFill(r.material, fill, listener);
			}
			if (isHost()) {
				this.syncBlocks(level, r, fill);
			}
		}
		this.pendingFills.clear();
		this.ticks++;
		// Say so right away (once) when the game isn't on Vulkan, instead of only when the first realistic block shows up.
		if (this.ticks == 100 && mc.player != null) {
			this.vulkanReady();
		}
		for (WaterRegion r : this.regions) {
			this.tickIce(level, r);
		}
		this.sounds.tick(level);
	}

	/** Keeps each water region's snowy-biome flag fresh, and plays the breaking effect where entities shattered its ice. */
	private void tickIce(ClientLevel level, WaterRegion r) {
		if (r.material != Material.WATER) {
			return;
		}
		int[] b = r.boxWorld;
		if (!WaterSettings.freezing) {
			r.coldBiome = false;
		} else if (b != null && this.ticks >= r.nextBiomeCheck) {
			r.nextBiomeCheck = this.ticks + BIOME_CHECK_TICKS;
			double h = 1.0 / r.res;
			r.coldBiome = IceEffects.coldBiome(level, BlockPos.containing((b[0] + b[3]) * 0.5 * h, (b[1] + b[4]) * 0.5 * h, (b[2] + b[5]) * 0.5 * h));
		}
		if (r.shatterCount > 0 && this.ticks >= r.nextShatterEffect) {
			if (WaterSettings.shatterEffects) {
				IceEffects.shatter(level, r.shatterAt[0], r.shatterAt[1], r.shatterAt[2]);
			}
			r.shatterCount = 0;
			r.nextShatterEffect = this.ticks + SHATTER_EFFECT_TICKS;
		}
	}


	private static int targetAmount(float fill, int current) {
		int target;
		if (fill >= 0.8F) {
			target = 8;
		} else if (fill >= 0.12F) {
			target = Mth.clamp(Math.round(fill * 8.0F), 1, 7);
		} else {
			target = 0;
		}
		if (current > 0 && target == 0 && fill > 0.05F) {
			return current;
		}
		if (current == 0 && target > 0 && fill < 0.2F) {
			return 0;
		}
		if (current > 0 && target > 0 && current < 8 && target < 8 && Math.abs(target - current) <= 1) {
			return current;
		}
		return target;
	}

	private static int targetLayers(float fill, float speed, int current) {
		float raw = fill * RealisticSandBlock.MAX_LAYERS;
		if (speed > 1.5F && raw > current) {
			return current;
		}
		int target = raw < 0.5F ? 0 : Mth.clamp(Math.round(raw), 1, RealisticSandBlock.MAX_LAYERS);
		if (current > 0 && target == 0 && raw > 0.25F) {
			return current;
		}
		if (current > 0 && target > 0 && Math.abs(raw - current) < 0.75F) {
			return current;
		}
		return target;
	}

	private void syncBlocks(ClientLevel level, WaterRegion r, WaterRegion.Fill f) {
		Material material = r.material;
		boolean layered = material.usesLayers();
		Echoes echoes = this.echoes(material);
		LongArrayList positions = new LongArrayList();
		ByteArrayList amounts = new ByteArrayList();
		LongOpenHashSet seen = new LongOpenHashSet();
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		int i = 0;
		for (int z = 0; z < f.dz(); z++) {
			for (int y = 0; y < f.dy(); y++) {
				for (int x = 0; x < f.dx(); x++, i++) {
					pos.set(f.x() + x, f.y() + y, f.z() + z);
					long key = pos.asLong();
					seen.add(key);
					BlockState state = level.getBlockState(pos);
					int current = amountOf(state, material);
					if ((current == 0 && !state.isAir()) || RealisticWaterBlock.isInfinite(state)) {
						continue;
					}
					if (echoes.expected.containsKey(key)) {
						current = echoes.expected.get(key);
					}
					int target = layered ? targetLayers(f.fullness(i), f.blocksPerSecond(i), current) : targetAmount(f.fullness(i), current);
					if (target != current) {
						positions.add(key);
						amounts.add((byte) target);
						echoes.expect(key, target, this.frameCounter);
					}
					if (target > 0) {
						r.owned.add(key);
					} else {
						r.owned.remove(key);
					}
				}
			}
		}
		LongArrayList gone = new LongArrayList();
		for (long key : r.owned) {
			if (!seen.contains(key)) {
				gone.add(key);
			}
		}
		for (long key : gone) {
			r.owned.remove(key);
			this.queueClear(level, key, material, positions, amounts);
		}
		this.send(material, positions, amounts);
	}

	private void queueClear(ClientLevel level, long key, Material material, LongArrayList positions, ByteArrayList amounts) {
		BlockPos pos = BlockPos.of(key);
		if (amountOf(level.getBlockState(pos), material) > 0 && !RealisticWaterBlock.isInfinite(level.getBlockState(pos))) {
			positions.add(key);
			amounts.add((byte) 0);
			this.echoes(material).expect(key, 0, this.frameCounter);
		}
	}

	private void send(Material material, LongArrayList positions, ByteArrayList amounts) {
		if (positions.isEmpty()) {
			return;
		}
		CustomPacketPayload.Type<?> type = switch (material) {
			case SAND -> SandSyncPayload.TYPE;
			case LAVA -> LavaSyncPayload.TYPE;
			case SLIME -> SlimeSyncPayload.TYPE;
			case HONEY -> HoneySyncPayload.TYPE;
			default -> WaterSyncPayload.TYPE;
		};
		if (!ClientPlayNetworking.canSend(type)) {
			return;
		}
		int max = switch (material) {
			case SAND -> SandSyncPayload.MAX_ENTRIES;
			case LAVA -> LavaSyncPayload.MAX_ENTRIES;
			case SLIME -> SlimeSyncPayload.MAX_ENTRIES;
			case HONEY -> HoneySyncPayload.MAX_ENTRIES;
			default -> WaterSyncPayload.MAX_ENTRIES;
		};
		for (int start = 0; start < positions.size(); start += max) {
			int n = Math.min(max, positions.size() - start);
			long[] p = new long[n];
			byte[] a = new byte[n];
			for (int k = 0; k < n; k++) {
				p[k] = positions.getLong(start + k);
				a[k] = amounts.getByte(start + k);
			}
			CustomPacketPayload payload = switch (material) {
				case SAND -> new SandSyncPayload(p, a);
				case LAVA -> new LavaSyncPayload(p, a);
				case SLIME -> new SlimeSyncPayload(p, a);
				case HONEY -> new HoneySyncPayload(p, a);
				default -> new WaterSyncPayload(p, a);
			};
			ClientPlayNetworking.send(payload);
		}
	}


	public void renderFrame() {
		Minecraft mc = Minecraft.getInstance();
		if (this.regions.isEmpty() || this.failed || mc.level == null || Vk.tryDevice() == null) {
			this.lastFrameNanos = 0L;
			return;
		}
		try {
			if (!Vk.coreRendering() && !Vk.khrRendering()) {
				throw new IllegalStateException("this Vulkan device doesn't expose dynamic rendering (Vulkan 1.3 or VK_KHR_dynamic_rendering)");
			}
			this.renderFrameUnsafe(mc, mc.level);
		} catch (RuntimeException | LinkageError e) {
			// LinkageError too: a missing native library or driver entry point must not take the whole game down.
			this.failed = true;
			RealisticWater.LOGGER.error("Realistic Water frame failed; disabling the simulation", e);
			if (mc.player != null) {
				mc.player.sendSystemMessage(Component.literal("Realistic Water failed: " + (e.getMessage() != null ? e.getMessage() : e.toString())));
			}
		}
	}

	private List<BlockPos> sourcesFor(WaterRegion r) {
		List<BlockPos> out = new ArrayList<>();
		if (!r.material.isFluidSim()) {
			return out;
		}
		for (Map.Entry<BlockPos, Material> e : this.sources.entrySet()) {
			if (e.getValue() != r.material) {
				continue;
			}
			BlockPos p = e.getKey();
			if (r.claims(p, 2)) {
				out.add(p);
			}
		}
		return out;
	}

	private void renderFrameUnsafe(Minecraft mc, ClientLevel level) {
		long now = System.nanoTime();
		Float clipDt = ClipRecorder.get().fixedDt();
		float frameDt = clipDt != null ? clipDt
			: this.lastFrameNanos == 0L ? 1.0F / 60.0F : (float) Math.min((now - this.lastFrameNanos) / 1.0e9, 0.1);
		this.lastFrameNanos = now;
		this.smoothedFrameMs = this.smoothedFrameMs * 0.9F + frameDt * 1000.0F * 0.1F;
		LevelRenderState levelState = mc.gameRenderer.gameRenderState().levelRenderState;
		Vec3 cam = levelState.cameraRenderState.pos;
		double reach = (mc.options.renderDistance().get() + 2) * 16.0;

		List<WaterRegion> active = new ArrayList<>();
		List<WaterRegion> merged = new ArrayList<>();
		List<WaterRegion> drained = new ArrayList<>();
		float fastest = 0.0F;
		float fastestSand = 0.0F;
		float fastestSlime = 0.0F;
		for (WaterRegion r : this.regions) {
			WaterRegion.Fill fill = r.readBack();
			if (fill != null) {
				this.pendingFills.add(new Object[]{r, fill});
			}
			int[] box = r.computeBoxWorld(this.sourcesFor(r), this.frameCounter);
			r.boxWorld = box;
			if (box == null) {
				if (++r.idleFrames > 90) {
					drained.add(r);
				}
				continue;
			}
			r.idleFrames = 0;
			double cx = (box[0] + box[3]) * 0.5 / r.res;
			double cz = (box[2] + box[5]) * 0.5 / r.res;
			if (Math.abs(cx - cam.x) > reach || Math.abs(cz - cam.z) > reach) {
				continue;
			}
			active.add(r);
			if (r.material == Material.SLIME) {
				fastestSlime = Math.max(fastestSlime, r.lastMaxSpeed / r.res);
			} else if (r.material.isGranular()) {
				fastestSand = Math.max(fastestSand, r.lastMaxSpeed / r.res);
			} else {
				fastest = Math.max(fastest, r.lastMaxSpeed / r.res);
			}
		}

		for (int i = 0; i < active.size(); i++) {
			WaterRegion a = active.get(i);
			for (int j = active.size() - 1; j > i; j--) {
				WaterRegion b = active.get(j);
				if (a.res == b.res && a.material == b.material && overlaps(a.boxWorld, b.boxWorld)) {
					a.boxWorld = WaterRegion.unionBox(a.boxWorld, b.boxWorld);
					a.queueAbsorb(b);
					active.remove(j);
					merged.add(b);
				}
			}
		}
		while (active.size() > MAX_REGIONS) {
			active.removeLast();
		}

		int steps = 0;
		float stepDt = frameDt;
		if (!this.paused && !mc.isPaused()) {
			float speed = fastest + WaterSettings.gravity * 0.15F;
			int res = Math.max(1, WaterSettings.resolution);
			int wanted = Math.max((int) Math.ceil(frameDt * speed * res / WaterSettings.cfl), (int) Math.ceil(frameDt / WaterSettings.maxDt));
			steps = Mth.clamp(wanted, 1, clipDt != null ? WaterSettings.renderMaxStepsPerFrame : WaterSettings.maxStepsPerFrame);
			stepDt = Math.min(frameDt / steps, WaterSettings.maxDt);
		}
		int sandSteps = 0;
		float sandDt = frameDt;
		int slimeSteps = 0;
		float slimeDt = frameDt;
		if (!this.paused && !mc.isPaused()) {
			float limit = mpmDtLimit(Material.SAND, resolutionFor(Material.SAND), fastestSand);
			sandSteps = Mth.clamp((int) Math.ceil(frameDt / limit), 1, clipDt != null ? Integer.MAX_VALUE : mpmMaxSteps(Material.SAND));
			sandDt = Math.min(frameDt / sandSteps, limit);
			limit = mpmDtLimit(Material.SLIME, resolutionFor(Material.SLIME), fastestSlime);
			slimeSteps = Mth.clamp((int) Math.ceil(frameDt / limit), 1, clipDt != null ? Integer.MAX_VALUE : mpmMaxSteps(Material.SLIME));
			slimeDt = Math.min(frameDt / slimeSteps, limit);
		}
		this.lastSteps = steps;
		this.lastDt = stepDt;
		this.lastSandSteps = sandSteps;
		this.lastSandDt = sandDt;
		this.simTime += steps * stepDt;

		RenderTarget main = mc.gameRenderer.mainRenderTarget();
		VulkanGpuTexture color = (VulkanGpuTexture) main.getColorTexture();
		VulkanGpuTexture depth = (VulkanGpuTexture) main.getDepthTexture();
		VulkanGpuTextureView colorView = (VulkanGpuTextureView) main.getColorTextureView();
		VulkanGpuTextureView depthView = (VulkanGpuTextureView) main.getDepthTextureView();
		if (active.isEmpty() || color == null || depth == null || colorView == null || depthView == null) {
			this.retire(level, merged, drained);
			Vk.endFrame();
			this.frameCounter++;
			return;
		}
		if (this.renderer == null) {
			this.renderer = new WaterRenderer();
		}
		if (this.sandRenderer == null) {
			this.sandRenderer = new SandRenderer();
		}
		if (this.uboRing == null) {
			this.uboRing = VkBuf.upload((long) UBO_SLOT * MAX_REGIONS * Vk.FRAME_RING, VkBuf.UNIFORM);
			this.frameView = VkBuf.device(16, 0);
		}
		int width = main.width;
		int height = main.height;
		this.renderer.prepare(width, height);

		VkCommandBuffer cb = Vk.encoder().allocateAndBeginTransientCommandBuffer();
		Vk.flushTransitions(cb);
		Vk.barrier(cb);
		this.frameView.fill(cb, 0);
		Vk.barrier(cb);
		boolean readFill = !this.paused;
		List<WaterRenderer.Body> waterBodies = new ArrayList<>();
		List<WaterRenderer.Body> sandBodies = new ArrayList<>();
		for (int i = 0; i < active.size(); i++) {
			WaterRegion r = active.get(i);
			r.planWindow(level, this.solids(r.material, r.res), r.boxWorld);
			boolean mpm = r.material.usesMpm();
			boolean slime = r.material == Material.SLIME;
			if (mpm && entityNear(level, r)) {
				r.wake(this.frameCounter);
			}
			int regionSteps = !mpm ? steps : r.dormant() ? 0 : slime ? slimeSteps : sandSteps;
			float regionDt = !mpm ? stepDt : slime ? slimeDt : sandDt;
			if (readFill && r.initialized() && (this.frameCounter + r.id) % SYNC_INTERVAL == 0) {
				r.fillRequested = true;
			}
			int slot = Vk.ringSlot() * MAX_REGIONS + i;
			List<float[]> removals = r.takeRemovals();
			int numSources = this.writeGlobals(mc, level, r, slot, regionDt, width, height, removals);
			Desc ubo = Desc.ubo(this.uboRing, (long) slot * UBO_SLOT, UBO_SIZE);
			r.record(cb, ubo, regionSteps, numSources, this.frameCounter, removals.size());
			(r.material.isGranular() ? sandBodies : waterBodies).add(new WaterRenderer.Body(r, ubo));
		}
		Vk.barrier(cb);
		if (!sandBodies.isEmpty()) {
			this.sandRenderer.record(cb, sandBodies, width, height, colorView.vkImageView(), depthView.vkImageView());
			Vk.barrier(cb);
		}
		if (!waterBodies.isEmpty()) {
			this.renderer.record(cb, waterBodies, Desc.ssbo(this.frameView), color.vkImage(), colorView.vkImageView(), depth.vkImage(),
				depthView.vkImageView());
		}
		Vk.barrier(cb);
		Vk.check(VK10.vkEndCommandBuffer(cb), "vkEndCommandBuffer");
		Vk.encoder().execute(cb);
		this.retire(level, merged, drained);
		Vk.endFrame();
		this.frameCounter++;
	}

	private void retire(ClientLevel level, List<WaterRegion> merged, List<WaterRegion> drained) {
		for (WaterRegion r : merged) {
			this.regions.remove(r);
			r.close();
		}
		for (WaterRegion r : drained) {
			this.regions.remove(r);
			if (isHost() && !this.paused) {
				LongArrayList positions = new LongArrayList();
				ByteArrayList amounts = new ByteArrayList();
				for (long key : r.owned) {
					this.queueClear(level, key, r.material, positions, amounts);
				}
				this.send(r.material, positions, amounts);
			}
			r.close();
		}
	}

	private static boolean entityNear(ClientLevel level, WaterRegion r) {
		int[] b = r.boxWorld;
		if (b == null) {
			return false;
		}
		double h = 1.0 / r.res;
		AABB box = new AABB(b[0] * h, b[1] * h, b[2] * h, b[3] * h, b[4] * h, b[5] * h).inflate(0.5);
		return !level.getEntities((Entity) null, box, e -> !e.isSpectator()).isEmpty() || !movingPistons(level, box.inflate(1.0)).isEmpty();
	}

	private static boolean overlaps(int[] a, int[] b) {
		return a[0] < b[3] && b[0] < a[3] && a[1] < b[4] && b[1] < a[4] && a[2] < b[5] && b[2] < a[5];
	}

	private int writeGlobals(Minecraft mc, ClientLevel level, WaterRegion r, int slot, float dt, int width, int height, List<float[]> removals) {
		ByteBuffer b = this.uboRing.mapped();
		int o = slot * UBO_SLOT;
		LevelRenderState levelState = mc.gameRenderer.gameRenderState().levelRenderState;
		CameraRenderState camera = levelState.cameraRenderState;
		SkyRenderState sky = levelState.skyRenderState;
		int res = r.res;
		float h = 1.0F / res;
		int[] box = r.box;
		boolean sand = r.material.isGranular();
		boolean lava = r.material == Material.LAVA;
		boolean fluid = r.material.isFluidSim();

		putInts(b, o, r.nx, r.ny, r.nz, r.numCells);
		putInts(b, o + 16, r.numU, r.numV, r.numW, r.numFaces);
		int entityCount = this.writeEntities(mc, r, b, o + 576, levelState.worldPartialTicks);
		putInts(b, o + 32, r.fluidCapacity, r.wwCapacity, entityCount, this.frameCounter);
		int sourceCount = fluid ? this.writeSources(r, b, o + 2112) : 0;
		putInts(b, o + 48, r.material.usesWhitewater() && WaterSettings.whitewater ? 1 : 0, sourceCount, fluid && this.localPlayerFirst ? 1 : 0,
			WaterSettings.wwCellLimit);
		putFloats(b, o + 64, 0.0F, -WaterSettings.gravity * res, 0.0F, dt);
		float flipRatio = lava ? WaterSettings.lavaFlipRatio : r.material == Material.HONEY ? WaterSettings.honeyFlipRatio : WaterSettings.flipRatio;
		float flip = (float) Math.pow(flipRatio, dt * 60.0F);
		putFloats(b, o + 80, flip, PARTICLES_PER_CELL, WaterSettings.volumeCorrection, 0.0F);
		putFloats(b, o + 96, maxSpeed(r.material) * res, h, this.simTime, 0.0F);
		putFloats(b, o + 112, WaterSettings.wwTrappedAirRate, WaterSettings.wwWaveCrestRate, WaterSettings.wwEnergyMin, WaterSettings.wwEnergyMax);
		putFloats(b, o + 128, WaterSettings.wwTrappedAirMin, WaterSettings.wwTrappedAirMax, WaterSettings.wwWaveCrestMin, WaterSettings.wwWaveCrestMax);
		putFloats(b, o + 144, WaterSettings.wwFoamLifeMin, WaterSettings.wwFoamLifeMax, WaterSettings.wwBubbleBuoyancy, WaterSettings.wwBubbleDrag);
		putFloats(b, o + 160, WaterSettings.wwSprayDrag, WaterSettings.wwSprayThreshold, WaterSettings.wwBubbleThreshold, WaterSettings.wwMaxPerParticle);

		Matrix4f proj = new Matrix4f(LEVEL_PROJECTION);
		Matrix4f view = new Matrix4f(camera.viewRotationMatrix);
		proj.get(o + 176, b);
		view.get(o + 240, b);
		new Matrix4f(proj).invert().get(o + 304, b);
		new Matrix4f(view).invert().get(o + 368, b);

		Vec3 cam = camera.pos;
		putFloats(b, o + 432, (float) (r.ox - cam.x), (float) (r.oy - cam.y), (float) (r.oz - cam.z), h);
		putFloats(b, o + 448, width, height, 1.0F / width, 1.0F / height);

		float sunAngle = sky.sunAngle;
		Vector4f sunWorld = new Vector4f(-Mth.sin(sunAngle), Mth.cos(sunAngle), 0.0F, 0.0F);
		Vector4f sunView = view.transform(new Vector4f(sunWorld));
		float sunIntensity = Mth.clamp(sunWorld.y * 4.0F, 0.0F, 1.0F) * (1.0F - sky.rainBrightness * 0.8F);
		putFloats(b, o + 464, sunView.x, sunView.y, sunView.z, sunIntensity);

		Vector3f skyColor = sky.skyColor != null ? new Vector3f(sky.skyColor) : new Vector3f(0.5F, 0.7F, 1.0F);
		Vector4f fog = camera.fogData.color;
		float ambient = Mth.clamp(0.15F + 1.2F * (0.3F * skyColor.x + 0.59F * skyColor.y + 0.11F * skyColor.z), 0.12F, 1.0F);
		putFloats(b, o + 480, skyColor.x, skyColor.y, skyColor.z, ambient);
		putFloats(b, o + 496, fog.x, fog.y, fog.z, 1.0F);
		writeShadingGlobals(b, o, r.material, res);
		putFloats(b, o + 3136, (float) (cam.x - r.ox) * res, (float) (cam.y - r.oy) * res, (float) (cam.z - r.oz) * res, res);
		putFloats(b, o + 3152, underwaterFog(r.material), wrap(cam.x), wrap(cam.y), wrap(cam.z));

		SurfaceMesher mesher = r.mesher;
		int sub = mesher.subdivision;
		putInts(b, o + 3168, mesher.fx, mesher.fy, mesher.fz, sub);
		putFloats(b, o + 3184, sand ? WaterSettings.sandSurfaceIso : WaterSettings.surfaceIso, 8.0F / (sub * sub * sub), WaterSettings.nearCull,
			WaterSettings.dropletThreshold);
		putInts(b, o + 3200, box[0], box[1], box[2], WaterRegion.boxCells(box));
		putInts(b, o + 3216, box[3], box[4], box[5], WaterRegion.boxFaces(box));
		int[] fine = mesher.fineBox(box);
		putInts(b, o + 3232, fine[0], fine[1], fine[2], SurfaceMesher.voxels(fine));
		putInts(b, o + 3248, fine[3], fine[4], fine[5], SurfaceMesher.cubes(fine));
		putInts(b, o + 3264, removals.size(), 0, 0, 0);
		for (int k = 0; k < removals.size(); k++) {
			float[] rm = removals.get(k);
			putFloats(b, o + 3280 + k * 32, rm[0], rm[1], rm[2], 0.0F);
			putFloats(b, o + 3296 + k * 32, rm[3], rm[4], rm[5], 0.0F);
		}
		putFloats(b, o + 3792, (float) (level.getMinY() - r.oy) * res - 8.0F, WaterRegion.KILL_MARGIN, 0.0F, 0.0F);
		writeMaterialGlobals(b, o, r.material, res, dt);
		writeIceGlobals(b, o, r.material, r.hasColdBlocks() || r.coldBiome, r.coldBiome, res, dt);
		this.uboRing.flush(o, UBO_SIZE);
		return sourceCount;
	}

	/** How the material looks: refraction, absorption and scattering, surface smoothing and highlights. */
	static void writeShadingGlobals(ByteBuffer b, int o, Material material, int res) {
		boolean sand = material.isGranular();
		boolean lava = material == Material.LAVA;
		boolean slime = material == Material.SLIME;
		boolean honey = material == Material.HONEY;
		float refraction = lava ? WaterSettings.lavaRefraction : slime ? WaterSettings.slimeRefraction : honey ? WaterSettings.honeyRefraction
			: WaterSettings.refraction;
		float surfaceSmooth = sand ? WaterSettings.sandSurfaceSmoothing : lava ? WaterSettings.lavaSurfaceSmoothing
			: slime ? WaterSettings.slimeSurfaceSmoothing : honey ? WaterSettings.honeySurfaceSmoothing : WaterSettings.surfaceSmoothing;
		putFloats(b, o + 512, WaterSettings.particleRadius / res, WaterSettings.thicknessScale, refraction, surfaceSmooth);
		if (honey) {
			putFloats(b, o + 528, WaterSettings.honeyAbsorbR, WaterSettings.honeyAbsorbG, WaterSettings.honeyAbsorbB, 0.0F);
			putFloats(b, o + 544, WaterSettings.honeyScatterR, WaterSettings.honeyScatterG, WaterSettings.honeyScatterB, WaterSettings.honeyScatterDensity);
		} else if (lava) {
			putFloats(b, o + 528, WaterSettings.lavaAbsorbR, WaterSettings.lavaAbsorbG, WaterSettings.lavaAbsorbB, 0.0F);
			putFloats(b, o + 544, WaterSettings.lavaScatterR, WaterSettings.lavaScatterG, WaterSettings.lavaScatterB, WaterSettings.lavaScatterDensity);
		} else if (slime) {
			putFloats(b, o + 528, WaterSettings.slimeAbsorbR, WaterSettings.slimeAbsorbG, WaterSettings.slimeAbsorbB, 0.0F);
			putFloats(b, o + 544, WaterSettings.slimeScatterR, WaterSettings.slimeScatterG, WaterSettings.slimeScatterB, WaterSettings.slimeScatterDensity);
		} else {
			putFloats(b, o + 528, WaterSettings.absorbR, WaterSettings.absorbG, WaterSettings.absorbB, 0.0F);
			putFloats(b, o + 544, WaterSettings.scatterR, WaterSettings.scatterG, WaterSettings.scatterB, WaterSettings.scatterDensity);
		}
		putFloats(b, o + 560, WaterSettings.wwRadius, WaterSettings.foamCoverage, WaterSettings.bubbleAlpha, WaterSettings.sprayAlpha);
		float detailStrength = lava ? WaterSettings.lavaDetailStrength : slime || honey ? 0.0F : WaterSettings.detailStrength;
		float roughness = lava ? WaterSettings.lavaRoughness : slime ? WaterSettings.slimeRoughness : honey ? WaterSettings.honeyRoughness
			: WaterSettings.roughness;
		float specular = lava ? WaterSettings.lavaSpecular : slime ? WaterSettings.slimeSpecular : honey ? WaterSettings.honeySpecular
			: WaterSettings.specular;
		putFloats(b, o + 3808, detailStrength, WaterSettings.detailScale, WaterSettings.detailSpeed, roughness);
		putFloats(b, o + 3824, specular, WaterSettings.wetDarkening, WaterSettings.filmShading, WaterSettings.foamBubbleSize);
	}

	/** The material block of the globals (matA..matE): the solver constants that differ between water, lava, sand, slime and honey. */
	static void writeMaterialGlobals(ByteBuffer b, int o, Material material, int res, float dt) {
		boolean lava = material == Material.LAVA;
		boolean honey = material == Material.HONEY;
		if (material == Material.SLIME) {
			// Elastic jelly: fixed-corotated stiffness, Kelvin-Voigt damping (scaled like the stiffness: particle density
			// times blocks^2/s in cell units), and the restitution used against bouncy blocks such as anvils.
			float nu = Math.clamp(WaterSettings.slimePoisson, 0.0F, 0.45F);
			float e = PARTICLES_PER_CELL * Math.max(WaterSettings.slimeStiffness, 0.0F) * res * res;
			float mu = e / (2.0F * (1.0F + nu));
			float lambda = e * nu / ((1.0F + nu) * (1.0F - 2.0F * nu));
			float damping = PARTICLES_PER_CELL * Math.max(WaterSettings.slimeDamping, 0.0F) * res * res;
			putFloats(b, o + 3840, material.shaderId(), 0.0F, 0.0F, 1.0F);
			putFloats(b, o + 3856, mu, lambda, 1.0F, WaterSettings.sandGrainSize);
			putFloats(b, o + 3872, Math.clamp(WaterSettings.slimeBounce, 0.0F, 1.0F), 1.0F / PARTICLES_PER_CELL,
				Math.clamp(WaterSettings.slimeFloorBounce, 0.0F, 1.0F), Math.max(WaterSettings.slimeFloorFriction, 0.0F));
			putFloats(b, o + 3888, damping, Math.max(WaterSettings.slimeGrip, 0.0F) * res, Math.max(WaterSettings.slimeCeilingHold, 0.0F), 0.0F);
			putFloats(b, o + 3904, WaterSettings.sandRestSpeed * res, WaterSettings.sandRestTime, WaterSettings.sandWakeAccel * WaterSettings.gravity * res * dt,
				0.0F);
			return;
		}
		if (material.isGranular()) {
			double phi = Math.toRadians(WaterSettings.sandFrictionAngle);
			float alpha = (float) (Math.sqrt(2.0 / 3.0) * 2.0 * Math.sin(phi) / (3.0 - Math.sin(phi)));
			float e = PARTICLES_PER_CELL * WaterSettings.sandStiffness * res * res;
			float mu = e / (2.0F * (1.0F + SAND_POISSON));
			float lambda = e * SAND_POISSON / ((1.0F + SAND_POISSON) * (1.0F - 2.0F * SAND_POISSON));
			putFloats(b, o + 3840, material.shaderId(), alpha, WaterSettings.sandCohesion, 1.0F);
			putFloats(b, o + 3856, mu, lambda, Math.max(1, WaterSettings.sandGrainsPerParticle), WaterSettings.sandGrainSize);
			float impactViscosity = WaterSettings.sandImpactDamping * 0.25F / Math.max(dt, 1e-5F);
			putFloats(b, o + 3872, WaterSettings.sandWallFriction, 1.0F / PARTICLES_PER_CELL, impactViscosity, WaterSettings.sandImpactRate);
		} else {
			float filmFriction = lava ? WaterSettings.lavaFilmFriction : honey ? WaterSettings.honeyFilmFriction : WaterSettings.filmFriction;
			float strandedTime = lava ? WaterSettings.lavaStrandedTime : honey ? WaterSettings.honeyStrandedTime : WaterSettings.strandedTime;
			int strandedNeighbors = lava ? WaterSettings.lavaStrandedNeighbors : honey ? WaterSettings.honeyStrandedNeighbors
				: WaterSettings.strandedNeighbors;
			float filmDepth = (lava ? WaterSettings.lavaFilmDepth : honey ? WaterSettings.honeyFilmDepth : WaterSettings.filmDepth) * res;
			// Viscosity in cell units per step (blocks^2/s scaled to cells^2/s, times dt): the implicit solve's alpha.
			float viscosity = Math.max(lava ? WaterSettings.lavaViscosity : honey ? WaterSettings.honeyViscosity : 0.0F, 0.0F) * res * res * dt;
			putFloats(b, o + 3840, material.shaderId(), 0.0F, 0.0F, 1.0F);
			putFloats(b, o + 3856, filmFriction, strandedTime, strandedNeighbors, filmDepth);
			putFloats(b, o + 3872, viscosity, 0.0F, 0.0F, 0.0F);
		}
		putFloats(b, o + 3888, WaterSettings.sandGrainMinPixels, WaterSettings.sandBrightness, WaterSettings.sandGrainSpread, 0.0F);
		float impactLogJ = (float) Math.log(Math.max(1.0F - WaterSettings.sandImpactCompression, 0.01F));
		putFloats(b, o + 3904, WaterSettings.sandRestSpeed * res, WaterSettings.sandRestTime, WaterSettings.sandWakeAccel * WaterSettings.gravity * res * dt,
			impactLogJ);
	}

	/**
	 * Freezing (iceA) and breaking (iceB). Water touching ice (an ice block, or water that froze already) turns solid where
	 * it is; in a snowy biome it also freezes from its surface. Ice melts again once nothing cold is left in the region, and
	 * entities moving into it shatter it. The shaders roll per particle and step; one frozen particle makes its whole cell
	 * ice, so the chances are scaled down by the particles per cell to give the cell-level rates the settings name.
	 */
	static void writeIceGlobals(ByteBuffer b, int o, Material material, boolean cold, boolean coldBiome, int res, float dt) {
		if (material == Material.HONEY) {
			// Honey reuses the slots for coming apart: how fast that spreads through it, and how close a body has to come.
			float spread = Math.max(WaterSettings.honeyBreakSpeed, 0.0F) * res * dt;
			putFloats(b, o + 3920, 0.0F, perParticle(spread), 0.0F, 0.0F);
			putFloats(b, o + 3936, Math.max(WaterSettings.honeyBreakRadius, 0.0F) * res, 0.0F, 0.0F, 0.0F);
			return;
		}
		boolean freezing = material == Material.WATER && WaterSettings.freezing && cold;
		float front = Math.max(WaterSettings.freezeSpeed, 0.0F) * res * dt;
		float surface = coldBiome ? Math.max(WaterSettings.coldBiomeFreezeRate, 0.0F) * dt : 0.0F;
		float melt = Math.clamp(Math.max(WaterSettings.meltRate, 0.0F) * dt, 0.0F, 1.0F);
		putFloats(b, o + 3920, freezing ? 1.0F : 0.0F, perParticle(front), perParticle(surface), melt);
		putFloats(b, o + 3936, Math.max(WaterSettings.shatterRadius, 0.0F) * res, 0.0F, 0.0F, 0.0F);
	}

	/** The per-particle chance that gives a cell of PARTICLES_PER_CELL particles this chance of at least one. */
	private static float perParticle(float cellChance) {
		float c = Math.clamp(cellChance, 0.0F, 1.0F);
		return c >= 1.0F ? 1.0F : (float) (1.0 - Math.pow(1.0 - c, 1.0 / PARTICLES_PER_CELL));
	}

	private static float wrap(double v) {
		return (float) (v - Math.floor(v / WORLD_WRAP) * WORLD_WRAP);
	}

	private int writeSources(WaterRegion r, ByteBuffer b, int o) {
		int n = 0;
		for (BlockPos p : this.sourcesFor(r)) {
			if (n >= MAX_SOURCES || !r.windowContains(p, 0)) {
				continue;
			}
			putFloats(b, o + n * 16, (p.getX() - r.ox) * r.res, (p.getY() - r.oy) * r.res, (p.getZ() - r.oz) * r.res, WaterSettings.sourceFill);
			n++;
		}
		return n;
	}

	private int writeEntities(Minecraft mc, WaterRegion r, ByteBuffer b, int o, float partialTick) {
		AABB window = new AABB(r.ox, r.oy, r.oz, r.ox + r.sx, r.oy + r.sy, r.oz + r.sz).inflate(1.0);
		List<Entity> entities = new ArrayList<>(mc.level.getEntities((Entity) null, window));
		this.localPlayerFirst = mc.player != null && entities.remove(mc.player);
		if (this.localPlayerFirst) {
			entities.addFirst(mc.player);
		}
		int n = 0;
		float res = r.res;
		for (Entity e : entities) {
			if (n >= MAX_ENTITIES) {
				break;
			}
			if (e.isSpectator()) {
				continue;
			}
			double ix = Mth.lerp(partialTick, e.xo, e.getX());
			double iy = Mth.lerp(partialTick, e.yo, e.getY());
			double iz = Mth.lerp(partialTick, e.zo, e.getZ());
			AABB box = e.getBoundingBox().move(ix - e.getX(), iy - e.getY(), iz - e.getZ());
			int base = o + n * 48;
			putFloats(b, base, (float) (box.minX - r.ox) * res, (float) (box.minY - r.oy) * res, (float) (box.minZ - r.oz) * res, 0.0F);
			putFloats(b, base + 16, (float) (box.maxX - r.ox) * res, (float) (box.maxY - r.oy) * res, (float) (box.maxZ - r.oz) * res, 0.0F);
			putFloats(b, base + 32, (float) (e.getX() - e.xo) * 20.0F * res, (float) (e.getY() - e.yo) * 20.0F * res, (float) (e.getZ() - e.zo) * 20.0F * res, 0.0F);
			n++;
		}
		for (PistonMovingBlockEntity piston : movingPistons(mc.level, window)) {
			if (n >= MAX_ENTITIES) {
				break;
			}
			BlockPos p = piston.getBlockPos();
			AABB box = new AABB(p).move(piston.getXOff(partialTick), piston.getYOff(partialTick), piston.getZOff(partialTick));
			Direction d = piston.getMovementDirection();
			float speed = piston.getProgress(partialTick) < 1.0F ? 10.0F * res : 0.0F;
			int base = o + n * 48;
			putFloats(b, base, (float) (box.minX - r.ox) * res, (float) (box.minY - r.oy) * res, (float) (box.minZ - r.oz) * res, 0.0F);
			putFloats(b, base + 16, (float) (box.maxX - r.ox) * res, (float) (box.maxY - r.oy) * res, (float) (box.maxZ - r.oz) * res, 0.0F);
			putFloats(b, base + 32, d.getStepX() * speed, d.getStepY() * speed, d.getStepZ() * speed, 0.0F);
			n++;
		}
		return n;
	}

	private static List<PistonMovingBlockEntity> movingPistons(ClientLevel level, AABB area) {
		List<PistonMovingBlockEntity> out = new ArrayList<>();
		for (int cx = SectionPos.blockToSectionCoord(area.minX); cx <= SectionPos.blockToSectionCoord(area.maxX); cx++) {
			for (int cz = SectionPos.blockToSectionCoord(area.minZ); cz <= SectionPos.blockToSectionCoord(area.maxZ); cz++) {
				LevelChunk chunk = level.getChunkSource().getChunk(cx, cz, ChunkStatus.FULL, false);
				if (chunk == null) {
					continue;
				}
				for (BlockEntity be : chunk.getBlockEntities().values()) {
					if (be instanceof PistonMovingBlockEntity piston && area.contains(Vec3.atCenterOf(piston.getBlockPos()))) {
						out.add(piston);
					}
				}
			}
		}
		return out;
	}

	private static void putInts(ByteBuffer b, int o, int x, int y, int z, int w) {
		b.putInt(o, x).putInt(o + 4, y).putInt(o + 8, z).putInt(o + 12, w);
	}

	private static void putFloats(ByteBuffer b, int o, float x, float y, float z, float w) {
		b.putFloat(o, x).putFloat(o + 4, y).putFloat(o + 8, z).putFloat(o + 12, w);
	}


	public String statsLine() {
		if (this.regions.isEmpty()) {
			return "Nothing simulated right now (place a Realistic Water Bucket, Realistic Sand, Slime or Honey, or use /fill)";
		}
		int fluid = 0;
		int lavaFluid = 0;
		int sand = 0;
		int slime = 0;
		int honey = 0;
		int ww = 0;
		int bodies = 0;
		int lavaBodies = 0;
		int piles = 0;
		int jellies = 0;
		int honeyBodies = 0;
		long cells = 0;
		long windowCells = 0;
		for (WaterRegion r : this.regions) {
			if (r.material == Material.SLIME) {
				slime += r.lastFluidCount;
				jellies++;
			} else if (r.material.isGranular()) {
				sand += r.lastFluidCount;
				piles++;
			} else if (r.material == Material.LAVA) {
				lavaFluid += r.lastFluidCount;
				lavaBodies++;
			} else if (r.material == Material.HONEY) {
				honey += r.lastFluidCount;
				honeyBodies++;
			} else {
				fluid += r.lastFluidCount;
				bodies++;
			}
			ww += r.lastWhitewaterCount;
			if (r.box != null && r.boxWorld != null) {
				cells += WaterRegion.boxCells(r.box);
			}
			windowCells += r.numCells;
		}
		return String.format("%d water bodies  fluid %,d  whitewater %,d  |  %d lava bodies  lava fluid %,d  |  %d sand bodies  sand particles %,d  |  "
				+ "%d slimes  slime particles %,d  |  %d honey bodies  honey particles %,d  |  "
				+ "active %,d cells of %,d allocated  |  frame %.1f ms  water steps %d x %.1f ms  sand steps %d x %.2f ms  sources %d  %s",
			bodies, fluid, ww, lavaBodies, lavaFluid, piles, sand, jellies, slime, honeyBodies, honey, cells, windowCells, this.smoothedFrameMs, this.lastSteps,
			this.lastDt * 1000.0F,
			this.lastSandSteps, this.lastSandDt * 1000.0F, this.sources.size(), isHost() ? "(syncing blocks)" : "(not host: blocks follow the server)");
	}

	public void clear() {
		this.closeRegions();
		this.sources.clear();
		this.chunkScanQueue.clear();
		this.failed = false;
	}

	public void shutdown() {
		ClipRecorder.get().shutdown();
		this.clear();
		if (this.renderer != null || this.sandRenderer != null) {
			Vk.waitIdle();
		}
		if (this.renderer != null) {
			this.renderer.close();
			this.renderer = null;
		}
		if (this.sandRenderer != null) {
			this.sandRenderer.close();
			this.sandRenderer = null;
		}
		if (this.uboRing != null) {
			this.uboRing.close();
			this.frameView.close();
			this.uboRing = null;
			this.frameView = null;
		}
		WaterRegion.closePrograms();
		Vk.flushDeferredNow();
	}
}
