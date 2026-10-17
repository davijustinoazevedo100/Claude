package me.skaffy.client.vk;

import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.LongBuffer;
import java.util.HashMap;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.lwjgl.system.MemoryStack;
import org.lwjgl.system.MemoryUtil;
import org.lwjgl.util.shaderc.Shaderc;
import org.lwjgl.vulkan.VK10;
import org.lwjgl.vulkan.VkShaderModuleCreateInfo;

public final class Shaders {
	public static final int VERTEX = Shaderc.shaderc_vertex_shader;
	public static final int FRAGMENT = Shaderc.shaderc_fragment_shader;
	public static final int COMPUTE = Shaderc.shaderc_compute_shader;
	private static final int SPIRV_MAGIC = 0x07230203;

	private Shaders() {
	}

	public static String load(String name) {
		return ShaderSource.load(name);
	}

	public static long module(String name, int kind, Map<String, String> defines) {
		String full = ShaderSource.expand(name, defines);
		if (Vk.preserveNan() && full.contains(ShaderSource.PRESERVE_NAN)) {
			Map<String, String> preserving = new HashMap<>(defines);
			preserving.put(ShaderSource.PRESERVE_NAN, "1");
			full = ShaderSource.expand(name, preserving);
		}
		byte[] spv = precompiled(name, kind, full);
		if (spv == null) {
			spv = compile(name, kind, full);
		}
		ByteBuffer code = MemoryUtil.memAlloc(spv.length);
		try (MemoryStack stack = MemoryStack.stackPush()) {
			code.put(spv).flip();
			VkShaderModuleCreateInfo info = VkShaderModuleCreateInfo.calloc(stack).sType$Default().pCode(code);
			LongBuffer pModule = stack.mallocLong(1);
			Vk.check(VK10.vkCreateShaderModule(Vk.vk(), info, null, pModule), "vkCreateShaderModule " + name);
			return pModule.get(0);
		} finally {
			MemoryUtil.memFree(code);
		}
	}

	// SPIR-V built from this exact text at build time, so shaderc's native library is only needed for edited shaders.
	private static byte @Nullable [] precompiled(String name, int kind, String full) {
		try (InputStream in = Shaders.class.getResourceAsStream(ShaderSource.spvPath(name, kind, full))) {
			if (in == null) {
				return null;
			}
			byte[] spv = in.readAllBytes();
			boolean valid = spv.length >= 20 && spv.length % 4 == 0 && ByteBuffer.wrap(spv).order(ByteOrder.LITTLE_ENDIAN).getInt(0) == SPIRV_MAGIC;
			return valid ? spv : null;
		} catch (IOException e) {
			return null;
		}
	}

	private static byte[] compile(String name, int kind, String full) {
		long compiler;
		try {
			compiler = Shaderc.shaderc_compiler_initialize();
		} catch (LinkageError e) {
			throw new IllegalStateException("Shader " + name + " isn't precompiled and the shaderc library failed to load (" + e + ")", e);
		}
		long options = Shaderc.shaderc_compile_options_initialize();
		ByteBuffer src = MemoryUtil.memUTF8(full, false);
		try (MemoryStack stack = MemoryStack.stackPush()) {
			Shaderc.shaderc_compile_options_set_target_env(options, Shaderc.shaderc_target_env_vulkan, Shaderc.shaderc_env_version_vulkan_1_2);
			Shaderc.shaderc_compile_options_set_optimization_level(options, Shaderc.shaderc_optimization_level_performance);
			long result = Shaderc.shaderc_compile_into_spv(compiler, src, kind, stack.UTF8(name), stack.UTF8("main"), options);
			try {
				if (Shaderc.shaderc_result_get_compilation_status(result) != Shaderc.shaderc_compilation_status_success) {
					throw new IllegalStateException("Shader " + name + " failed to compile:\n" + Shaderc.shaderc_result_get_error_message(result));
				}
				ByteBuffer bytes = Shaderc.shaderc_result_get_bytes(result);
				byte[] spv = new byte[bytes.remaining()];
				bytes.get(spv);
				return spv;
			} finally {
				Shaderc.shaderc_result_release(result);
			}
		} finally {
			MemoryUtil.memFree(src);
			Shaderc.shaderc_compile_options_release(options);
			Shaderc.shaderc_compiler_release(compiler);
		}
	}
}
