package me.skaffy.client.water;

import java.lang.reflect.Method;
import java.util.concurrent.ThreadLocalRandom;
import me.skaffy.RealisticWater;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.BlockPos;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockState;
import org.jspecify.annotations.Nullable;

/**
 * Frozen water's links to the world: whether a spot is in a snowy biome, and the ice-breaking effect where something
 * broke it. Both go through reflection, on methods the rest of the mod doesn't use, so a renamed one only switches its
 * effect off instead of failing the frame.
 */
final class IceEffects {
	/** Vanilla's "block broken" level event: the block's break sound and its shards. */
	private static final int BLOCK_BROKEN = 2001;

	private static boolean biomeLookedUp;
	private static @Nullable Method getBiome;
	private static @Nullable Method holderValue;
	private static @Nullable Method seaLevel;
	private static @Nullable Method coldEnoughToSnow;
	private static @Nullable Method baseTemperature;

	private static boolean effectLookedUp;
	private static @Nullable Method levelEvent;
	private static int iceStateId;
	private static @Nullable SoundEvent glassBreak;

	private IceEffects() {
	}

	/** Whether it is cold enough to snow at pos (snowy biomes, high mountains), by vanilla's own rule when it can be found. */
	static boolean coldBiome(ClientLevel level, BlockPos pos) {
		if (!biomeLookedUp) {
			biomeLookedUp = true;
			lookUpBiome();
		}
		Method biomeAt = getBiome;
		Method value = holderValue;
		if (biomeAt == null || value == null) {
			return false;
		}
		try {
			Object biome = value.invoke(biomeAt.invoke(level, pos));
			Method snow = coldEnoughToSnow;
			if (snow != null) {
				Object cold = snow.getParameterCount() == 2 ? snow.invoke(biome, pos, seaLevel != null ? seaLevel.invoke(level) : 63) : snow.invoke(biome, pos);
				return Boolean.TRUE.equals(cold);
			}
			return baseTemperature != null && baseTemperature.invoke(biome) instanceof Float t && t < 0.15F;
		} catch (ReflectiveOperationException | RuntimeException | LinkageError e) {
			RealisticWater.LOGGER.warn("Realistic Water: biome temperature lookup failed, water now only freezes next to ice", e);
			getBiome = null;
			return false;
		}
	}

	private static void lookUpBiome() {
		try {
			getBiome = ClientLevel.class.getMethod("getBiome", BlockPos.class);
			holderValue = Class.forName("net.minecraft.core.Holder").getMethod("value");
			Class<?> biome = Class.forName("net.minecraft.world.level.biome.Biome");
			coldEnoughToSnow = method(biome, "coldEnoughToSnow", BlockPos.class, int.class);
			if (coldEnoughToSnow == null) {
				coldEnoughToSnow = method(biome, "coldEnoughToSnow", BlockPos.class);
			}
			baseTemperature = method(biome, "getBaseTemperature");
			seaLevel = method(ClientLevel.class, "getSeaLevel");
			if (coldEnoughToSnow == null && baseTemperature == null) {
				throw new NoSuchMethodException("Biome.coldEnoughToSnow / Biome.getBaseTemperature");
			}
		} catch (ReflectiveOperationException | RuntimeException | LinkageError e) {
			RealisticWater.LOGGER.warn("Realistic Water: can't read biome temperatures ({}), water only freezes next to ice", e.toString());
			getBiome = null;
		}
	}

	/** The vanilla ice-breaking effect (glass sound and ice shards) where frozen water was broken. */
	static void shatter(ClientLevel level, double x, double y, double z) {
		if (!effectLookedUp) {
			effectLookedUp = true;
			lookUpEffect();
		}
		Method event = levelEvent;
		if (event != null) {
			try {
				event.invoke(level, BLOCK_BROKEN, BlockPos.containing(x, y, z), iceStateId);
				return;
			} catch (ReflectiveOperationException | RuntimeException | LinkageError e) {
				RealisticWater.LOGGER.warn("Realistic Water: ice break effect failed, playing only its sound from now on", e);
				levelEvent = null;
			}
		}
		if (glassBreak != null) {
			level.playLocalSound(x, y, z, glassBreak, SoundSource.BLOCKS, 1.0F, 0.8F + ThreadLocalRandom.current().nextFloat() * 0.3F, false);
		}
	}

	private static void lookUpEffect() {
		try {
			Object ice = Blocks.class.getField("ICE").get(null);
			Object state = Block.class.getMethod("defaultBlockState").invoke(ice);
			iceStateId = (int) Block.class.getMethod("getId", BlockState.class).invoke(null, state);
			levelEvent = ClientLevel.class.getMethod("levelEvent", int.class, BlockPos.class, int.class);
		} catch (ReflectiveOperationException | RuntimeException | LinkageError e) {
			RealisticWater.LOGGER.warn("Realistic Water: no ice break particles ({})", e.toString());
			levelEvent = null;
		}
		try {
			Object glass = SoundType.class.getField("GLASS").get(null);
			glassBreak = (SoundEvent) SoundType.class.getMethod("getBreakSound").invoke(glass);
		} catch (ReflectiveOperationException | RuntimeException | LinkageError e) {
			RealisticWater.LOGGER.warn("Realistic Water: no glass break sound ({})", e.toString());
		}
	}

	private static @Nullable Method method(Class<?> owner, String name, Class<?>... params) {
		try {
			return owner.getMethod(name, params);
		} catch (NoSuchMethodException e) {
			return null;
		}
	}
}
