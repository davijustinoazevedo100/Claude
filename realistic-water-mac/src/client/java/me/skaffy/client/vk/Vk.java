package me.skaffy.client.vk;

import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.renderpearl.api.device.GpuDevice;
import com.mojang.renderpearl.backend.api.GpuDeviceBackend;
import com.mojang.renderpearl.backend.vulkan.VulkanCommandEncoder;
import com.mojang.renderpearl.backend.vulkan.VulkanDevice;
import com.mojang.renderpearl.frontend.FrontendGpuDevice;
import java.nio.LongBuffer;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import me.skaffy.RealisticWater;
import me.skaffy.client.mixin.FrontendGpuDeviceAccessor;
import org.jspecify.annotations.Nullable;
import org.lwjgl.system.MemoryStack;
import org.lwjgl.vulkan.KHRGetPhysicalDeviceProperties2;
import org.lwjgl.vulkan.VK10;
import org.lwjgl.vulkan.VK11;
import org.lwjgl.vulkan.VKCapabilitiesDevice;
import org.lwjgl.vulkan.VKCapabilitiesInstance;
import org.lwjgl.vulkan.VkCommandBuffer;
import org.lwjgl.vulkan.VkDescriptorPoolCreateInfo;
import org.lwjgl.vulkan.VkDescriptorPoolSize;
import org.lwjgl.vulkan.VkDescriptorSetAllocateInfo;
import org.lwjgl.vulkan.VkDevice;
import org.lwjgl.vulkan.VkImageMemoryBarrier;
import org.lwjgl.vulkan.VkMemoryBarrier;
import org.lwjgl.vulkan.VkPhysicalDevice;
import org.lwjgl.vulkan.VkPhysicalDeviceFloatControlsProperties;
import org.lwjgl.vulkan.VkPhysicalDeviceLimits;
import org.lwjgl.vulkan.VkPhysicalDeviceMemoryProperties;
import org.lwjgl.vulkan.VkPhysicalDeviceProperties;
import org.lwjgl.vulkan.VkPhysicalDeviceProperties2;

public final class Vk {
	public static final int STAGE_ALL = 0x00010000;
	public static final int ACCESS_READ_WRITE = 0x00008000 | 0x00010000;
	// Per-frame CPU-written data (uniforms, emitters, readbacks) cycles through this many slots. One more than the
	// frames Minecraft keeps in flight, so a GPU running behind (MoltenVK queues deeper) never reads a slot being rewritten.
	public static final int FRAME_RING = 4;
	private static final int POOL_SETS = 512;

	private static @Nullable VulkanDevice device;
	private static final List<VkTex> pendingTransitions = new ArrayList<>();
	private static final ArrayDeque<Deferred> deferred = new ArrayDeque<>();
	private static long frame;
	private static boolean pushDescriptors;
	private static boolean coreRendering;
	private static boolean khrRendering;
	private static boolean preserveNan;
	private static long maxStorageBufferRange = Integer.MAX_VALUE;
	private static long deviceLocalHeap = Long.MAX_VALUE;
	@SuppressWarnings("unchecked")
	private static final List<Long>[] descriptorPools = new List[FRAME_RING + 1];
	private static final long[] poolFrame = new long[FRAME_RING + 1];
	private static final int[] poolCursor = new int[FRAME_RING + 1];

	private record Deferred(long frame, AutoCloseable resource) {
	}

	private Vk() {
	}

	public static @Nullable VulkanDevice tryDevice() {
		if (device != null) {
			return device;
		}
		GpuDevice gpu = RenderSystem.getDevice();
		if (gpu instanceof FrontendGpuDevice frontend) {
			GpuDeviceBackend backend = ((FrontendGpuDeviceAccessor) frontend).realisticWater$getBackend();
			if (backend instanceof VulkanDevice vulkan) {
				probe(vulkan.vkDevice());
				device = vulkan;
			}
		}
		return device;
	}

	// Picks code paths from what the device Minecraft created actually enabled (MoltenVK on macOS differs from desktop drivers).
	private static void probe(VkDevice vk) {
		VKCapabilitiesDevice caps = vk.getCapabilities();
		pushDescriptors = caps.vkCmdPushDescriptorSetKHR != 0L && !Boolean.getBoolean("realisticwater.noPushDescriptors");
		coreRendering = caps.vkCmdBeginRendering != 0L && caps.vkCmdEndRendering != 0L;
		khrRendering = caps.vkCmdBeginRenderingKHR != 0L && caps.vkCmdEndRenderingKHR != 0L;
		VkPhysicalDevice physical = vk.getPhysicalDevice();
		try (MemoryStack stack = MemoryStack.stackPush()) {
			VkPhysicalDeviceProperties props = VkPhysicalDeviceProperties.calloc(stack);
			VK10.vkGetPhysicalDeviceProperties(physical, props);
			preserveNan = !Boolean.getBoolean("realisticwater.fastMath") && preservesNan(physical, props.apiVersion(), stack);
			VkPhysicalDeviceLimits limits = props.limits();
			maxStorageBufferRange = Integer.toUnsignedLong(limits.maxStorageBufferRange());
			VkPhysicalDeviceMemoryProperties memory = VkPhysicalDeviceMemoryProperties.calloc(stack);
			VK10.vkGetPhysicalDeviceMemoryProperties(physical, memory);
			long largest = 0L;
			for (int i = 0; i < memory.memoryHeapCount(); i++) {
				if ((memory.memoryHeaps(i).flags() & VK10.VK_MEMORY_HEAP_DEVICE_LOCAL_BIT) != 0) {
					largest = Math.max(largest, memory.memoryHeaps(i).size());
				}
			}
			deviceLocalHeap = largest > 0L ? largest : Long.MAX_VALUE;
			int api = props.apiVersion();
			RealisticWater.LOGGER.info(
				"Realistic Water on {} (Vulkan {}.{}.{}, {}): push descriptors {}, dynamic rendering {}, NaN-safe shaders {}, max workgroup {}, "
					+ "shared memory {} KiB, max storage buffer {} MiB, GPU heap {} MiB",
				props.deviceNameString(), VK10.VK_VERSION_MAJOR(api), VK10.VK_VERSION_MINOR(api), VK10.VK_VERSION_PATCH(api),
				System.getProperty("os.name"), pushDescriptors ? "yes" : "no (descriptor sets)", coreRendering ? "core" : khrRendering ? "KHR" : "MISSING",
				preserveNan ? "yes" : "no", limits.maxComputeWorkGroupInvocations(), limits.maxComputeSharedMemorySize() / 1024,
				maxStorageBufferRange >> 20, largest >> 20);
		}
	}

	public static long maxStorageBufferRange() {
		return maxStorageBufferRange;
	}

	/** Size of the largest device-local memory heap (on Macs: the GPU's share of the unified or system memory). */
	public static long deviceLocalHeap() {
		return deviceLocalHeap;
	}

	/** Largest single storage buffer worth allocating: the binding limit, and at most an eighth of GPU memory. */
	public static long storageBudget() {
		return Math.min(maxStorageBufferRange, Math.max(deviceLocalHeap / 8L, 64L << 20));
	}

	private static boolean preservesNan(VkPhysicalDevice physical, int apiVersion, MemoryStack stack) {
		if (VK10.VK_VERSION_MAJOR(apiVersion) == 1 && VK10.VK_VERSION_MINOR(apiVersion) < 2) {
			return false;
		}
		VKCapabilitiesInstance caps = physical.getCapabilities();
		VkPhysicalDeviceFloatControlsProperties floats = VkPhysicalDeviceFloatControlsProperties.calloc(stack).sType$Default();
		VkPhysicalDeviceProperties2 props = VkPhysicalDeviceProperties2.calloc(stack).sType$Default().pNext(floats);
		if (caps.vkGetPhysicalDeviceProperties2 != 0L) {
			VK11.vkGetPhysicalDeviceProperties2(physical, props);
		} else if (caps.vkGetPhysicalDeviceProperties2KHR != 0L) {
			KHRGetPhysicalDeviceProperties2.vkGetPhysicalDeviceProperties2KHR(physical, props);
		} else {
			return false;
		}
		return floats.shaderSignedZeroInfNanPreserveFloat32();
	}

	/** True when bindings go through VK_KHR_push_descriptor; otherwise programs allocate sets from {@link #allocateSet}. */
	public static boolean pushDescriptors() {
		return pushDescriptors;
	}

	public static boolean coreRendering() {
		return coreRendering;
	}

	public static boolean khrRendering() {
		return khrRendering;
	}

	/** Whether shaders may ask for IEEE NaN/Inf semantics (keeps their NaN guards alive under Metal fast math). */
	public static boolean preserveNan() {
		return preserveNan;
	}

	/** A descriptor set that stays valid until this frame's slot comes round again, FRAME_RING + 1 frames later. */
	public static long allocateSet(long layout) {
		int slot = (int) (frame % (FRAME_RING + 1));
		if (descriptorPools[slot] == null) {
			descriptorPools[slot] = new ArrayList<>();
			poolFrame[slot] = -1L;
		}
		List<Long> pools = descriptorPools[slot];
		if (poolFrame[slot] != frame) {
			for (long pool : pools) {
				VK10.vkResetDescriptorPool(vk(), pool, 0);
			}
			poolFrame[slot] = frame;
			poolCursor[slot] = 0;
		}
		try (MemoryStack stack = MemoryStack.stackPush()) {
			LongBuffer p = stack.mallocLong(1);
			while (true) {
				boolean fresh = poolCursor[slot] == pools.size();
				if (fresh) {
					pools.add(createPool());
				}
				VkDescriptorSetAllocateInfo info = VkDescriptorSetAllocateInfo.calloc(stack).sType$Default()
					.descriptorPool(pools.get(poolCursor[slot]))
					.pSetLayouts(stack.longs(layout));
				int result = VK10.vkAllocateDescriptorSets(vk(), info, p);
				if (result == VK10.VK_SUCCESS) {
					return p.get(0);
				}
				if (fresh) {
					check(result, "vkAllocateDescriptorSets");
				}
				poolCursor[slot]++;
			}
		}
	}

	private static long createPool() {
		try (MemoryStack stack = MemoryStack.stackPush()) {
			VkDescriptorPoolSize.Buffer sizes = VkDescriptorPoolSize.calloc(4, stack);
			sizes.get(0).type(Desc.UBO).descriptorCount(POOL_SETS);
			sizes.get(1).type(Desc.SSBO).descriptorCount(POOL_SETS * 12);
			sizes.get(2).type(Desc.TEX).descriptorCount(POOL_SETS * 6);
			sizes.get(3).type(Desc.IMG).descriptorCount(POOL_SETS);
			VkDescriptorPoolCreateInfo info = VkDescriptorPoolCreateInfo.calloc(stack).sType$Default().maxSets(POOL_SETS).pPoolSizes(sizes);
			LongBuffer p = stack.mallocLong(1);
			check(VK10.vkCreateDescriptorPool(vk(), info, null, p), "vkCreateDescriptorPool");
			return p.get(0);
		}
	}

	private static void destroyPools() {
		for (int slot = 0; slot < descriptorPools.length; slot++) {
			if (descriptorPools[slot] != null) {
				for (long pool : descriptorPools[slot]) {
					VK10.vkDestroyDescriptorPool(vk(), pool, null);
				}
				descriptorPools[slot] = null;
			}
		}
	}

	public static VulkanDevice device() {
		VulkanDevice d = tryDevice();
		if (d == null) {
			throw new IllegalStateException("Realistic Water needs the Vulkan graphics backend");
		}
		return d;
	}

	public static VkDevice vk() {
		return device().vkDevice();
	}

	public static long vma() {
		return device().vma();
	}

	public static VulkanCommandEncoder encoder() {
		return device().createCommandEncoder();
	}

	public static long frame() {
		return frame;
	}

	public static int ringSlot() {
		return (int) (frame % FRAME_RING);
	}

	public static void check(int result, String what) {
		if (result != VK10.VK_SUCCESS) {
			throw new IllegalStateException(what + " failed with VkResult " + result);
		}
	}

	public static void barrier(VkCommandBuffer cb) {
		try (MemoryStack stack = MemoryStack.stackPush()) {
			VkMemoryBarrier.Buffer barrier = VkMemoryBarrier.calloc(1, stack).sType$Default();
			barrier.srcAccessMask(ACCESS_READ_WRITE);
			barrier.dstAccessMask(ACCESS_READ_WRITE);
			VK10.vkCmdPipelineBarrier(cb, STAGE_ALL, STAGE_ALL, 0, barrier, null, null);
		}
	}

	static void queueTransition(VkTex tex) {
		pendingTransitions.add(tex);
	}

	public static void flushTransitions(VkCommandBuffer cb) {
		if (pendingTransitions.isEmpty()) {
			return;
		}
		try (MemoryStack stack = MemoryStack.stackPush()) {
			VkImageMemoryBarrier.Buffer barriers = VkImageMemoryBarrier.calloc(pendingTransitions.size(), stack);
			for (int i = 0; i < pendingTransitions.size(); i++) {
				VkTex tex = pendingTransitions.get(i);
				VkImageMemoryBarrier b = barriers.get(i).sType$Default();
				b.oldLayout(VK10.VK_IMAGE_LAYOUT_UNDEFINED);
				b.newLayout(VK10.VK_IMAGE_LAYOUT_GENERAL);
				b.srcAccessMask(0);
				b.dstAccessMask(ACCESS_READ_WRITE);
				b.srcQueueFamilyIndex(VK10.VK_QUEUE_FAMILY_IGNORED);
				b.dstQueueFamilyIndex(VK10.VK_QUEUE_FAMILY_IGNORED);
				b.image(tex.image);
				b.subresourceRange().aspectMask(tex.aspect).baseMipLevel(0).levelCount(1).baseArrayLayer(0).layerCount(1);
			}
			VK10.vkCmdPipelineBarrier(cb, VK10.VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT, STAGE_ALL, 0, null, null, barriers);
		}
		pendingTransitions.clear();
	}

	public static void destroyLater(AutoCloseable resource) {
		deferred.add(new Deferred(frame + FRAME_RING + 1, resource));
	}

	public static void endFrame() {
		frame++;
		while (!deferred.isEmpty() && deferred.peek().frame <= frame) {
			closeQuietly(deferred.poll().resource);
		}
	}

	public static void waitIdle() {
		if (device != null) {
			VK10.vkDeviceWaitIdle(device.vkDevice());
		}
	}

	public static void flushDeferredNow() {
		waitIdle();
		while (!deferred.isEmpty()) {
			closeQuietly(deferred.poll().resource);
		}
		if (device != null) {
			destroyPools();
		}
	}

	private static void closeQuietly(AutoCloseable c) {
		try {
			c.close();
		} catch (Exception ignored) {
		}
	}
}
