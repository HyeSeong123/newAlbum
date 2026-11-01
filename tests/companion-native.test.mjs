import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import { configureCompanionGradle } from '../scripts/prepare-android.mjs';
const template='android {\n    compileSdk = 36\n    defaultConfig { targetSdk = 36 }\n}';
test('Android preparation wires the real JNI build exactly once',()=>{
  assert.equal(typeof configureCompanionGradle,'function');
  const result=configureCompanionGradle(template);
  assert.match(result,/externalNativeBuild/);
  assert.match(result,/src\/main\/cpp\/companion\/CMakeLists.txt/);
  assert.equal(configureCompanionGradle(result),result);
});

test('GPU path only runs with a detected ARM64 Vulkan device and CPU fallback is retained',()=>{
  const cmake=readFileSync(new URL('../src-tauri/android/companion/CMakeLists.txt',import.meta.url),'utf8');
  const cpp=readFileSync(new URL('../src-tauri/android/companion/companion.cpp',import.meta.url),'utf8');
  const kotlin=readFileSync(new URL('../src-tauri/android/GamjassakCompanionPlugin.kt',import.meta.url),'utf8');
  assert.match(cmake,/ANDROID_ABI STREQUAL "arm64-v8a"/);
  assert.match(cmake,/GGML_VULKAN ON CACHE BOOL/);
  assert.match(cpp,/hasVulkanComputeDevice\(\)/);
  assert.match(cpp,/companionGpuLayers\(/);
  assert.match(cpp,/resident_gpu_layers != requested_gpu_layers\) release_model/);
  assert.match(kotlin,/gpuDisabledForSession = true/);
  assert.match(kotlin,/nativeRelease\(\) \/\/ free GPU buffers\/context before CPU/);
  assert.match(kotlin,/availableAgain.availMem, true/);
  assert.match(kotlin,/\.put\("gpuFallback", lastGpuFallback\)/);
  assert.match(cmake,/target_include_directories\(ggml-vulkan SYSTEM PRIVATE/);
  assert.match(cmake,/vulkan-sdk-headers/);
  assert.match(cmake,/vk_video/);
  assert.match(cmake,/uint32_t N = 16/);
  assert.match(cmake,/uint32_t N = 2/);
  assert.match(cmake,/compiles\.front\(\)\.get\(\)/);
  assert.match(cmake,/ggml-vulkan-shaders\.cpp/);
});
