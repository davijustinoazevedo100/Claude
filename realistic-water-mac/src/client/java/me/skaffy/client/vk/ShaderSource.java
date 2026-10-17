package me.skaffy.client.vk;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * Builds the exact GLSL text a shader is compiled from and names its precompiled SPIR-V. Kept free of Vulkan and
 * Minecraft classes so the build-time precompiler (tools/shader-precompiler) can use the same rules.
 */
public final class ShaderSource {
	public static final String ROOT = "/assets/realistic-water/shaders/";
	public static final String SPV_ROOT = ROOT + "spv/";
	public static final String PRESERVE_NAN = "RW_PRESERVE_NAN";

	private ShaderSource() {
	}

	public static String load(String name) {
		try (InputStream in = ShaderSource.class.getResourceAsStream(ROOT + name)) {
			if (in == null) {
				throw new IllegalStateException("Missing shader " + name);
			}
			return new String(in.readAllBytes(), StandardCharsets.UTF_8);
		} catch (IOException e) {
			throw new IllegalStateException("Failed to read shader " + name, e);
		}
	}

	private static String preprocess(String source, Set<String> seen) {
		StringBuilder out = new StringBuilder();
		for (String line : source.split("\n", -1)) {
			String trimmed = line.trim();
			if (trimmed.startsWith("#include")) {
				int a = trimmed.indexOf('"');
				int b = trimmed.lastIndexOf('"');
				String file = trimmed.substring(a + 1, b);
				if (seen.add(file)) {
					out.append(preprocess(load(file), seen)).append('\n');
				}
			} else {
				out.append(line).append('\n');
			}
		}
		return out.toString();
	}

	/** The shader with its defines spliced in after #version (sorted, so the text is stable) and includes expanded. */
	public static String expand(String name, Map<String, String> defines) {
		String source = load(name);
		int nl = source.indexOf('\n');
		StringBuilder head = new StringBuilder(source.substring(0, nl + 1));
		new TreeMap<>(defines).forEach((k, v) -> head.append("#define ").append(k).append(' ').append(v).append('\n'));
		return preprocess(head + source.substring(nl + 1), new HashSet<>());
	}

	/** Resource path of the precompiled SPIR-V for this exact text; a stale file simply never matches. */
	public static String spvPath(String name, int kind, String text) {
		try {
			MessageDigest sha = MessageDigest.getInstance("SHA-256");
			byte[] digest = sha.digest((kind + "\n" + text).getBytes(StandardCharsets.UTF_8));
			return SPV_ROOT + name + "-" + HexFormat.of().formatHex(digest, 0, 8) + ".spv";
		} catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}
}
