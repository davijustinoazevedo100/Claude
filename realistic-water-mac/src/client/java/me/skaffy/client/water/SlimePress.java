package me.skaffy.client.water;

/**
 * The dent a body presses into Realistic Slime when it lands on it. The game bounces the body straight back up (the
 * slime block's own bounce); this pushes the jelly under its footprint down for a moment, deeper the harder it landed,
 * so the pad visibly gives way like a trampoline and then springs back and wobbles by itself.
 */
final class SlimePress {
	/** How long the press would take to go down and come back (seconds); only the way down pushes. */
	private static final float DURATION = 0.4F;

	final double minX;
	final double minZ;
	final double maxX;
	final double maxZ;
	/** The top of the jelly where it landed (blocks). */
	final double top;
	/** How deep the dent goes (blocks). */
	final float depth;
	private float age;

	SlimePress(double minX, double minZ, double maxX, double maxZ, double top, float landingSpeed) {
		this.minX = minX;
		this.minZ = minZ;
		this.maxX = maxX;
		this.maxZ = maxZ;
		this.top = top;
		this.depth = Math.clamp(landingSpeed * 0.045F * WaterSettings.slimeTrampoline, 0.0F, 0.65F);
	}

	/** Bodies that hit the slime at least this fast (blocks/s) press a dent into it. */
	static float minSpeed() {
		return 3.0F;
	}

	void advance(float dt) {
		this.age += dt;
	}

	boolean done() {
		return this.age >= DURATION * 0.5F || this.depth <= 0.01F;
	}

	/**
	 * This moment's pressing box as {minX, minY, minZ, maxX, maxY, maxZ, vx, vy, vz} in blocks and blocks/s: the footprint,
	 * from the bottom of the dent up through the jelly's top, moving down as the dent deepens.
	 */
	double[] box() {
		double phase = Math.PI * this.age / DURATION;
		double bottom = this.top - this.depth * Math.sin(phase);
		double speed = this.depth * Math.PI / DURATION * Math.cos(phase);
		return new double[]{this.minX, bottom, this.minZ, this.maxX, this.top + 1.0, this.maxZ, 0.0, -speed, 0.0};
	}
}
