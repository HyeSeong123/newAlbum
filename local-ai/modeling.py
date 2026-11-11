"""Direct local Transformers execution. No server, inference API or Ollama."""
import os
from pathlib import Path
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
os.environ.setdefault('HF_HOME', str(Path(__file__).parent / 'cache/huggingface'))
os.environ.setdefault('TOKENIZERS_PARALLELISM', 'false')

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig, PeftModel, get_peft_model
from core import HERE, read_json, messages_for, valid_reply


def local_base():
    lock = read_json(Path(os.environ.get('GOMGOMI_BASE_LOCK',str(HERE/'base-model.json'))))
    if lock['model'] not in {'Qwen/Qwen3-0.6B','Qwen/Qwen2.5-0.5B-Instruct','naver-hyperclovax/HyperCLOVAX-SEED-Text-Instruct-0.5B'} or not Path(lock['localPath']).is_dir():
        raise ValueError('Run prepare.py to prepare the pinned small model')
    return lock


def load_model(adapter=None, train=False):
    if not torch.cuda.is_available():
        raise RuntimeError('CUDA unavailable; CPU fallback disabled')
    torch.set_num_threads(4)
    lock = local_base()
    tokenizer = AutoTokenizer.from_pretrained(lock['localPath'], local_files_only=True)
    base = AutoModelForCausalLM.from_pretrained(lock['localPath'], local_files_only=True,
        dtype=torch.bfloat16, attn_implementation='sdpa').to('cuda')
    if adapter:
        config = read_json(Path(adapter) / 'adapter_config.json')
        if config['base_model_name_or_path'] != lock['model']:
            raise ValueError('Adapter targets a different base model; never load the old 4B adapter')
        model = PeftModel.from_pretrained(base, adapter, local_files_only=True, is_trainable=train)
    elif train:
        base.name_or_path = lock['model']
        base.config._name_or_path = lock['model']
        model = get_peft_model(base, LoraConfig(r=8, lora_alpha=16, lora_dropout=0.05,
            target_modules=['q_proj', 'k_proj', 'v_proj', 'o_proj'], task_type='CAUSAL_LM'))
    else:
        model = base
    if train:
        model.config.use_cache = False
        model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={'use_reentrant': False})
        model.enable_input_require_grads()
    return model, tokenizer


def generation_eos(tokenizer):
    vocab=tokenizer.get_vocab()
    return list(dict.fromkeys([tokenizer.eos_token_id]+[vocab[s] for s in ['<|im_end|>','<|endofturn|>','<|stop|>'] if s in vocab]))


def encode(row, tokenizer, characters, actions, max_length):
    prompt = tokenizer.apply_chat_template(messages_for(row, characters, actions),
        tokenize=False, add_generation_prompt=True, enable_thinking=False)
    prefix = tokenizer.encode(prompt, add_special_tokens=False)
    reply = tokenizer.encode(row['reply'], add_special_tokens=False) + [tokenizer.eos_token_id]
    ids = prefix + reply
    if len(ids) > max_length:
        raise ValueError(f"{row['id']}: {len(ids)} tokens exceed limit {max_length}; no silent truncation")
    return {'input_ids': ids, 'attention_mask': [1] * len(ids), 'labels': [-100] * len(prefix) + reply}


def generate(model, tokenizer, row, characters, actions, attempts=3):
    model.eval()
    previous = list(row.get('previous', []))
    rejected = []
    for _ in range(attempts):
        messages = messages_for({**row, 'previous': previous}, characters, actions)
        text = tokenizer.apply_chat_template(messages, tokenize=False,
            add_generation_prompt=True, enable_thinking=False)
        inputs = tokenizer(text, return_tensors='pt', add_special_tokens=False).to('cuda')
        if inputs.input_ids.shape[-1] > 1024:
            raise ValueError('Action context exceeds 1024 tokens')
        with torch.inference_mode():
            ids = model.generate(**inputs, max_new_tokens=80, do_sample=True, temperature=0.7,
                top_p=0.8, top_k=20, repetition_penalty=1.1, use_cache=True,
                eos_token_id=generation_eos(tokenizer),pad_token_id=tokenizer.eos_token_id)
        line = tokenizer.decode(ids[0, inputs.input_ids.shape[-1]:], skip_special_tokens=True).strip()
        if valid_reply(line, previous):
            return {'valid': True, 'line': line, 'rejected': rejected, 'source': 'local-generation'}
        rejected.append(line)
        previous.append(line)
    return {'valid': False, 'line': None, 'rejected': rejected, 'source': 'local-generation'}
