package me.skaffy.net;

import me.skaffy.RealisticWater;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/**
 * Server to client: a dispenser just squeezed a realistic material (a {@link SyncMaterial} id) into the block at pos,
 * facing out of the dispenser (a 3D data value). The block itself arrives as a normal block update right after; the
 * client then simulates it oozing out of the dispenser's mouth instead of popping in as a cube.
 */
public record OozePayload(long pos, byte facing, byte material) implements CustomPacketPayload {
	public static final Type<OozePayload> TYPE = new Type<>(RealisticWater.id("ooze"));
	public static final StreamCodec<RegistryFriendlyByteBuf, OozePayload> CODEC = StreamCodec.of(
		(buf, p) -> {
			buf.writeLong(p.pos);
			buf.writeByte(p.facing);
			buf.writeByte(p.material);
		},
		buf -> new OozePayload(buf.readLong(), buf.readByte(), buf.readByte()));

	@Override
	public Type<OozePayload> type() {
		return TYPE;
	}
}
