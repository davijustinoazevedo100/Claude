package me.skaffy.block;

import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.IntegerProperty;
import net.minecraft.world.level.pathfinder.PathComputationType;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * Marks where the simulated jelly is, in eighths of a block like Realistic Sand. The client draws and simulates the
 * slime itself; the block keeps it in the world, lets players target and break it, and is solid like a slime block, so
 * walking into or onto it doesn't tear the jelly apart. It is springy like one too: what lands on it bounces back up
 * with no fall damage (sneak to land without bouncing), feet sink a little into its top, and walking on it is squishy.
 */
public class RealisticSlimeBlock extends Block {
	public static final int MAX_LAYERS = 8;
	public static final IntegerProperty LAYERS = BlockStateProperties.LAYERS;
	private static final VoxelShape[] SHAPES = Block.boxes(MAX_LAYERS, height -> Block.column(16.0, 0.0, height * 2));
	/** What stands on the jelly sinks into its top a little (up to 3/16 of a block), pressing a dent in it. */
	private static final VoxelShape[] COLLISION = Block.boxes(MAX_LAYERS, height -> Block.column(16.0, 0.0, Math.max(height * 2 - 3, height)));
	/** How much of its landing speed a body keeps when it bounces off (living bodies; the rest bounce a bit less). */
	private static final double BOUNCE = 0.92;

	public RealisticSlimeBlock(Properties properties) {
		super(properties);
		this.registerDefaultState(this.stateDefinition.any().setValue(LAYERS, MAX_LAYERS));
	}

	public static int layers(BlockState state) {
		return state.getBlock() instanceof RealisticSlimeBlock ? state.getValue(LAYERS) : 0;
	}

	@Override
	protected RenderShape getRenderShape(final BlockState state) {
		return RenderShape.INVISIBLE;
	}

	@Override
	protected VoxelShape getShape(final BlockState state, final BlockGetter level, final BlockPos pos, final CollisionContext context) {
		return SHAPES[state.getValue(LAYERS)];
	}

	@Override
	protected VoxelShape getCollisionShape(final BlockState state, final BlockGetter level, final BlockPos pos, final CollisionContext context) {
		return COLLISION[state.getValue(LAYERS)];
	}

	@Override
	public void fallOn(final Level level, final BlockState state, final BlockPos pos, final Entity entity, final double fallDistance) {
		// The jelly gives way: no fall damage.
	}

	@Override
	public void updateEntityMovementAfterFallOn(final BlockGetter level, final Entity entity) {
		Vec3 v = entity.getDeltaMovement();
		if (v.y < 0.0 && !suppressesBounce(entity)) {
			entity.setDeltaMovement(v.x, -v.y * (entity instanceof LivingEntity ? BOUNCE : BOUNCE * 0.8), v.z);
		} else {
			super.updateEntityMovementAfterFallOn(level, entity);
		}
	}

	@Override
	public void stepOn(final Level level, final BlockPos pos, final BlockState state, final Entity entity) {
		Vec3 v = entity.getDeltaMovement();
		double up = Math.abs(v.y);
		if (up < 0.1 && !steppingCarefully(entity)) {
			double drag = 0.6 + up * 0.2;
			entity.setDeltaMovement(v.x * drag, v.y, v.z * drag);
		}
		super.stepOn(level, pos, state, entity);
	}

	// Sneaking lands without bouncing, like on a slime block; these entity checks only switch the nicety off if missing.
	private static boolean suppressesBounce(Entity entity) {
		try {
			return entity.isSuppressingBounce();
		} catch (LinkageError e) {
			return false;
		}
	}

	private static boolean steppingCarefully(Entity entity) {
		try {
			return entity.isSteppingCarefully();
		} catch (LinkageError e) {
			return false;
		}
	}

	@Override
	protected VoxelShape getVisualShape(final BlockState state, final BlockGetter level, final BlockPos pos, final CollisionContext context) {
		return Shapes.empty();
	}

	@Override
	protected boolean propagatesSkylightDown(final BlockState state) {
		return true;
	}

	@Override
	protected boolean isPathfindable(final BlockState state, final PathComputationType type) {
		return false;
	}

	@Override
	protected boolean canBeReplaced(final BlockState state, final BlockPlaceContext context) {
		if (context.getItemInHand().is(this.asItem())) {
			return state.getValue(LAYERS) < MAX_LAYERS;
		}
		return false;
	}

	@Override
	protected void createBlockStateDefinition(final StateDefinition.Builder<Block, BlockState> builder) {
		builder.add(LAYERS);
	}
}
