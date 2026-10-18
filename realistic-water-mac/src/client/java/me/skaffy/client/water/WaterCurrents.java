package me.skaffy.client.water;

import it.unimi.dsi.fastutil.floats.FloatArrayList;
import it.unimi.dsi.fastutil.ints.IntArrayList;
import it.unimi.dsi.fastutil.ints.IntOpenHashSet;
import it.unimi.dsi.fastutil.longs.LongArrayList;
import it.unimi.dsi.fastutil.longs.LongOpenHashSet;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;
import me.skaffy.Currents;
import me.skaffy.net.CurrentsPayload;
import me.skaffy.net.ErodePayload;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.AABB;
import org.jspecify.annotations.Nullable;

/**
 * Running water acting on the world, from the flow the simulation reads back per block: it drags the local player along
 * (and, when this client hosts the world, asks the server to drag items, mobs, boats and loose blocks), and where it runs
 * fast it tears sand, gravel and the like out of its bed and banks for the server to send downstream.
 */
final class WaterCurrents {
	/** Below this flow (blocks/s) water counts as still: it leaves what is in it to vanilla. */
	private static final float STILL = 0.3F;
	private static final int MAX_PUSHED = 128;
	private static final int MAX_ERODED = 4;
	private static final int[][] BED_AND_BANKS = {{0, -1, 0}, {1, 0, 0}, {-1, 0, 0}, {0, 0, 1}, {0, 0, -1}};

	/** The water around a box: {flow x, y, z (blocks/s, weighted by how full each block is), wetness 0..1}, or null if dry. */
	static float @Nullable [] sample(WaterRegion.Fill f, AABB box) {
		int x0 = (int) Math.floor(box.minX);
		int x1 = (int) Math.floor(box.maxX - 1e-6);
		int z0 = (int) Math.floor(box.minZ);
		int z1 = (int) Math.floor(box.maxZ - 1e-6);
		int y0 = (int) Math.floor(box.minY);
		int y1 = (int) Math.floor(Math.min(box.maxY, box.minY + 1.0) - 1e-6);
		float ux = 0.0F;
		float uy = 0.0F;
		float uz = 0.0F;
		float wet = 0.0F;
		int blocks = 0;
		for (int y = y0; y <= y1; y++) {
			for (int z = z0; z <= z1; z++) {
				for (int x = x0; x <= x1; x++) {
					blocks++;
					int i = f.index(x, y, z);
					if (i < 0) {
						continue;
					}
					float w = f.fullness(i);
					wet += w;
					ux += w * f.flow(i, 0);
					uy += w * f.flow(i, 1);
					uz += w * f.flow(i, 2);
				}
			}
		}
		if (wet < 1e-3F || blocks == 0) {
			return null;
		}
		return new float[]{ux / wet, uy / wet, uz / wet, Math.min(wet / blocks, 1.0F)};
	}

	void tick(ClientLevel level, @Nullable Player self, List<WaterRegion> regions, boolean host) {
		if (!WaterSettings.currents) {
			return;
		}
		IntArrayList ids = new IntArrayList();
		FloatArrayList flows = new FloatArrayList();
		IntOpenHashSet seen = new IntOpenHashSet();
		for (WaterRegion r : regions) {
			WaterRegion.Fill f = r.latestFill;
			if (r.material != Material.WATER || f == null) {
				continue;
			}
			AABB area = new AABB(f.x(), f.y(), f.z(), f.x() + f.dx(), f.y() + f.dy(), f.z() + f.dz());
			for (Entity e : level.getEntities((Entity) null, area)) {
				if (e.isSpectator() || !seen.add(e.getId())) {
					continue;
				}
				float[] u = sample(f, e.getBoundingBox());
				if (u == null || u[3] < 0.05F || u[0] * u[0] + u[1] * u[1] + u[2] * u[2] < STILL * STILL) {
					continue;
				}
				if (e == self) {
					Currents.drag(e, u[0], u[1], u[2], u[3], WaterSettings.currentPlayerGrip, 0.0);
				} else if (host && !(e instanceof Player) && ids.size() < MAX_PUSHED) {
					ids.add(e.getId());
					flows.addAll(FloatArrayList.wrap(u));
				}
			}
		}
		if (!ids.isEmpty() && ClientPlayNetworking.canSend(CurrentsPayload.TYPE)) {
			ClientPlayNetworking.send(new CurrentsPayload(ids.toIntArray(), flows.toFloatArray()));
		}
	}

	/** Host only: asks the server to wash away what this fill's fast water tears loose (see plan). */
	void erode(ClientLevel level, WaterRegion.Fill f) {
		if (!WaterSettings.waterErosion || !ClientPlayNetworking.canSend(ErodePayload.TYPE)) {
			return;
		}
		ErodePayload payload = this.plan(level, f);
		if (payload != null) {
			ClientPlayNetworking.send(payload);
		}
	}

	/** Where the water in this fill runs fast enough, rolls for the loose blocks it washes over and against. */
	@Nullable ErodePayload plan(ClientLevel level, WaterRegion.Fill f) {
		LongArrayList positions = new LongArrayList();
		IntArrayList packed = new IntArrayList();
		LongOpenHashSet taken = new LongOpenHashSet();
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		int i = 0;
		for (int z = 0; z < f.dz(); z++) {
			for (int y = 0; y < f.dy(); y++) {
				for (int x = 0; x < f.dx(); x++, i++) {
					float speed = f.blocksPerSecond(i);
					if (speed < WaterSettings.erosionSpeed || f.fullness(i) < 0.3F) {
						continue;
					}
					for (int[] d : BED_AND_BANKS) {
						pos.set(f.x() + x + d[0], f.y() + y + d[1], f.z() + z + d[2]);
						int kind = Currents.kind(level.getBlockState(pos));
						float threshold = kind == Currents.SOIL ? WaterSettings.soilErosionSpeed : WaterSettings.erosionSpeed;
						if (kind == Currents.NONE || speed < threshold) {
							continue;
						}
						float chance = Math.min(0.5F, (speed - threshold) * WaterSettings.erosionRate);
						if (ThreadLocalRandom.current().nextFloat() < chance && taken.add(pos.asLong())) {
							positions.add(pos.asLong());
							packed.add(f.flow()[i]);
							if (positions.size() >= MAX_ERODED) {
								return new ErodePayload(positions.toLongArray(), packed.toIntArray());
							}
						}
					}
				}
			}
		}
		return positions.isEmpty() ? null : new ErodePayload(positions.toLongArray(), packed.toIntArray());
	}
}
