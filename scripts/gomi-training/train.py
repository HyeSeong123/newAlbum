"""Local Gomi 4B QLoRA experiment. Never installs/deploys weights into the app."""
import argparse
import gc
import hashlib
import json
import math
import os
from pathlib import Path
import random
import shutil
import time

from training_data import encode_row, load_rows, response_loss, validate_splits
from training_metrics import best_epoch, remaining_batches, validate_initial_adapter

MODEL = 'Qwen/Qwen3-4B-Instruct-2507'
SOURCE = 'unsloth/Qwen3-4B-Instruct-2507-bnb-4bit'


def write_json(path, value):
    path = Path(path)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    tmp.replace(path)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def prepare_base(work):
    from huggingface_hub import HfApi, snapshot_download
    lock = work / 'base-model-nf4.json'
    if lock.exists():
        base = json.loads(lock.read_text())
        if base['model'] != MODEL or base['source'] != SOURCE:
            raise ValueError('base-model-nf4.json must target the app 4B model')
    else:
        base = {'model': MODEL, 'source': SOURCE, 'revision': HfApi().model_info(SOURCE).sha,
                'originalModelRevision': HfApi().model_info(MODEL).sha}
        write_json(lock, base)
    print(json.dumps({'phase': 'download', **base}), flush=True)
    location = snapshot_download(SOURCE, revision=base['revision'], max_workers=2,
                                 allow_patterns=['*.json', '*.safetensors', '*.txt', '*.jinja', 'LICENSE', 'README.md'])
    base['localPath'] = location
    write_json(lock, base)
    return base


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path, required=True)
    parser.add_argument('--mode', choices=['prepare', 'check', 'train'], default='check')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--epochs', type=int, default=1)
    parser.add_argument('--accumulation', type=int, default=4)
    parser.add_argument('--max-length', type=int, default=640)
    parser.add_argument('--learning-rate', type=float, default=2e-4)
    parser.add_argument('--checkpoint-every', type=int, default=6)
    parser.add_argument('--resume-step', type=int, default=0)
    parser.add_argument('--allow-optimizer-reset', action='store_true')
    parser.add_argument('--initial-adapter', type=Path)
    args = parser.parse_args()
    if args.epochs < 1 or args.accumulation < 1 or args.max_length < 32 or args.checkpoint_every < 1:
        raise ValueError('invalid training limits')
    args.work.mkdir(parents=True, exist_ok=True)
    base = prepare_base(args.work)
    if args.mode == 'prepare':
        return

    import torch
    from transformers import AutoConfig, AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
    from peft import LoraConfig, PeftModel, get_peft_model, prepare_model_for_kbit_training
    torch.set_num_threads(4)
    torch.manual_seed(73)
    random.seed(73)
    if not torch.cuda.is_available():
        raise RuntimeError('CUDA unavailable; do not silently switch to CPU or a smaller model')
    train_rows = load_rows(args.work / 'data/train.jsonl')
    valid_rows = load_rows(args.work / 'data/validation.jsonl')
    validate_splits(train_rows, valid_rows)
    tokenizer = AutoTokenizer.from_pretrained(base['localPath'], local_files_only=True)
    training = [encode_row(row, tokenizer, args.max_length) for row in train_rows]
    validation = [encode_row(row, tokenizer, args.max_length) for row in valid_rows]
    checks = {'phase': 'data_checked', 'model': MODEL, 'source': SOURCE, 'revision': base['revision'],
              'originalModelRevision': base['originalModelRevision'],
              'gpu': torch.cuda.get_device_name(0), 'trainingRows': len(training), 'validationRows': len(validation),
              'longestTokens': max(len(row['input_ids']) for row in training + validation)}
    print(json.dumps(checks), flush=True)
    if args.mode == 'check':
        return
    if not args.output:
        raise ValueError('--output is required for training')
    hashes = {name: digest(args.work / f'data/{name}') for name in ['train.jsonl', 'validation.jsonl', 'manifest.json']}
    initial_adapter = None
    if args.initial_adapter:
        adapter_config = json.loads((args.initial_adapter / 'adapter_config.json').read_text())
        validate_initial_adapter(adapter_config, MODEL)
        if adapter_config.get('revision') != base['originalModelRevision']:
            raise ValueError('initial adapter canonical model reference mismatch')
        initial_adapter = {'path': str(args.initial_adapter),
                           'sha256': digest(args.initial_adapter / 'adapter_model.safetensors')}
    pending = set(remaining_batches(len(training), args.accumulation, args.epochs, args.resume_step))
    resume_path = args.output / f'checkpoint-{args.resume_step}'
    resume_state = None
    if args.resume_step:
        report = json.loads((args.output / 'report.json').read_text())
        if report['phase'] == 'complete' or report['dataHashes'] != hashes:
            raise ValueError('cannot resume completed run or changed data')
        if initial_adapter and report.get('initialAdapter') != initial_adapter:
            raise ValueError('initial adapter differs from the interrupted run')
        for key in ['model', 'source', 'revision', 'originalModelRevision', 'trainingRows', 'validationRows']:
            if report[key] != checks[key]:
                raise ValueError(f'resume metadata mismatch: {key}')
        for key in ['epochs', 'accumulation', 'max_length', 'learning_rate']:
            if report['settings'][key] != getattr(args, key):
                raise ValueError(f'resume setting mismatch: {key}')
        if args.resume_step > max(row['step'] for row in report['lossHistory']):
            raise ValueError('resume step exceeds recorded training')
        adapter_sha = digest(resume_path / 'adapter_model.safetensors')
        state_path = resume_path / 'training-state.pt'
        if state_path.exists():
            resume_state = torch.load(state_path, map_location='cpu', weights_only=True)
            if resume_state['step'] != args.resume_step or resume_state['adapterSha256'] != adapter_sha:
                raise ValueError('checkpoint state and adapter mismatch')
        elif not args.allow_optimizer_reset:
            raise ValueError('optimizer state missing; explicit --allow-optimizer-reset required')
        snapshot = args.output / f'interrupted-at-{report["lossHistory"][-1]["step"]}-{time.time_ns()}.json'
        shutil.copy2(args.output / 'report.json', snapshot)
        report.setdefault('recoveries', []).append({
            'savedStep': args.resume_step, 'lastLoggedStep': report['lossHistory'][-1]['step'],
            'optimizerReset': resume_state is None, 'checkpointSha256': adapter_sha,
            'interruptedReport': snapshot.name})
        report['lossHistory'] = [row for row in report['lossHistory'] if row['step'] <= args.resume_step]
        finished_epochs = args.resume_step // math.ceil(len(training) / args.accumulation)
        report['epochValidation'] = [row for row in report['epochValidation'] if row['epoch'] <= finished_epochs]
        report['changedTensorsReference'] = f'checkpoint-{args.resume_step}'
    else:
        args.output.mkdir(parents=True, exist_ok=False)
        report = {**checks, 'phase': 'loading', 'qualityApproved': False, 'deployedToApp': False,
              'initialAdapter': initial_adapter,
              'baselineKind': 'initial-adapter' if initial_adapter else 'base-without-adapter',
              'changedTensorsReference': str(args.initial_adapter) if initial_adapter else 'random-initialization',
              'settings': {key: str(value) if isinstance(value, Path) else value for key, value in vars(args).items()},
              'dataHashes': hashes,
              'versions': {'torch': torch.__version__}, 'lossHistory': [], 'epochValidation': []}
    report_path = args.output / 'report.json'
    previous_elapsed = report.get('elapsedSeconds', 0)
    started = time.monotonic()
    write_json(report_path, report)

    def event(phase, **values):
        report.update(phase=phase, elapsedSeconds=round(previous_elapsed + time.monotonic() - started, 1), **values)
        write_json(report_path, report)
        print(json.dumps({'phase': phase, **values}, ensure_ascii=False), flush=True)

    def loss_on(rows):
        model.eval()
        total, tokens = 0.0, 0
        with torch.no_grad():
            for row in rows:
                count = sum(value != -100 for value in row['labels'][1:])
                loss = float(response_loss(model, row))
                if not math.isfinite(loss):
                    raise FloatingPointError('nonfinite evaluation loss')
                total += loss * count
                tokens += count
        return total / tokens

    # One unseen prompt per group; keep before/after decoding identical and seeded.
    probes = list({row['group']: row for row in reversed(valid_rows)}.values())[:6]
    persona_probes = [row for row in valid_rows if row.get('kind') == 'persona-evaluation']
    if persona_probes:
        probes = [next(row for row in persona_probes if row['section'] == section) for section in range(1, 7)]
        probes += [row for row in valid_rows if row['group'] == 'walk-2'][:1]
    additional_probes = [row for row in valid_rows if row.get('kind') == 'persona-evaluation-v4']
    if additional_probes:
        probes = [next(row for row in additional_probes if row['section'] == section) for section in range(1, 5)]
        probes += [row for row in valid_rows if row['group'] == 'walk-2'][:1]

    def generate_probes():
        model.eval()
        generated = []
        with torch.no_grad():
            for index, row in enumerate(probes):
                torch.manual_seed(73 + index)
                inputs = tokenizer(row['prompt'], add_special_tokens=False, return_tensors='pt').to('cuda')
                output = model.generate(**inputs, max_new_tokens=64, do_sample=True, temperature=0.7,
                                        top_p=0.8, top_k=20, repetition_penalty=1.1,
                                        use_cache=True,
                                        pad_token_id=tokenizer.eos_token_id)
                text = tokenizer.decode(output[0, inputs.input_ids.shape[1]:], skip_special_tokens=True).strip()
                generated.append({'id': row['id'], 'group': row['group'], 'reference': row['reply'], 'generated': text})
        return generated

    try:
        config = AutoConfig.from_pretrained(base['localPath'], local_files_only=True)
        # Keep NF4 stored weights, but override the distributor's BF16 compute default for GTX 1660.
        config.quantization_config = BitsAndBytesConfig(
            load_in_4bit=True, bnb_4bit_quant_type='nf4', bnb_4bit_use_double_quant=True,
            bnb_4bit_compute_dtype=torch.float32).to_dict()
        model = AutoModelForCausalLM.from_pretrained(
            base['localPath'], local_files_only=True, use_safetensors=True, torch_dtype=torch.float32,
            config=config, device_map={'': 0}, attn_implementation='sdpa')
        model.config.use_cache = False
        model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True,
                                               gradient_checkpointing_kwargs={'use_reentrant': False})
        model.name_or_path = MODEL
        model.config._name_or_path = MODEL
        if args.resume_step:
            model = PeftModel.from_pretrained(model, resume_path, is_trainable=True)
        elif initial_adapter:
            model = PeftModel.from_pretrained(model, args.initial_adapter, is_trainable=True)
        else:
            model = get_peft_model(model, LoraConfig(r=8, lora_alpha=16, lora_dropout=0.05,
                                               revision=base['originalModelRevision'],
                                               target_modules=['q_proj', 'k_proj', 'v_proj', 'o_proj'],
                                               bias='none', task_type='CAUSAL_LM'))
        trainable = [param for param in model.parameters() if param.requires_grad]
        optimizer = torch.optim.AdamW(trainable, lr=args.learning_rate, weight_decay=0.01)
        initial = {name: param.detach().cpu().clone() for name, param in model.named_parameters() if param.requires_grad}
        event('loaded', trainableParameters=sum(param.numel() for param in trainable),
              allocatedMiB=round(torch.cuda.memory_allocated() / 2**20))
        # Prove the longest real batch fits before spending time on baseline generation.
        model.train()
        smoke = response_loss(model, max(training, key=lambda row: len(row['input_ids'])))
        if not torch.isfinite(smoke):
            raise FloatingPointError('nonfinite smoke loss')
        smoke.backward()
        torch.nn.utils.clip_grad_norm_(trainable, 1.0, error_if_nonfinite=True)
        smoke_value = float(smoke.detach())
        optimizer.zero_grad(set_to_none=True)
        del smoke
        event('gpu_backward_checked', smokeLoss=smoke_value,
              peakAllocatedMiB=round(torch.cuda.max_memory_allocated() / 2**20))
        if args.resume_step:
            before = report['beforeValidationLoss']
            if resume_state is not None:
                optimizer.load_state_dict(resume_state['optimizer'])
                torch.set_rng_state(resume_state['torchRng'])
                torch.cuda.set_rng_state_all(resume_state['cudaRng'])
                del resume_state
            event('resumed', resumedFromStep=args.resume_step,
                  optimizerReset=report['recoveries'][-1]['optimizerReset'])
        else:
            if initial_adapter:
                before = loss_on(validation)
                before_lines = generate_probes()
            else:
                with model.disable_adapter():
                    before = loss_on(validation)
                    before_lines = generate_probes()
            write_json(args.output / 'before.json', before_lines)
            event('baseline', beforeValidationLoss=before)
        updates = args.resume_step
        for epoch in range(args.epochs):
            if not any(item[0] == epoch for item in pending):
                continue
            order = list(range(len(training)))
            random.Random(73 + epoch).shuffle(order)
            model.train()
            for offset in range(0, len(order), args.accumulation):
                if (epoch, offset) not in pending:
                    continue
                group = order[offset:offset + args.accumulation]
                optimizer.zero_grad(set_to_none=True)
                losses = []
                for index in group:
                    loss = response_loss(model, training[index])
                    if not torch.isfinite(loss):
                        raise FloatingPointError('nonfinite training loss')
                    losses.append(float(loss.detach()))
                    (loss / len(group)).backward()
                norm = torch.nn.utils.clip_grad_norm_(trainable, 1.0, error_if_nonfinite=True)
                if not torch.isfinite(norm):
                    raise FloatingPointError('nonfinite gradients')
                optimizer.step()
                updates += 1
                metric = {'epoch': epoch + 1, 'step': updates, 'loss': sum(losses) / len(losses)}
                report['lossHistory'].append(metric)
                if updates % args.checkpoint_every == 0:
                    checkpoint = args.output / f'checkpoint-{updates}'
                    model.save_pretrained(checkpoint, safe_serialization=True)
                    state_tmp = checkpoint / 'training-state.pt.tmp'
                    torch.save({'step': updates, 'adapterSha256': digest(checkpoint / 'adapter_model.safetensors'),
                                'optimizer': optimizer.state_dict(), 'torchRng': torch.get_rng_state(),
                                'cudaRng': torch.cuda.get_rng_state_all()}, state_tmp)
                    state_tmp.replace(checkpoint / 'training-state.pt')
                event('training', **metric)
            epoch_loss = loss_on(validation)
            epoch_name = f'epoch-{epoch + 1}'
            model.save_pretrained(args.output / epoch_name, safe_serialization=True)
            report['epochValidation'].append({'epoch': epoch + 1, 'loss': epoch_loss, 'adapter': epoch_name})
            event('epoch_validated', epoch=epoch + 1, validationLoss=epoch_loss)
        selected = best_epoch(report['epochValidation'])
        event('selecting', selectedEpoch=selected['epoch'], selectedValidationLoss=selected['loss'])
        del optimizer, trainable
        # Unload LoRA only; keep the same 4-bit base weights resident for a true saved-adapter reload.
        model = model.unload()
        # PEFT unload removes LoRA layers but leaves this metadata; clear it before one clean reload.
        if hasattr(model, 'peft_config'):
            delattr(model, 'peft_config')
        gc.collect()
        torch.cuda.empty_cache()
        model = PeftModel.from_pretrained(model, args.output / selected['adapter'], is_trainable=False)
        changed = sum(int(not torch.equal(initial[name], param.detach().cpu()))
                      for name, param in model.named_parameters() if name in initial)
        if changed == 0:
            raise RuntimeError('selected adapter weights did not change')
        adapter_path = args.output / 'adapter'
        model.save_pretrained(adapter_path, safe_serialization=True)
        tokenizer.save_pretrained(adapter_path)
        event('saved', changedTensors=changed, adapterSha256=digest(adapter_path / 'adapter_model.safetensors'))
        del initial
        after = loss_on(validation)
        if not math.isclose(after, selected['loss'], rel_tol=1e-5, abs_tol=1e-5):
            raise RuntimeError('reloaded adapter loss differs from selected epoch')
        after_lines = generate_probes()
        write_json(args.output / 'after.json', after_lines)
        event('complete', beforeValidationLoss=before, afterValidationLoss=after, adapterReloaded=True,
              optimizerSteps=updates, peakAllocatedMiB=round(torch.cuda.max_memory_allocated() / 2**20))
    except BaseException as error:
        event('interrupted' if isinstance(error, KeyboardInterrupt) else 'failed', error=f'{type(error).__name__}: {error}')
        raise


if __name__ == '__main__':
    main()
