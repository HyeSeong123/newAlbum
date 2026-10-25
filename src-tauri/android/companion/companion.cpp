#include <jni.h>
#include "llama.h"
#include <algorithm>
#include <atomic>
#include <chrono>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

namespace {
std::atomic<int64_t> cancelled_through{0};
std::mutex inference_mutex;
std::once_flag backend_once;
struct Run { int64_t id; std::chrono::steady_clock::time_point deadline; };
bool abort_run(void *data) {
    auto &run = *static_cast<Run *>(data);
    return run.id <= cancelled_through.load() || std::chrono::steady_clock::now() > run.deadline;
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
extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_oraedameun_album_GamjassakCompanionPlugin_nativeGenerate(JNIEnv *env, jobject, jstring path, jstring input, jlong request) {
    try {
        std::unique_lock<std::mutex> lock(inference_mutex, std::try_to_lock);
        if (!lock.owns_lock()) throw std::runtime_error("이전 대답을 마무리하고 있어요. 잠시 후 다시 시도해 주세요.");
        Run run{request, std::chrono::steady_clock::now() + std::chrono::seconds(60)};
        if (abort_run(&run)) throw std::runtime_error("대답을 멈췄어요.");
        const std::string file = utf8(env, path), prompt = utf8(env, input);
        if (prompt.empty() || prompt.size() > 48000) throw std::runtime_error("이야기가 너무 길어요.");
        std::call_once(backend_once, [] { llama_backend_init(); });
        auto mp = llama_model_default_params(); mp.n_gpu_layers = 0;
        mp.progress_callback = load_progress; mp.progress_callback_user_data = &run;
        std::unique_ptr<llama_model, decltype(&llama_model_free)> model(llama_model_load_from_file(file.c_str(), mp), llama_model_free);
        if (!model) throw std::runtime_error("AI를 불러오지 못했어요. 다른 앱을 닫고 다시 시도해 주세요.");
        auto cp = llama_context_default_params();
        cp.n_ctx = 4096; cp.n_batch = 256; cp.n_ubatch = 128;
        cp.n_threads = cp.n_threads_batch = std::max(1u, std::min(4u, std::thread::hardware_concurrency()));
        cp.abort_callback = abort_run; cp.abort_callback_data = &run;
        std::unique_ptr<llama_context, decltype(&llama_free)> ctx(llama_init_from_model(model.get(), cp), llama_free);
        if (!ctx) throw std::runtime_error("대화 메모리가 부족해요. 다른 앱을 닫고 다시 시도해 주세요.");
        const auto *vocab = llama_model_get_vocab(model.get());
        int count = llama_tokenize(vocab, prompt.data(), prompt.size(), nullptr, 0, true, true);
        if (count == 0 || count == INT32_MIN) throw std::runtime_error("이야기를 읽지 못했어요.");
        if (count < 0) count = -count;
        if (count > 4096 - 256) throw std::runtime_error("이야기가 길어졌어요. 조금 짧게 적어 주세요.");
        std::vector<llama_token> tokens(count);
        if (llama_tokenize(vocab, prompt.data(), prompt.size(), tokens.data(), count, true, true) < 0) throw std::runtime_error("이야기를 읽지 못했어요.");
        for (int offset = 0; offset < count; offset += 256) {
            if (abort_run(&run)) throw std::runtime_error("대답을 멈췄거나 시간이 오래 걸려 중단했어요.");
            auto batch = llama_batch_get_one(tokens.data() + offset, std::min(256, count - offset));
            if (llama_decode(ctx.get(), batch) != 0) throw std::runtime_error("이야기를 준비하지 못했어요. 다시 시도해 주세요.");
        }
        std::unique_ptr<llama_sampler, decltype(&llama_sampler_free)> sampler(llama_sampler_chain_init(llama_sampler_chain_default_params()), llama_sampler_free);
        llama_sampler_chain_add(sampler.get(), llama_sampler_init_top_k(20));
        llama_sampler_chain_add(sampler.get(), llama_sampler_init_top_p(0.8f, 1));
        llama_sampler_chain_add(sampler.get(), llama_sampler_init_temp(0.7f));
        llama_sampler_chain_add(sampler.get(), llama_sampler_init_dist(LLAMA_DEFAULT_SEED));
        std::string output;
        for (int i = 0; i < 192; ++i) {
            if (abort_run(&run)) throw std::runtime_error("대답을 멈췄거나 시간이 오래 걸려 중단했어요.");
            auto token = llama_sampler_sample(sampler.get(), ctx.get(), -1);
            if (llama_vocab_is_eog(vocab, token)) break;
            char piece[512];
            int length = llama_token_to_piece(vocab, token, piece, sizeof(piece), 0, true);
            if (length < 0) {
                std::vector<char> larger(-length);
                length = llama_token_to_piece(vocab, token, larger.data(), larger.size(), 0, true);
                if (length > 0) output.append(larger.data(), length);
            } else output.append(piece, length);
            auto batch = llama_batch_get_one(&token, 1);
            if (llama_decode(ctx.get(), batch) != 0) throw std::runtime_error("대답을 마무리하지 못했어요. 다시 시도해 주세요.");
        }
        // RAII releases context/KV cache/model on every return, cancellation and error.
        auto bytes = env->NewByteArray(output.size());
        if (bytes) env->SetByteArrayRegion(bytes, 0, output.size(), reinterpret_cast<const jbyte *>(output.data()));
        return bytes;
    } catch (const std::exception &error) {
        if (!env->ExceptionCheck()) env->ThrowNew(env->FindClass("java/lang/IllegalStateException"), error.what());
        return nullptr;
    }
}
