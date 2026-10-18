package me.skaffy.client.water;

import me.skaffy.net.SyncMaterial;
import org.jspecify.annotations.Nullable;

public enum Material {
	WATER,
	SAND,
	LAVA,
	SLIME,
	HONEY,
	MUD;

	float shaderId() {
		return switch (this) {
			case SAND -> 1.0F;
			case LAVA -> 2.0F;
			case SLIME -> 3.0F;
			case HONEY -> 4.0F;
			case MUD -> 5.0F;
			default -> 0.0F;
		};
	}

	boolean isGranular() {
		return this == SAND;
	}

	/** Simulated with MPM (particles carrying a deformation gradient) instead of the FLIP liquid solver. */
	boolean usesMpm() {
		return this == SAND || this == SLIME;
	}

	boolean isFluidSim() {
		return this == WATER || this == LAVA || this == HONEY || this == MUD;
	}

	/** Kept in the world as layered blocks (eighths of a block) rather than fluid levels. */
	boolean usesLayers() {
		return this == SAND || this == SLIME || this == HONEY || this == MUD;
	}

	boolean usesWhitewater() {
		return this == WATER;
	}

	static @Nullable Material fromSyncId(byte id) {
		for (Material m : values()) {
			if (m.syncId() == id) {
				return m;
			}
		}
		return null;
	}

	byte syncId() {
		return switch (this) {
			case SAND -> SyncMaterial.SAND;
			case LAVA -> SyncMaterial.LAVA;
			case SLIME -> SyncMaterial.SLIME;
			case HONEY -> SyncMaterial.HONEY;
			case MUD -> SyncMaterial.MUD;
			default -> SyncMaterial.WATER;
		};
	}
}
