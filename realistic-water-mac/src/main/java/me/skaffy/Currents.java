package me.skaffy;

import java.lang.reflect.Method;
import java.util.HashSet;
import java.util.Set;
import me.skaffy.fluid.RealisticWaterFluid;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * What running realistic water does to the world around it, shared by the client (which simulates the water, so it
 * knows where and how fast it flows, and asks) and the server (which checks, then does it): it drags what floats or
 * stands in it along with the current, and a fast current tears loose blocks out of its bed and banks (sand, gravel,
 * concrete powder; soil too when it is strong) and carries them off as falling blocks that settle further downstream.
 * Vanilla blocks and methods the mod didn't use before are looked up by name, so a renamed one only drops out.
 */
public final class Currents {
	public static final int NONE = 0;
	/** Sand, gravel and concrete powder: washed away by a current. */
	public static final int LOOSE = 1;
	/** Dirt, grass, mud, clay: washed away only by a strong one. */
	public static final int SOIL = 2;

	private static @Nullable Set<Block> loose;
	private static @Nullable Set<Block> soil;
	private static boolean fallLookedUp;
	private static @Nullable Method fall;
	private static @Nullable Class<?> fallingBlock;

	private Currents() {
	}

	public static int kind(BlockState state) {
		if (loose == null) {
			Set<Block> l = new HashSet<>();
			add(l, "SAND", "RED_SAND", "GRAVEL");
			for (String color : new String[]{"WHITE", "ORANGE", "MAGENTA", "LIGHT_BLUE", "YELLOW", "LIME", "PINK", "GRAY", "LIGHT_GRAY", "CYAN",
				"PURPLE", "BLUE", "BROWN", "GREEN", "RED", "BLACK"}) {
				add(l, color + "_CONCRETE_POWDER");
			}
			Set<Block> s = new HashSet<>();
			add(s, "DIRT", "COARSE_DIRT", "ROOTED_DIRT", "GRASS_BLOCK", "PODZOL", "MYCELIUM", "MUD", "CLAY");
			soil = s;
			loose = l;
		}
		if (state.isAir()) {
			return NONE;
		}
		Block block = state.getBlock();
		return loose.contains(block) ? LOOSE : soil != null && soil.contains(block) ? SOIL : NONE;
	}

	private static void add(Set<Block> set, String... names) {
		for (String name : names) {
			try {
				if (Blocks.class.getField(name).get(null) instanceof Block b) {
					set.add(b);
				}
			} catch (ReflectiveOperationException | RuntimeException | LinkageError ignored) {
				// Not in this version: it just isn't washed away.
			}
		}
	}

	/** One axis of a flow packed the way the simulation reads it back: three 10-bit fields of 1/32 blocks/s. */
	public static float unpack(int packed, int axis) {
		return (((packed >>> (10 * axis)) & 1023) - 512) / 32.0F;
	}

	/**
	 * Pulls an entity's motion toward the water's flow (blocks/s), in proportion to how deep in it it is (wet, 0..1) and
	 * how strongly it is grabbed (per tick). Only a downward flow pushes down; floating up is the water's own business.
	 */
	public static void drag(Entity entity, double ux, double uy, double uz, double wet, double grip, double lift) {
		Vec3 v = entity.getDeltaMovement();
		double k = Math.clamp(grip * wet, 0.0, 1.0);
		double dy = uy < 0.0 ? Math.min(0.0, (uy / 20.0 - v.y) * k) : 0.0;
		entity.setDeltaMovement(v.x + (ux / 20.0 - v.x) * k, v.y + dy + lift * wet, v.z + (uz / 20.0 - v.z) * k);
	}

	/** Server side: the current a client measured around an entity, applied to it. Players move themselves. */
	public static void push(ServerLevel level, Entity entity, double ux, double uy, double uz, double wet) {
		if (entity instanceof net.minecraft.world.entity.player.Player) {
			return;
		}
		boolean carriedBlock = isFallingBlock(entity);
		// Loose blocks in the water sink slowly (most of their weight is carried) so the current takes them a long way.
		double grip = carriedBlock ? 0.3 : entity instanceof LivingEntity ? 0.08 : 0.25;
		drag(entity, ux, uy, uz, Math.clamp(wet, 0.0, 1.0), grip, carriedBlock ? 0.03 : 0.0);
	}

	/** Server side: a client saw fast water tear at pos. Lifts the block out into the current if it is still there and wet. */
	public static boolean erode(ServerLevel level, BlockPos pos, double ux, double uy, double uz) {
		BlockState state = level.getBlockState(pos);
		if (kind(state) == NONE || !touchesRealisticWater(level, pos)) {
			return false;
		}
		Entity carried = fall(level, pos, state);
		if (carried == null) {
			return level.destroyBlock(pos, true);
		}
		carried.setDeltaMovement(ux / 20.0, Math.max(uy / 20.0, 0.08), uz / 20.0);
		return true;
	}

	private static boolean touchesRealisticWater(ServerLevel level, BlockPos pos) {
		int[][] around = {{0, 1, 0}, {1, 0, 0}, {-1, 0, 0}, {0, 0, 1}, {0, 0, -1}};
		for (int[] d : around) {
			if (RealisticWaterFluid.isRealistic(level.getFluidState(pos.offset(d[0], d[1], d[2])))) {
				return true;
			}
		}
		return false;
	}

	private static boolean isFallingBlock(Entity entity) {
		lookUpFall();
		return fallingBlock != null && fallingBlock.isInstance(entity);
	}

	// FallingBlockEntity.fall(level, pos, state): takes the block out and makes it a falling block entity.
	private static @Nullable Entity fall(ServerLevel level, BlockPos pos, BlockState state) {
		lookUpFall();
		Method m = fall;
		if (m == null) {
			return null;
		}
		try {
			return m.invoke(null, level, pos, state) instanceof Entity e ? e : null;
		} catch (ReflectiveOperationException | RuntimeException | LinkageError e) {
			RealisticWater.LOGGER.warn("Realistic Water: can't lift blocks into currents ({}), breaking them instead", e.toString());
			fall = null;
			return null;
		}
	}

	private static void lookUpFall() {
		if (fallLookedUp) {
			return;
		}
		fallLookedUp = true;
		try {
			fallingBlock = Class.forName("net.minecraft.world.entity.item.FallingBlockEntity");
			fall = fallingBlock.getMethod("fall", net.minecraft.world.level.Level.class, BlockPos.class, BlockState.class);
		} catch (ReflectiveOperationException | RuntimeException | LinkageError e) {
			RealisticWater.LOGGER.warn("Realistic Water: no falling blocks for currents to carry ({})", e.toString());
		}
	}
}
