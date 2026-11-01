#pragma once
#include <cstdint>

// Conservative partial offload for 8GB+ Android phones: Vulkan and CPU share
// physical RAM. Do not report a GPU unless a real Vulkan compute device exists.
// The result is a requested upper bound, not a measured layer count.
constexpr std::int64_t kGpuMemoryMiB = 1024LL * 1024LL;
inline int companionGpuLayers(bool vulkanCompiled, bool hardwarePresent,
                              std::int64_t availableBytes, bool cpuOnly) {
    if (!vulkanCompiled || !hardwarePresent || cpuOnly) return 0;
    if (availableBytes >= 2048 * kGpuMemoryMiB) return 8;
    if (availableBytes >= 1536 * kGpuMemoryMiB) return 4;
    return 0;
}
