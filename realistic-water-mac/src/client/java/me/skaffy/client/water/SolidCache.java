package me.skaffy.client.water;

import it.unimi.dsi.fastutil.longs.Long2ObjectOpenHashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import me.skaffy.RealisticWater;
import me.skaffy.block.RealisticSandBlock;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.BlockPos;
import net.minecraft.core.SectionPos;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.LevelChunk;
import net.minecraft.world.level.chunk.LevelChunkSection;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.jspecify.annotations.Nullable;

final class SolidCache {
	static final byte EMPTY = 0;
	static final byte FULL = 1;
	static final byte PARTIAL = 2;
	/** Cell value of a bouncy solid in the uploaded grid (any non-zero value is solid; slime bounces off this one). */
	static final int BOUNCY_SOLID = 2;
	private static final Set<Block> BOUNCY = bouncyBlocks();

	final int res;
	final boolean ignoreSand;
	private final int bitsPerBlock;
	private final Long2ObjectOpenHashMap<Section> sections = new Long2ObjectOpenHashMap<>();

	private static final class Section {
		final byte[] kind = new byte[4096];
		final long[] @Nullable [] partial = new long[4096][];
		final boolean[] bouncy = new boolean[4096];
	}

	private static Set<Block> bouncyBlocks() {
		Set<Block> out = new HashSet<>();
		try {
			for (Block b : new Block[]{Blocks.ANVIL, Blocks.CHIPPED_ANVIL, Blocks.DAMAGED_ANVIL}) {
				if (b != null) {
					out.add(b);
				}
			}
		} catch (LinkageError e) {
			RealisticWater.LOGGER.warn("Realistic Water: anvils not found, slime won't bounce off them", e);
		}
		return out;
	}

	SolidCache(int res, boolean ignoreSand) {
		this.res = res;
		this.ignoreSand = ignoreSand;
		this.bitsPerBlock = res * res * res;
	}

	private static int local(int x, int y, int z) {
		return (x & 15) | (y & 15) << 4 | (z & 15) << 8;
	}

	void clear() {
		this.sections.clear();
	}

	void invalidateChunk(int chunkX, int chunkZ) {
		this.sections.keySet().removeIf(key -> SectionPos.x(key) == chunkX && SectionPos.z(key) == chunkZ);
	}

	boolean update(ClientLevel level, BlockPos pos) {
		Section s = this.sections.get(SectionPos.asLong(pos.getX() >> 4, pos.getY() >> 4, pos.getZ() >> 4));
		if (s == null) {
			return true;
		}
		int i = local(pos.getX(), pos.getY(), pos.getZ());
		byte oldKind = s.kind[i];
		long[] oldBits = s.partial[i];
		boolean oldBouncy = s.bouncy[i];
		this.voxelizeBlock(level, pos, level.getBlockState(pos), s, i);
		return oldKind != s.kind[i] || oldBouncy != s.bouncy[i] || (s.kind[i] == PARTIAL && !java.util.Arrays.equals(oldBits, s.partial[i]));
	}

	private @Nullable Section section(ClientLevel level, int sx, int sy, int sz) {
		long key = SectionPos.asLong(sx, sy, sz);
		Section s = this.sections.get(key);
		if (s != null) {
			return s;
		}
		int sectionIndex = level.getSectionIndexFromSectionY(sy);
		if (sectionIndex >= level.getSectionsCount()) {
			s = new Section();
			this.sections.put(key, s);
			return s;
		}
		if (sectionIndex < 0 || !level.hasChunk(sx, sz)) {
			return null;
		}
		LevelChunk chunk = level.getChunk(sx, sz);
		LevelChunkSection chunkSection = chunk.getSection(sectionIndex);
		s = new Section();
		if (!chunkSection.hasOnlyAir()) {
			BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
			for (int i = 0; i < 4096; i++) {
				int x = i & 15;
				int y = (i >> 4) & 15;
				int z = i >> 8;
				BlockState state = chunkSection.getBlockState(x, y, z);
				if (state.isAir()) {
					continue;
				}
				pos.set((sx << 4) + x, (sy << 4) + y, (sz << 4) + z);
				this.voxelizeBlock(level, pos, state, s, i);
			}
		}
		this.sections.put(key, s);
		return s;
	}

	private void voxelizeBlock(ClientLevel level, BlockPos pos, BlockState state, Section s, int i) {
		s.partial[i] = null;
		s.bouncy[i] = !state.isAir() && BOUNCY.contains(state.getBlock());
		boolean skip = state.isAir() || (this.ignoreSand && state.getBlock() instanceof RealisticSandBlock);
		VoxelShape shape = skip ? null : state.getCollisionShape(level, pos);
		if (shape == null || shape.isEmpty()) {
			s.kind[i] = EMPTY;
			return;
		}
		if (Block.isShapeFullBlock(shape)) {
			s.kind[i] = FULL;
			return;
		}
		List<AABB> boxes = shape.toAabbs();
		long[] bits = new long[(this.bitsPerBlock + 63) / 64];
		boolean any = false;
		int r = this.res;
		for (int k = 0; k < r; k++) {
			for (int j = 0; j < r; j++) {
				for (int c = 0; c < r; c++) {
					double cx = (c + 0.5) / r;
					double cy = (j + 0.5) / r;
					double cz = (k + 0.5) / r;
					for (AABB box : boxes) {
						if (cx >= box.minX - 1e-4 && cx <= box.maxX + 1e-4 && cy >= box.minY - 1e-4 && cy <= box.maxY + 1e-4
							&& cz >= box.minZ - 1e-4 && cz <= box.maxZ + 1e-4) {
							int bit = c + r * (j + r * k);
							bits[bit >> 6] |= 1L << (bit & 63);
							any = true;
							break;
						}
					}
				}
			}
		}
		s.kind[i] = any ? PARTIAL : EMPTY;
		s.partial[i] = any ? bits : null;
	}

	void writeBlock(ClientLevel level, int bx, int by, int bz, int[] out, int cx, int cy, int cz, int nx, int ny) {
		Section s = this.section(level, bx >> 4, by >> 4, bz >> 4);
		byte kind;
		long[] bits = null;
		int solid = 1;
		if (s == null) {
			kind = FULL;
		} else {
			int i = local(bx, by, bz);
			kind = s.kind[i];
			bits = s.partial[i];
			solid = s.bouncy[i] ? BOUNCY_SOLID : 1;
		}
		int r = this.res;
		for (int k = 0; k < r; k++) {
			for (int j = 0; j < r; j++) {
				int row = cx + nx * ((cy + j) + ny * (cz + k));
				for (int c = 0; c < r; c++) {
					int v;
					if (kind == EMPTY) {
						v = 0;
					} else if (kind == FULL) {
						v = solid;
					} else {
						int bit = c + r * (j + r * k);
						v = (int) ((bits[bit >> 6] >>> (bit & 63)) & 1L) * solid;
					}
					out[row + c] = v;
				}
			}
		}
	}
}
