package me.skaffy.client.water;

import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import org.jspecify.annotations.Nullable;

/**
 * A dispenser squeezing a block of slime, honey or mud out of its mouth (see OozePayload): the block it placed comes out
 * as a soft rope pushed through the opening, slab after slab, instead of appearing as a whole cube at once.
 */
final class Ooze {
	final BlockPos pos;
	final Direction out;
	final Material material;
	/** Frame after which a block that never showed up is no longer expected. */
	final int expires;
	private boolean started;
	/** Volume still to come out (blocks^3). */
	private float remaining;
	/** Gap between the dispenser's face and what came out last (blocks): it grows with the speed and the next slab fills it. */
	private float gap;

	Ooze(BlockPos pos, Direction out, Material material, int expires) {
		this.pos = pos;
		this.out = out;
		this.material = material;
		this.expires = expires;
	}

	void start(float volume) {
		this.started = true;
		this.remaining = volume;
	}

	boolean started() {
		return this.started;
	}

	boolean done() {
		return this.started && this.remaining <= 1e-3F;
	}

	/** How fast dispensers push material out (blocks/s). */
	static float speed() {
		return Math.max(WaterSettings.oozeSpeed, 0.1F);
	}

	/** The slab that comes out over the next dt seconds, whole emitter layers at a time, or null while the gap is too thin. */
	WaterRegion.@Nullable Emitter advance(float dt) {
		if (this.done()) {
			return null;
		}
		float width = Math.clamp(WaterSettings.oozeWidth, 0.2F, 1.0F);
		float speed = speed();
		this.gap += speed * dt;
		float layer = 0.5F / WaterWorld.resolutionFor(this.material);
		int layers = (int) (this.gap / layer);
		if (layers == 0) {
			return null;
		}
		float length = Math.min(layers * layer, this.remaining / (width * width));
		float near = this.gap - layers * layer;
		this.gap = near;
		this.remaining -= length * width * width;
		double[] lo = {this.pos.getX() + 0.5 - width * 0.5, this.pos.getY() + 0.5 - width * 0.5, this.pos.getZ() + 0.5 - width * 0.5};
		double[] hi = {lo[0] + width, lo[1] + width, lo[2] + width};
		int[] step = {this.out.getStepX(), this.out.getStepY(), this.out.getStepZ()};
		int[] base = {this.pos.getX(), this.pos.getY(), this.pos.getZ()};
		for (int a = 0; a < 3; a++) {
			if (step[a] > 0) {
				lo[a] = base[a] + near;
				hi[a] = lo[a] + length;
			} else if (step[a] < 0) {
				hi[a] = base[a] + 1.0 - near;
				lo[a] = hi[a] - length;
			}
		}
		// Honey from a dispenser comes out running, not set.
		return new WaterRegion.Emitter(lo[0], lo[1], lo[2], hi[0], hi[1], hi[2], step[0] * speed, step[1] * speed, step[2] * speed, true);
	}
}
