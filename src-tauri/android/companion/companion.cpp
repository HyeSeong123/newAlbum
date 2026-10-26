#include <jni.h>
#include "llama.h"
#include "model_session.h"
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdio>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>
#include <unistd.h>

namespace {
std::atomic<int64_t> cancelled_through{0};
std::mutex inference_mutex;
std::once_flag backend_once;
CompanionModelSession<llama_model> session(llama_model_free);
int64_t now_ms() { return std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now().time_since_epoch()).count(); }
long rss_kib() {
    long pages = 0, resident = 0;
    if (auto *file = std::fopen("/proc/self/statm", "r")) {
        if (std::fscanf(file, "%ld %ld", &pages, &resident) != 2) resident = 0;
        std::fclose(file);
    }
    return resident * sysconf(_SC_PAGESIZE) / 1024;
}
struct Metrics {
    bool resident = false, reused = false;
    int loads = 0, releases = 0;
    int64_t load = 0, context = 0, first = -1, total = 0, generation = 0;
    long before = 0, loaded = 0, peak = 0, released = 0;
    std::string stage = "idle";
};
std::mutex metrics_mutex;
Metrics metrics;
struct RequestTiming {
    int64_t start, generation = -1;
    ~RequestTiming() {
        std::lock_guard<std::mutex> lock(metrics_mutex);
        metrics.total = now_ms() - start;
        metrics.generation = generation < 0 ? 0 : now_ms() - generation;
    }
};
struct ModelLoadTiming {
    int64_t start = now_ms();
    ~ModelLoadTiming() { std::lock_guard<std::mutex> lock(metrics_mutex); metrics.load = now_ms() - start; }
};
void stage(const char *value) {
    std::lock_guard<std::mutex> lock(metrics_mutex);
    metrics.stage = value; metrics.peak = std::max(metrics.peak, rss_kib());
}
void release_model() {
    const bool resident = session.resident();
    session.release();
    std::lock_guard<std::mutex> lock(metrics_mutex);
    metrics.resident = false;
    if (resident) ++metrics.releases;
    metrics.released = rss_kib(); metrics.stage = "released";
}
struct Run { int64_t id; CompanionPhaseDeadline deadline; bool loading = true; };
bool abort_run(void *data) {
    auto &run = *static_cast<Run *>(data);
    return run.id <= cancelled_through.load() || run.deadline.expired(now_ms());
}
const char *abort_message(const Run &run) {
    if (run.id <= cancelled_through.load()) return "AI_CANCELLED: 대답을 멈췄어요.";
    return run.loading ? "AI_LOAD_TIMEOUT: AI를 불러오는 시간이 길어 중단했어요." : "AI_GENERATION_TIMEOUT: AI 대사 생성 시간이 길어 중단했어요.";
}
bool load_progress(float, void *data) { return !abort_run(data); }
std::string utf8(JNIEnv *env, jstring value) {
    // JNI modified UTF-8 cannot encode emoji correctly. Use Java's standard UTF-8 codec.
    jclass cls = env->FindClass("java/lang/String");
    jmethodID get_bytes = env->GetMethodID(cls, "getBytes", "(Ljava/lang/String;)[B");
    jstring charset = env->NewStringUTF("UTF-8");
    auto bytes = static_cast<jbyteArray>(env->CallObjectMethod(value, get_bytes, charset));
    if (env->ExceptionCheck() || !bytes) throw std::runtime_error("입력 문자를 읽지 못했어요.");
    std::string out(env->GetArrayLength(bytes), '\0');
    env->GetByteArrayRegion(bytes, 0, out.size(), reinterpret_cast<jbyte *>(out.data()));
    env->DeleteLocalRef(bytes); env->DeleteLocalRef(charset); env->DeleteLocalRef(cls);
    return out;
}
}
extern "C" JNIEXPORT void JNICALL
Java_com_oraedameun_album_GamjassakCompanionPlugin_nativeCancel(JNIEnv *, jobject, jlong id) {
    int64_t previous = cancelled_through.load();
    while (previous < id && !cancelled_through.compare_exchange_weak(previous, id)) {}
}
extern "C" JNIEXPORT void JNICALL
Java_com_oraedameun_album_GamjassakCompanionPlugin_nativeRelease(JNIEnv *, jobject) {
    std::lock_guard<std::mutex> lock(inference_mutex);
    release_model();
}
extern "C" JNIEXPORT jstring JNICALL
Java_com_oraedameun_album_GamjassakCompanionPlugin_nativeStats(JNIEnv *env, jobject) {
    std::lock_guard<std::mutex> lock(metrics_mutex);
    const std::string json = "{\"resident\":" + std::string(metrics.resident ? "true" : "false") +
        ",\"reused\":" + (metrics.reused ? "true" : "false") + ",\"loadCount\":" + std::to_string(metrics.loads) +
        ",\"releaseCount\":" + std::to_string(metrics.releases) + ",\"stage\":\"" + metrics.stage + "\"" +
        ",\"loadMs\":" + std::to_string(metrics.load) + ",\"contextMs\":" + std::to_string(metrics.context) +
        ",\"firstTokenMs\":" + std::to_string(metrics.first) + ",\"totalMs\":" + std::to_string(metrics.total) +
        ",\"generationMs\":" + std::to_string(metrics.generation) + ",\"rssBeforeKiB\":" + std::to_string(metrics.before) +
        ",\"rssLoadedKiB\":" + std::to_string(metrics.loaded) + ",\"rssPeakKiB\":" + std::to_string(metrics.peak) +
        ",\"rssAfterReleaseKiB\":" + std::to_string(metrics.released) + "}";
    return env->NewStringUTF(json.c_str());
}
extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_oraedameun_album_GamjassakCompanionPlugin_nativeGenerate(JNIEnv *env, jobject, jstring path, jstring input, jlong request) {
    try {
        std::unique_lock<std::mutex> lock(inference_mutex, std::try_to_lock);
        if (!lock.owns_lock()) throw std::runtime_error("이전 대답을 마무리하고 있어요. 잠시 후 다시 시도해 주세요.");
        const auto started = now_ms();
        RequestTiming timing{started};
        Run run{request, CompanionPhaseDeadline(started)};
        if (abort_run(&run)) throw std::runtime_error(abort_message(run));
        {
            std::lock_guard<std::mutex> guard(metrics_mutex);
            metrics.reused = session.resident(); metrics.load = metrics.context = metrics.total = metrics.generation = 0;
            metrics.first = -1; metrics.before = metrics.peak = rss_kib(); metrics.loaded = 0;
        }
        const std::string file = utf8(env, path), prompt = utf8(env, input);
        if (prompt.empty() || prompt.size() > 48000) throw std::runtime_error("이야기가 너무 길어요.");
        std::call_once(backend_once, [] { llama_backend_init(); });
        auto mp = llama_model_default_params(); mp.n_gpu_layers = 0;
        // CPU repacking can duplicate ~1.6GiB of this 4B model. Keep mmap-backed weights
        // instead of a second resident copy on an 8GB phone.
        mp.use_extra_bufts = false;
        mp.progress_callback = load_progress; mp.progress_callback_user_data = &run;
        stage("loading");
        bool loaded = false;
        auto *model = session.acquire(file, [&] {
            loaded = true;
            { std::lock_guard<std::mutex> guard(metrics_mutex); metrics.resident = false; metrics.reused = false; }
            ModelLoadTiming loadTiming;
            return llama_model_load_from_file(file.c_str(), mp);
        });
        if (!model) {
            if (abort_run(&run)) throw std::runtime_error(abort_message(run));
            throw std::runtime_error("AI_LOAD_ERROR: AI를 불러오지 못했어요. 다른 앱을 닫고 다시 시도해 주세요.");
        }
        {
            std::lock_guard<std::mutex> guard(metrics_mutex);
            metrics.resident = true; metrics.reused = !loaded;
            metrics.load = loaded ? now_ms() - started : 0; if (loaded) ++metrics.loads;
            metrics.loaded = rss_kib(); metrics.peak = std::max(metrics.peak, metrics.loaded);
        }
        if (abort_run(&run)) throw std::runtime_error(abort_message(run));
        // Loading has its own budget. Only context/prompt/decoding consume this one.
        run.loading = false; const auto generating = now_ms(); timing.generation = generating; run.deadline.beginGeneration(generating);
        stage("context");
        auto cp = llama_context_default_params();
        cp.n_ctx = 2048; cp.n_batch = 256; cp.n_ubatch = 128;
        cp.n_threads = cp.n_threads_batch = std::max(1u, std::min(4u, std::thread::hardware_concurrency()));
        cp.abort_callback = abort_run; cp.abort_callback_data = &run;
        std::unique_ptr<llama_context, decltype(&llama_free)> ctx(llama_init_from_model(model, cp), llama_free);
        if (!ctx) throw std::runtime_error("대화 메모리가 부족해요. 다른 앱을 닫고 다시 시도해 주세요.");
        { std::lock_guard<std::mutex> guard(metrics_mutex); metrics.context = now_ms() - generating; }
        stage("prompt");
        const auto *vocab = llama_model_get_vocab(model);
        int count = llama_tokenize(vocab, prompt.data(), prompt.size(), nullptr, 0, true, true);
        if (count == 0 || count == INT32_MIN) throw std::runtime_error("이야기를 읽지 못했어요.");
        if (count < 0) count = -count;
        if (count > 2048 - 256) throw std::runtime_error("이야기가 길어졌어요. 조금 짧게 적어 주세요.");
        std::vector<llama_token> tokens(count);
        if (llama_tokenize(vocab, prompt.data(), prompt.size(), tokens.data(), count, true, true) < 0) throw std::runtime_error("이야기를 읽지 못했어요.");
        for (int offset = 0; offset < count; offset += 256) {
            if (abort_run(&run)) throw std::runtime_error(abort_message(run));
            auto batch = llama_batch_get_one(tokens.data() + offset, std::min(256, count - offset));
            if (llama_decode(ctx.get(), batch) != 0) {
                if (abort_run(&run)) throw std::runtime_error(abort_message(run));
                throw std::runtime_error("이야기를 준비하지 못했어요. 다시 시도해 주세요.");
            }
        }
        std::unique_ptr<llama_sampler, decltype(&llama_sampler_free)> sampler(llama_sampler_chain_init(llama_sampler_chain_default_params()), llama_sampler_free);
        llama_sampler_chain_add(sampler.get(), llama_sampler_init_top_k(20));
        llama_sampler_chain_add(sampler.get(), llama_sampler_init_top_p(0.8f, 1));
        llama_sampler_chain_add(sampler.get(), llama_sampler_init_temp(0.7f));
        llama_sampler_chain_add(sampler.get(), llama_sampler_init_dist(LLAMA_DEFAULT_SEED));
        std::string output;
        stage("generating");
        for (int i = 0; i < 192; ++i) {
            if (abort_run(&run)) throw std::runtime_error(abort_message(run));
            auto token = llama_sampler_sample(sampler.get(), ctx.get(), -1);
            if (llama_vocab_is_eog(vocab, token)) break;
            if (i == 0) { std::lock_guard<std::mutex> guard(metrics_mutex); metrics.first = now_ms() - generating; }
            char piece[512];
            int length = llama_token_to_piece(vocab, token, piece, sizeof(piece), 0, true);
            if (length < 0) {
                std::vector<char> larger(-length);
                length = llama_token_to_piece(vocab, token, larger.data(), larger.size(), 0, true);
                if (length > 0) output.append(larger.data(), length);
            } else output.append(piece, length);
            auto batch = llama_batch_get_one(&token, 1);
            if (llama_decode(ctx.get(), batch) != 0) {
                if (abort_run(&run)) throw std::runtime_error(abort_message(run));
                throw std::runtime_error("대답을 마무리하지 못했어요. 다시 시도해 주세요.");
            }
            stage("generating");
        }
        {
            std::lock_guard<std::mutex> guard(metrics_mutex);
            metrics.total = now_ms() - started; metrics.generation = now_ms() - generating; metrics.stage = "complete";
        }
        // Context/KV/sampler are released per request. The model remains until Home release.
        auto bytes = env->NewByteArray(output.size());
        if (bytes) env->SetByteArrayRegion(bytes, 0, output.size(), reinterpret_cast<const jbyte *>(output.data()));
        return bytes;
    } catch (const std::bad_alloc &) {
        std::lock_guard<std::mutex> lock(inference_mutex); release_model(); stage("memory");
        if (!env->ExceptionCheck()) env->ThrowNew(env->FindClass("java/lang/IllegalStateException"), "AI_MEMORY: 메모리가 부족해 기본 반응을 보여 줬어요.");
        return nullptr;
    } catch (const std::exception &error) {
        stage("error");
        if (!env->ExceptionCheck()) env->ThrowNew(env->FindClass("java/lang/IllegalStateException"), error.what());
        return nullptr;
    }
}
