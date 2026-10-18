package me.skaffy.net;

import me.skaffy.Currents;
import me.skaffy.RealisticWater;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;

/** Client to server, every tick: the water's flow (blocks/s) around entities in it and how deep in it they are (0..1). */
public record CurrentsPayload(int[] ids, float[] flow) implements CustomPacketPayload {
	public static final Type<CurrentsPayload> TYPE = new Type<>(RealisticWater.id("currents"));
	public static final StreamCodec<RegistryFriendlyByteBuf, CurrentsPayload> CODEC = StreamCodec.of(CurrentsPayload::write, CurrentsPayload::read);
	public static final int MAX_ENTRIES = 256;
	private static final double REACH = 160.0;

	private static void write(RegistryFriendlyByteBuf buf, CurrentsPayload payload) {
		buf.writeVarInt(payload.ids.length);
		for (int i = 0; i < payload.ids.length; i++) {
			buf.writeVarInt(payload.ids[i]);
			for (int k = 0; k < 4; k++) {
				buf.writeFloat(payload.flow[i * 4 + k]);
			}
		}
	}

	private static CurrentsPayload read(RegistryFriendlyByteBuf buf) {
		int n = Math.min(buf.readVarInt(), MAX_ENTRIES);
		int[] ids = new int[n];
		float[] flow = new float[n * 4];
		for (int i = 0; i < n; i++) {
			ids[i] = buf.readVarInt();
			for (int k = 0; k < 4; k++) {
				flow[i * 4 + k] = buf.readFloat();
			}
		}
		return new CurrentsPayload(ids, flow);
	}

	@Override
	public Type<CurrentsPayload> type() {
		return TYPE;
	}

	public void apply(ServerPlayer player) {
		ServerLevel level = player.level();
		for (int i = 0; i < this.ids.length; i++) {
			Entity entity = level.getEntity(this.ids[i]);
			if (entity == null || entity.distanceToSqr(player) > REACH * REACH) {
				continue;
			}
			float ux = Math.clamp(this.flow[i * 4], -20.0F, 20.0F);
			float uy = Math.clamp(this.flow[i * 4 + 1], -20.0F, 20.0F);
			float uz = Math.clamp(this.flow[i * 4 + 2], -20.0F, 20.0F);
			Currents.push(level, entity, ux, uy, uz, this.flow[i * 4 + 3]);
		}
	}
}
