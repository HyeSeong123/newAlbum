"""Exercise the installed CUDA/QLoRA stack without downloading any model."""
import hashlib
import json
import os
from pathlib import Path
import platform
import tempfile
import time

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
os.environ['DO_NOT_TRACK'] = '1'

import torch
from transformers import Qwen3Config, Qwen3ForCausalLM, BitsAndBytesConfig
from peft import LoraConfig, PeftModel, get_peft_model, prepare_model_for_kbit_training


def main():
    started = time.monotonic()
    if not torch.cuda.is_available():
        raise RuntimeError('CUDA is unavailable. CPU fallback is deliberately disabled.')
    torch.set_num_threads(4)
    torch.manual_seed(73)
    device = torch.cuda.get_device_properties(0)
    report = {
        'python': platform.python_version(), 'torch': torch.__version__,
        'cuda': torch.version.cuda, 'gpu': device.name,
        'capability': list(torch.cuda.get_device_capability(0)),
        'vramMiB': device.total_memory // 1048576,
        'testKind': 'random-tiny-Qwen3-NF4-LoRA-backprop-save-reload',
        'externalApiUsed': False, 'qualityApproved': False, 'deployedToApp': False,
    }
    # This is a randomly initialized compatibility fixture, NOT a trained character.
    with tempfile.TemporaryDirectory(prefix='gomgomi-gpu-') as temp:
        root = Path(temp)
        config = Qwen3Config(vocab_size=64, hidden_size=64, intermediate_size=128,
                             num_hidden_layers=2, num_attention_heads=4,
                             num_key_value_heads=2, head_dim=16,
                             eos_token_id=2, pad_token_id=0, use_cache=False)
        Qwen3ForCausalLM(config).save_pretrained(root / 'base')
        quant = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type='nf4',
                                  bnb_4bit_compute_dtype=torch.bfloat16)
        model = Qwen3ForCausalLM.from_pretrained(
            root / 'base', local_files_only=True, quantization_config=quant,
            device_map={'': 0}, dtype=torch.bfloat16, attn_implementation='sdpa')
        model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=False)
        model = get_peft_model(model, LoraConfig(r=4, lora_alpha=8,
            target_modules=['q_proj', 'v_proj'], task_type='CAUSAL_LM'))
        trainable = [p for p in model.parameters() if p.requires_grad]
        before = [p.detach().clone() for p in trainable]
        optimizer = torch.optim.AdamW(trainable, lr=0.01)
        ids = torch.tensor([[1, 4, 7, 12, 8, 2]], device='cuda')
        losses = []
        for _ in range(3):
            model.train()
            optimizer.zero_grad(set_to_none=True)
            loss = model(input_ids=ids, labels=ids).loss
            if not torch.isfinite(loss):
                raise RuntimeError('Nonfinite training loss')
            loss.backward()
            if not all(p.grad is not None and torch.isfinite(p.grad).all() for p in trainable):
                raise RuntimeError('Missing or nonfinite LoRA gradients')
            optimizer.step()
            losses.append(float(loss.detach()))
        changed = sum(not torch.equal(old, p) for old, p in zip(before, trainable))
        if not changed:
            raise RuntimeError('Optimizer did not change weights')
        model.eval()
        with torch.no_grad():
            reference = model(input_ids=ids).logits.detach().clone()
        model.save_pretrained(root / 'adapter', safe_serialization=True)
        base = model.unload()
        if hasattr(base, 'peft_config'):
            delattr(base, 'peft_config')
        reloaded = PeftModel.from_pretrained(base, root / 'adapter', local_files_only=True).eval()
        with torch.no_grad():
            restored = reloaded(input_ids=ids).logits
        torch.testing.assert_close(reference, restored, rtol=0, atol=0)
        torch.cuda.synchronize()
        report.update(optimizerSteps=3, changedTensors=changed, losses=losses,
                      adapterReloaded=True, reloadLogitsIdentical=True,
                      elapsedSeconds=round(time.monotonic() - started, 2),
                      peakAllocatedMiB=round(torch.cuda.max_memory_allocated() / 1048576, 1))
    project = Path(__file__).resolve().parents[1]
    for split in ['train', 'validation']:
        path = project / f'models/gomi-lora-v4/data/{split}.jsonl'
        report[f'{split}Rows'] = len(path.read_text(encoding='utf-8').splitlines())
        report[f'{split}Sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
    report['verified'] = True
    path = Path(__file__).with_name('environment.json')
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
