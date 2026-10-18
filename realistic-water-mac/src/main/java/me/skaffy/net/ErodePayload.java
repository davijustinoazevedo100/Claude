package me.skaffy.net;

import me.skaffy.Currents;
import me.skaffy.RealisticWater;
import net.minecraft.core.BlockPos;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;

/** Client to server: blocks a fast current is tearing loose, each with the flow (packed, see Currents) that carries it off. */
public record ErodePayload(long[] positions, int[] flows) implements CustomPacketPayload {
	public static final Type<ErodePayload> TYPE = new Type<>(RealisticWater.id("erode"));
	public static final StreamCodec<RegistryFriendlyByteBuf, ErodePayload> CODEC = StreamCodec.of(ErodePayload::write, ErodePayload::read);
	public static final int MAX_ENTRIES = 256;

	private static void write(RegistryFriendlyByteBuf buf, ErodePayload payload) {
		buf.writeVarInt(payload.positions.length);
		for (int i = 0; i < payload.positions.length; i++) {
			buf.writeLong(payload.positions[i]);
			buf.writeInt(payload.flows[i]);
		}
	}

	private static ErodePayload read(RegistryFriendlyByteBuf buf) {
		int n = Math.min(buf.readVarInt(), MAX_ENTRIES);
		long[] positions = new long[n];
		int[] flows = new int[n];
		for (int i = 0; i < n; i++) {
			positions[i] = buf.readLong();
			flows[i] = buf.readInt();
		}
		return new ErodePayload(positions, flows);
	}

	@Override
	public Type<ErodePayload> type() {
		return TYPE;
	}

	public void apply(ServerPlayer player) {
		ServerLevel level = player.level();
		for (int i = 0; i < this.positions.length; i++) {
			BlockPos pos = BlockPos.of(this.positions[i]);
			if (!level.isLoaded(pos) || pos.distSqr(player.blockPosition()) > 512 * 512) {
				continue;
			}
			int f = this.flows[i];
			Currents.erode(level, pos, Currents.unpack(f, 0), Currents.unpack(f, 1), Currents.unpack(f, 2));
		}
	}
}
