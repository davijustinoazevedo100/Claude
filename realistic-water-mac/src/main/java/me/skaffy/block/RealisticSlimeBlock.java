package me.skaffy.block;

import net.minecraft.core.BlockPos;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.IntegerProperty;
import net.minecraft.world.level.pathfinder.PathComputationType;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * Marks where the simulated jelly is, in eighths of a block like Realistic Sand. The client draws and simulates the
 * slime itself; the block only keeps it in the world (and lets players target and break it).
 */
public class RealisticSlimeBlock extends Block {
	public static final int MAX_LAYERS = 8;
	public static final IntegerProperty LAYERS = BlockStateProperties.LAYERS;
	private static final VoxelShape[] SHAPES = Block.boxes(MAX_LAYERS, height -> Block.column(16.0, 0.0, height * 2));

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
		return Shapes.empty();
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
		return true;
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
