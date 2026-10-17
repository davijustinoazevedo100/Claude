import java.nio.ByteBuffer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import me.skaffy.client.vk.ShaderSource;
import org.lwjgl.system.MemoryUtil;
import org.lwjgl.util.shaderc.Shaderc;

/**
 * Precompiles every shader variant the mod creates into assets/realistic-water/shaders/spv, named by a hash of the exact
 * GLSL text (see ShaderSource), so the game doesn't need shaderc's native library. Run tools/precompile-shaders.sh.
 */
public final class ShaderPrecompiler {
	private record Variant(String name, int kind, Map<String, String> defines) {
	}

	private static final List<Variant> VARIANTS = new ArrayList<>();

	private static void compute(String name, String... defines) {
		VARIANTS.add(new Variant(name, Shaderc.shaderc_compute_shader, defines(defines)));
	}

	private static void graphics(String vert, String frag, String... defines) {
		VARIANTS.add(new Variant(vert, Shaderc.shaderc_vertex_shader, defines(defines)));
		VARIANTS.add(new Variant(frag, Shaderc.shaderc_fragment_shader, defines(defines)));
	}

	private static Map<String, String> defines(String... kv) {
		Map<String, String> out = new TreeMap<>();
		for (int i = 0; i < kv.length; i += 2) {
			out.put(kv[i], kv[i + 1]);
		}
		return out;
	}

	static {
		// Keep in sync with the ComputeProgram/GraphicsProgram constructors; a missing variant just compiles at runtime.
		for (String name : new String[]{"args", "emit", "clear_box", "p2g", "classify", "faces", "divergence", "project", "extrapolate", "potential",
			"g2p", "ww_update", "inflow", "probe", "shift", "remove", "merge", "blockfill", "mpm_clear", "mpm_p2g", "mpm_grid", "mpm_g2p",
			"mg_flags0", "mg_coarsen", "mg_smooth", "mg_restrict", "mg_prolong", "cg_init", "cg_apply", "cg_dot", "cg_reduce", "cg_update",
			"cg_direction", "mg_coarse", "fine_clear", "blur", "nets_vertices", "nets_quads", "mesh_args", "sheet_fill", "zb_splat", "zb_field",
			"grain_cull", "viscosity"}) {
			compute(name + ".comp");
		}
		compute("blockfill.comp", "MPM", "1");
		graphics("mesh.vert", "mesh_front.frag");
		graphics("particle.vert", "droplet_front.frag", "DROPLETS", "1", "VIEW_BINDING", "3");
		graphics("mesh.vert", "mesh_thickness.frag");
		graphics("particle.vert", "droplet_thickness.frag", "DROPLETS", "1", "VIEW_BINDING", "3");
		graphics("particle.vert", "whitewater.frag", "VIEW_BINDING", "4");
		graphics("fullscreen.vert", "composite.frag");
		graphics("grain.vert", "grain.frag");
	}

	public static void main(String[] args) throws Exception {
		Path out = Path.of(args[0]);
		Files.createDirectories(out);
		try (var old = Files.list(out)) {
			for (Path p : (Iterable<Path>) old::iterator) {
				if (p.toString().endsWith(".spv")) {
					Files.delete(p);
				}
			}
		}
		long compiler = Shaderc.shaderc_compiler_initialize();
		int written = 0;
		for (Variant v : VARIANTS) {
			String plain = ShaderSource.expand(v.name(), v.defines());
			written += write(compiler, out, v, plain);
			if (plain.contains(ShaderSource.PRESERVE_NAN)) {
				Map<String, String> preserving = new TreeMap<>(v.defines());
				preserving.put(ShaderSource.PRESERVE_NAN, "1");
				written += write(compiler, out, v, ShaderSource.expand(v.name(), preserving));
			}
		}
		Shaderc.shaderc_compiler_release(compiler);
		System.out.println("Wrote " + written + " SPIR-V files to " + out);
	}

	private static int write(long compiler, Path out, Variant v, String text) throws Exception {
		Path file = out.resolve(Path.of(ShaderSource.spvPath(v.name(), v.kind(), text)).getFileName());
		if (Files.exists(file)) {
			return 0;
		}
		long options = Shaderc.shaderc_compile_options_initialize();
		ByteBuffer src = MemoryUtil.memUTF8(text, false);
		ByteBuffer name = MemoryUtil.memUTF8(v.name());
		ByteBuffer entry = MemoryUtil.memUTF8("main");
		try {
			Shaderc.shaderc_compile_options_set_target_env(options, Shaderc.shaderc_target_env_vulkan, Shaderc.shaderc_env_version_vulkan_1_2);
			Shaderc.shaderc_compile_options_set_optimization_level(options, Shaderc.shaderc_optimization_level_performance);
			long result = Shaderc.shaderc_compile_into_spv(compiler, src, v.kind(), name, entry, options);
			try {
				if (Shaderc.shaderc_result_get_compilation_status(result) != Shaderc.shaderc_compilation_status_success) {
					throw new IllegalStateException("Shader " + v.name() + " " + v.defines() + " failed:\n" + Shaderc.shaderc_result_get_error_message(result));
				}
				ByteBuffer spv = Shaderc.shaderc_result_get_bytes(result);
				byte[] bytes = new byte[spv.remaining()];
				spv.get(bytes);
				Files.write(file, bytes);
				return 1;
			} finally {
				Shaderc.shaderc_result_release(result);
			}
		} finally {
			MemoryUtil.memFree(src);
			MemoryUtil.memFree(name);
			MemoryUtil.memFree(entry);
			Shaderc.shaderc_compile_options_release(options);
		}
	}
}
