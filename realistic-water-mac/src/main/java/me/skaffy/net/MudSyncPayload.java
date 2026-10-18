package me.skaffy.net;

import me.skaffy.ModContent;
import me.skaffy.RealisticWater;
import me.skaffy.block.RealisticMudBlock;
import net.minecraft.core.BlockPos;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;

public record MudSyncPayload(long[] positions, byte[] layers) implements CustomPacketPayload {
	public static final Type<MudSyncPayload> TYPE = new Type<>(RealisticWater.id("mud_sync"));
	public static final StreamCodec<RegistryFriendlyByteBuf, MudSyncPayload> CODEC = StreamCodec.of(MudSyncPayload::write, MudSyncPayload::read);
	public static final int MAX_ENTRIES = 32768;

	private static void write(RegistryFriendlyByteBuf buf, MudSyncPayload payload) {
		buf.writeVarInt(payload.positions.length);
		for (int i = 0; i < payload.positions.length; i++) {
			buf.writeLong(payload.positions[i]);
			buf.writeByte(payload.layers[i]);
		}
	}

	private static MudSyncPayload read(RegistryFriendlyByteBuf buf) {
		int n = Math.min(buf.readVarInt(), MAX_ENTRIES);
		long[] positions = new long[n];
		byte[] layers = new byte[n];
		for (int i = 0; i < n; i++) {
			positions[i] = buf.readLong();
			layers[i] = buf.readByte();
		}
		return new MudSyncPayload(positions, layers);
	}

	@Override
	public Type<MudSyncPayload> type() {
		return TYPE;
	}

	public static BlockState stateFor(int layers) {
		return ModContent.REALISTIC_MUD.defaultBlockState().setValue(RealisticMudBlock.LAYERS, Math.clamp(layers, 1, RealisticMudBlock.MAX_LAYERS));
	}

	private static final int SYNC_FLAGS = Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE | Block.UPDATE_SKIP_ON_PLACE;

	public void apply(ServerPlayer player) {
		ServerLevel level = player.level();
		for (int i = 0; i < this.positions.length; i++) {
			BlockPos pos = BlockPos.of(this.positions[i]);
			if (!level.isLoaded(pos) || pos.distSqr(player.blockPosition()) > 512 * 512) {
				continue;
			}
			BlockState current = level.getBlockState(pos);
			boolean ours = current.getBlock() == ModContent.REALISTIC_MUD;
			int layers = this.layers[i];
			if (layers <= 0) {
				if (ours) {
					level.setBlock(pos, Blocks.AIR.defaultBlockState(), SYNC_FLAGS);
				}
			} else if (ours || current.isAir()) {
				BlockState target = stateFor(layers);
				if (current != target) {
					level.setBlock(pos, target, SYNC_FLAGS);
				}
			}
		}
	}
}
