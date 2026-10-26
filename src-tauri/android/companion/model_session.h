#pragma once
#include <cstdint>
#include <memory>
#include <string>

// Caller owns the inference mutex. Contexts/samplers are request-local, never cached here.
template<class Model> class CompanionModelSession {
    std::unique_ptr<Model, void (*)(Model *)> model_;
    std::string path_;
public:
    explicit CompanionModelSession(void (*destroy)(Model *)) : model_(nullptr, destroy) {}
    bool resident() const { return bool(model_); }
    template<class Loader> Model *acquire(const std::string &path, Loader load) {
        if (model_ && path_ == path) return model_.get();
        release();
        model_.reset(load());
        if (model_) path_ = path;
        return model_.get();
    }
    void release() { model_.reset(); path_.clear(); }
};

class CompanionPhaseDeadline {
    int64_t deadline_;
public:
    // Provisional generous bounds; phone timings are exposed separately for tuning.
    explicit CompanionPhaseDeadline(int64_t now) : deadline_(now + 180000) {}
    void beginGeneration(int64_t now) { deadline_ = now + 120000; }
    bool expired(int64_t now) const { return now >= deadline_; }
};
