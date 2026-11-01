cmake_minimum_required(VERSION 3.22)
project(gamjassak_companion LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
# Preview APKs are Debug for WebView inspection; inference kernels still need optimization.
if(ANDROID)
    string(APPEND CMAKE_C_FLAGS_DEBUG " -O3")
    string(APPEND CMAKE_CXX_FLAGS_DEBUG " -O3")
endif()
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TOOLS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(LLAMA_CURL OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)
set(GGML_LLAMAFILE OFF CACHE BOOL "" FORCE)
set(GGML_BACKEND_DL OFF CACHE BOOL "" FORCE)
# Vulkan is built only for ARM64 phones. The x86_64 Android emulator and
# desktop C++ fixtures stay CPU-only. Do not link host libvulkan.so into an APK.
option(GAMJASSAK_ENABLE_VULKAN "Enable ARM64 Android Vulkan offload" ON)
set(GGML_VULKAN OFF CACHE BOOL "" FORCE)
if(ANDROID AND ANDROID_ABI STREQUAL "arm64-v8a" AND GAMJASSAK_ENABLE_VULKAN)
    # llama.cpp's shader compiler runs on the Linux host, while the Vulkan
    # loader is a library provided by the Android NDK / Android OS.
    find_program(GAMJASSAK_GLSLC glslc NO_CMAKE_FIND_ROOT_PATH)
    find_path(GAMJASSAK_VULKAN_HEADERS vulkan/vulkan.hpp NO_CMAKE_FIND_ROOT_PATH)
    find_library(GAMJASSAK_ANDROID_VULKAN_LIBRARY vulkan)
    if(NOT GAMJASSAK_GLSLC OR NOT GAMJASSAK_VULKAN_HEADERS OR NOT GAMJASSAK_ANDROID_VULKAN_LIBRARY)
        message(FATAL_ERROR "Android Vulkan requires host glslc/Vulkan C++ headers and Android NDK libvulkan. Install glslc, libvulkan-dev, spirv-headers on the builder.")
    endif()
    set(Vulkan_GLSLC_EXECUTABLE "${GAMJASSAK_GLSLC}" CACHE FILEPATH "" FORCE)
    set(Vulkan_INCLUDE_DIR "${GAMJASSAK_VULKAN_HEADERS}" CACHE PATH "" FORCE)
    set(Vulkan_LIBRARY "${GAMJASSAK_ANDROID_VULKAN_LIBRARY}" CACHE FILEPATH "" FORCE)
    set(GGML_VULKAN ON CACHE BOOL "" FORCE)
    message(STATUS "Gamjassak Android GPU: Vulkan enabled (with CPU fallback)")
else()
    message(STATUS "Gamjassak GPU: CPU-only target")
endif()
include(FetchContent)
# Fixed source commit. Override FETCHCONTENT_SOURCE_DIR_LLAMA_CPP only for local verification.
FetchContent_Declare(llama_cpp
    URL https://github.com/ggml-org/llama.cpp/archive/a7a98e0fffed794396b3fbad4dcdbbc184963645.tar.gz
    URL_HASH SHA256=4d78e6aa4a9124b58dff994416525294fbab2990fe905a640d4cbd26bf563a31)
# Fetch the pinned dependency before adding the subproject so the shipped
# generator can be patched to limit host glslc processes on GitHub runners.
# This is a build-only change; the Qwen 4B weights/LoRA remain untouched.
FetchContent_GetProperties(llama_cpp)
if(NOT llama_cpp_POPULATED)
    FetchContent_Populate(llama_cpp)
    if(GGML_VULKAN)
        set(_gamjassak_shader_generator
            "${llama_cpp_SOURCE_DIR}/ggml/src/ggml-vulkan/vulkan-shaders/vulkan-shaders-gen.cpp")
        file(READ "${_gamjassak_shader_generator}" _gamjassak_shader_source)
        string(REPLACE "uint32_t N = 16;" "uint32_t N = 2;"
            _gamjassak_shader_bounded "${_gamjassak_shader_source}")
        # The upstream generator retains completed std::async futures until
        # the end, holding hundreds of thread stacks. Reap them gradually.
        set(_gamjassak_async_call "compiles.push_back(std::async(string_to_spv_func, _name, in_fname, defines, fp16, coopmat, coopmat2, f16acc));")
        set(_gamjassak_async_bounded "${_gamjassak_async_call}
    if (compiles.size() > 4) { compiles.front().get(); compiles.erase(compiles.begin()); }")
        # CMake may reconfigure the same populated source. Keep patch idempotent.
        string(FIND "${_gamjassak_shader_source}" "compiles.front().get();" _gamjassak_reaped)
        if(_gamjassak_reaped EQUAL -1)
            string(REPLACE "${_gamjassak_async_call}" "${_gamjassak_async_bounded}"
                _gamjassak_shader_bounded "${_gamjassak_shader_bounded}")
        endif()
        if(_gamjassak_shader_bounded STREQUAL _gamjassak_shader_source)
            if(NOT _gamjassak_shader_source MATCHES "uint32_t N = 2;")
                message(FATAL_ERROR "Pinned Vulkan shader generator changed: cannot cap concurrent glslc processes")
            endif()
        else()
            file(WRITE "${_gamjassak_shader_generator}" "${_gamjassak_shader_bounded}")
        endif()
    endif()
    add_subdirectory("${llama_cpp_SOURCE_DIR}" "${llama_cpp_BINARY_DIR}")
endif()

if(GGML_VULKAN)
    # Host /usr/include is unsafe to add to an Android NDK cross-compile:
    # Linux libc headers could shadow Bionic. Copy ONLY the Vulkan SDK headers
    # into the build tree and make that staging directory visible to ggml-vulkan.
    set(_gamjassak_vulkan_staging "${CMAKE_CURRENT_BINARY_DIR}/vulkan-sdk-headers")
    file(MAKE_DIRECTORY "${_gamjassak_vulkan_staging}/vulkan")
    file(GLOB _gamjassak_vk_headers
        "${GAMJASSAK_VULKAN_HEADERS}/vulkan/*.h"
        "${GAMJASSAK_VULKAN_HEADERS}/vulkan/*.hpp")
    if(NOT _gamjassak_vk_headers)
        message(FATAL_ERROR "No Vulkan SDK C/C++ headers found on the build host")
    endif()
    file(COPY ${_gamjassak_vk_headers}
        DESTINATION "${_gamjassak_vulkan_staging}/vulkan")
    # Recent Vulkan SDK headers may include video codecs from vk_video/.
    file(GLOB _gamjassak_video_headers
        "${GAMJASSAK_VULKAN_HEADERS}/vk_video/*.h")
    if(_gamjassak_video_headers)
        file(MAKE_DIRECTORY "${_gamjassak_vulkan_staging}/vk_video")
        file(COPY ${_gamjassak_video_headers}
            DESTINATION "${_gamjassak_vulkan_staging}/vk_video")
    endif()
    target_include_directories(ggml-vulkan SYSTEM PRIVATE "${_gamjassak_vulkan_staging}")
    # Vulkan embeds millions of bytes of shader data. One compilation at a
    # time prevents shader/object jobs competing for the runner's RAM.
    set_property(GLOBAL PROPERTY JOB_POOLS gamjassak_vulkan_compile=1)
    set_property(TARGET ggml-vulkan PROPERTY JOB_POOL_COMPILE gamjassak_vulkan_compile)
    # The shader arrays are data, not inference math. Avoid -O3 on the
    # multi-million-line generated translation unit to cap clang memory.
    set_source_files_properties(
        "${llama_cpp_BINARY_DIR}/ggml/src/ggml-vulkan/ggml-vulkan-shaders.cpp"
        TARGET_DIRECTORY ggml-vulkan PROPERTIES COMPILE_OPTIONS "-O0")
    message(STATUS "Gamjassak Vulkan: staged SDK headers; shader compiler concurrency limited to 2")
endif()
add_library(gamjassak_companion SHARED companion.cpp)
target_link_libraries(gamjassak_companion PRIVATE llama)
if(GGML_VULKAN)
    target_compile_definitions(gamjassak_companion PRIVATE GAMJASSAK_VULKAN_ENABLED=1)
endif()
if(ANDROID)
    target_link_options(gamjassak_companion PRIVATE "-Wl,-z,max-page-size=16384")
else()
    find_package(JNI REQUIRED COMPONENTS JVM)
    target_include_directories(gamjassak_companion PRIVATE ${JNI_INCLUDE_DIRS})
endif()
