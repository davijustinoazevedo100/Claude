package me.skaffy.dispenser;

import java.lang.reflect.Field;
import me.skaffy.ModContent;
import me.skaffy.RealisticWater;
import me.skaffy.net.OozePayload;
import me.skaffy.net.SyncMaterial;
import net.fabricmc.fabric.api.networking.v1.PlayerLookup;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.dispenser.BlockSource;
import net.minecraft.core.dispenser.DefaultDispenseItemBehavior;
import net.minecraft.core.dispenser.DispenseItemBehavior;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.DispenserBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.Property;
import org.jspecify.annotations.Nullable;

/**
 * Realistic Slime, Honey or Mud in a dispenser: it squeezes the block out into the space in front of it, and tells the
 * clients around so they simulate it oozing out of the dispenser's mouth. With that space taken it spits the item out
 * like any other.
 */
public final class OozeDispenseBehavior implements DispenseItemBehavior {
	/** Vanilla's level events: the dispenser's click and its puff of smoke (data: the facing). */
	private static final int DISPENSE_SOUND = 1000;
	private static final int DISPENSE_SMOKE = 2000;

	private static @Nullable Property<?> facing;
	private static boolean facingLookedUp;

	private final Block block;
	private final byte material;
	private final DispenseItemBehavior fallback = new DefaultDispenseItemBehavior();

	private OozeDispenseBehavior(Block block, byte material) {
		this.block = block;
		this.material = material;
	}

	public static void register() {
		try {
			DispenserBlock.registerBehavior(ModContent.REALISTIC_SLIME_ITEM, new OozeDispenseBehavior(ModContent.REALISTIC_SLIME, SyncMaterial.SLIME));
			DispenserBlock.registerBehavior(ModContent.REALISTIC_HONEY_ITEM, new OozeDispenseBehavior(ModContent.REALISTIC_HONEY, SyncMaterial.HONEY));
			DispenserBlock.registerBehavior(ModContent.REALISTIC_MUD_ITEM, new OozeDispenseBehavior(ModContent.REALISTIC_MUD, SyncMaterial.MUD));
		} catch (RuntimeException | LinkageError e) {
			RealisticWater.LOGGER.warn("Realistic Water: dispensers can't squeeze out slime, honey or mud ({})", e.toString());
		}
	}

	@Override
	public ItemStack dispense(BlockSource source, ItemStack stack) {
		Direction out;
		ServerLevel level;
		BlockPos front;
		try {
			level = source.level();
			out = facing(source.state());
			if (out == null) {
				return this.fallback.dispense(source, stack);
			}
			front = source.pos().relative(out);
			if (!level.getBlockState(front).isAir()) {
				return this.fallback.dispense(source, stack);
			}
		} catch (ReflectiveOperationException | RuntimeException | LinkageError e) {
			return this.fallback.dispense(source, stack);
		}
		// The payload goes out right away, the block change at the end of the tick: clients learn it is oozing first.
		OozePayload payload = new OozePayload(front.asLong(), (byte) out.get3DDataValue(), this.material);
		try {
			for (ServerPlayer player : PlayerLookup.tracking(level, front)) {
				ServerPlayNetworking.send(player, payload);
			}
		} catch (RuntimeException | LinkageError e) {
			RealisticWater.LOGGER.debug("Realistic Water: ooze notice not sent", e);
		}
		level.setBlock(front, this.block.defaultBlockState(), Block.UPDATE_ALL);
		stack.shrink(1);
		try {
			level.levelEvent(DISPENSE_SOUND, source.pos(), 0);
			level.levelEvent(DISPENSE_SMOKE, source.pos(), out.get3DDataValue());
		} catch (RuntimeException | LinkageError ignored) {
			// Cosmetic only.
		}
		return stack;
	}

	// The dispenser's facing, found by the property's name so its declared type (which has changed between versions)
	// doesn't matter.
	private static @Nullable Direction facing(BlockState state) throws ReflectiveOperationException {
		if (!facingLookedUp) {
			facingLookedUp = true;
			Field f = DispenserBlock.class.getField("FACING");
			facing = (Property<?>) f.get(null);
		}
		return facing != null && value(state, facing) instanceof Direction d ? d : null;
	}

	private static <T extends Comparable<T>> Object value(BlockState state, Property<T> property) {
		return state.getValue(property);
	}
}
