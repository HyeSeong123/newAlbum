// Manual integration check against the app's pinned llama.cpp and exact downloaded 4B.
// g++ -std=c++17 runtime-smoke.cpp -I<engine>/include -I<engine>/ggml/include \
//   -L<engine-build>/bin -Wl,-rpath,<engine-build>/bin -lllama -o runtime-smoke
#include "llama.h"
#include <algorithm>
#include <cmath>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

void require(bool ok, const char *message) { if (!ok) throw std::runtime_error(message); }
std::string quoted(const std::string &value) {
    std::string out="\"";
    for (unsigned char c : value) {
        if(c=='"' || c=='\\') {out+='\\'; out+=c;}
        else if(c=='\n') out+="\\n";
        else if(c=='\r') out+="\\r";
        else if(c=='\t') out+="\\t";
        else if(c<32) out+=' ';
        else out+=c;
    }
    return out+'"';
}
struct Result { std::vector<float> logits; std::string reply; };
Result run(llama_model *model, const char *adapterFile) {
    std::unique_ptr<llama_adapter_lora, decltype(&llama_adapter_lora_free)> adapter(
        adapterFile ? llama_adapter_lora_init(model,adapterFile) : nullptr, llama_adapter_lora_free);
    require(!adapterFile || bool(adapter), "adapter load failed");
    auto params=llama_context_default_params();
    params.n_ctx=2048; params.n_batch=256; params.n_ubatch=128;
    params.n_threads=params.n_threads_batch=4;
    std::unique_ptr<llama_context, decltype(&llama_free)> ctx(llama_init_from_model(model,params),llama_free);
    require(bool(ctx),"context load failed");
    if(adapter) require(llama_set_adapter_lora(ctx.get(),adapter.get(),1.0f)==0,"adapter apply failed");
    const auto *vocab=llama_model_get_vocab(model);
    const std::string prompt="<|im_start|>system\n너는 반려견 고미야. 집사를 좋아하지만 귀찮은 건 싫어해. 고미 입장에서 짧은 한국어 반말 한 문장으로 답해.<|im_end|>\n<|im_start|>user\n산책 후 집에 왔어. 발을 닦아 줄까?<|im_end|>\n<|im_start|>assistant\n";
    int count=-llama_tokenize(vocab,prompt.data(),prompt.size(),nullptr,0,true,true);
    require(count>0 && count<1792,"prompt token count");
    std::vector<llama_token> tokens(count);
    require(llama_tokenize(vocab,prompt.data(),prompt.size(),tokens.data(),count,true,true)==count,"tokenize");
    require(llama_decode(ctx.get(),llama_batch_get_one(tokens.data(),count))==0,"prompt decode");
    const auto *logits=llama_get_logits_ith(ctx.get(),-1);
    Result result{{logits,logits+llama_vocab_n_tokens(vocab)},""};
    for(float value:result.logits) require(std::isfinite(value),"nonfinite logits");
    std::unique_ptr<llama_sampler,decltype(&llama_sampler_free)> sampler(llama_sampler_init_greedy(),llama_sampler_free);
    for(int i=0;i<48;++i) {
        auto token=llama_sampler_sample(sampler.get(),ctx.get(),-1);
        if(llama_vocab_is_eog(vocab,token)) break;
        char piece[512]; int length=llama_token_to_piece(vocab,token,piece,sizeof(piece),0,true);
        require(length>=0,"piece overflow"); result.reply.append(piece,length);
        require(llama_decode(ctx.get(),llama_batch_get_one(&token,1))==0,"token decode");
    }
    return result; // Context destroyed before the request's adapter, as in Android JNI.
}
int main(int argc,char **argv) {
    try {
        require(argc==3,"Usage: runtime-smoke exact-base.gguf gomi-v4.gguf");
        llama_backend_init();
        auto params=llama_model_default_params(); params.n_gpu_layers=0; params.use_extra_bufts=false;
        std::unique_ptr<llama_model,decltype(&llama_model_free)> model(llama_model_load_from_file(argv[1],params),llama_model_free);
        require(bool(model),"base load failed");
        auto before=run(model.get(),nullptr), gomi=run(model.get(),argv[2]), after=run(model.get(),nullptr);
        float changed=0, restored=0;
        require(before.logits.size()==gomi.logits.size() && before.logits.size()==after.logits.size(),"vocabulary shape");
        for(size_t i=0;i<before.logits.size();++i) {
            changed=std::max(changed,std::abs(before.logits[i]-gomi.logits[i]));
            restored=std::max(restored,std::abs(before.logits[i]-after.logits[i]));
        }
        require(changed>0.0001f,"adapter did not affect inference");
        require(restored<0.00001f && before.reply==after.reply,"adapter leaked to next character");
        std::cout << "{\"passed\":true,\"requests\":3,\"adapterLogitsMaxDelta\":" << changed
          << ",\"restoredBaseLogitsMaxDelta\":" << restored << ",\"baseReply\":" << quoted(before.reply)
          << ",\"gomiReply\":" << quoted(gomi.reply) << ",\"qualityApproved\":false}\n";
        return 0;
    } catch(const std::exception &error) { std::cerr<<error.what()<<'\n'; return 1; }
}
