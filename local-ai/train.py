"""Train a new small character adapter entirely on this PC."""
import argparse
from datetime import datetime
import hashlib
import json
from pathlib import Path
import random
import sys
import time

from core import HERE, ROOT, load_corpus, read_json, write_json, sha256, training_evidence, select_adapter
from modeling import torch, load_model, local_base, encode, generate
sys.path.insert(0, str(ROOT / 'scripts/gomi-training'))
from training_data import response_loss


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--character', default='gomi')
    parser.add_argument('--extra', type=Path)
    parser.add_argument('--corpus', type=Path, help='explicit replacement corpus, keeps frozen originals untouched')
    parser.add_argument('--initial-adapter', type=Path, help='continue a previous 0.6B character experiment with a new optimizer')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--epochs', type=int, default=1)
    parser.add_argument('--max-steps', type=int, default=0, help='0 runs the entire corpus')
    parser.add_argument('--learning-rate', type=float, default=2e-4)
    parser.add_argument('--accumulation', type=int, default=4)
    parser.add_argument('--max-length', type=int, default=768)
    parser.add_argument('--resume', type=Path, help='checkpoint folder from an interrupted identical run')
    args = parser.parse_args()
    if args.epochs < 1 or args.accumulation < 1 or args.max_steps < 0 or not 0 < args.learning_rate < 0.1:
        raise ValueError('invalid training settings')
    if args.resume and args.initial_adapter:
        raise ValueError('Use resume OR initial-adapter, not both')
    train, validation, characters, actions = load_corpus(args.character, args.extra, args.corpus)
    settings = {key: getattr(args, key) for key in ['character', 'epochs', 'max_steps', 'learning_rate', 'accumulation', 'max_length']}
    lock = local_base()
    initial_adapter = None
    if args.initial_adapter:
        original = read_json(args.initial_adapter.parent/'report.json')
        if original['model'] != lock['model'] or original['revision'] != lock['revision'] or args.character not in original['trainedCharacterIds']:
            raise ValueError('Initial adapter base revision or character differs')
        initial_adapter = {'path':str(args.initial_adapter.resolve()), 'sha256':sha256(args.initial_adapter/'adapter_model.safetensors')}
        if initial_adapter['sha256'] != original['adapterSha256']:
            raise ValueError('Initial adapter hash differs from its completed run')
    identity = {'model': lock['model'], 'revision': lock['revision'], 'settings': settings,
                'dataSha256': hashlib.sha256(json.dumps([train, validation, characters, actions], sort_keys=True, ensure_ascii=False).encode()).hexdigest(),
                'pipelineSha256': {name: sha256(HERE / name) for name in ['core.py', 'modeling.py', 'train.py', 'prompt-contract.json']}}
    identity['initialAdapter'] = initial_adapter
    if args.resume:
        identity['initialAdapter'] = read_json(args.resume/'identity.json').get('initialAdapter')
    if args.resume:
        saved = read_json(args.resume / 'identity.json')
        if saved != identity:
            raise ValueError('Resume requires identical model, data, persona, actions and settings')
        output = args.resume.parent
        if args.output and args.output.resolve() != output.resolve():
            raise ValueError('Resume output does not match checkpoint')
        report = read_json(output / 'report.json')
        if report['phase'] == 'complete':
            raise ValueError('Completed runs cannot be resumed')
    else:
        output = args.output or HERE / 'runs' / (args.character + '-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
        output.mkdir(parents=True, exist_ok=False)
        report = {**identity, 'phase': 'preparing', 'qualityApproved': False, 'deployedToApp': False,
                  'trainedCharacterIds': [args.character], 'trainRows': len(train), 'validationRows': len(validation),
                  'lossHistory': [], 'externalApiUsed': False,
                  'sourceCommit': __import__('subprocess').check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()}
        for name, value in [('train', train), ('validation', validation), ('characters', characters), ('actions', actions),
                            ('prompt-contract', read_json(HERE/'prompt-contract.json'))]:
            write_json(output / (name + '.json'), value)
        write_json(output / 'identity.json', identity)
    report_path = output / 'report.json'
    write_json(report_path, report)
    started = time.monotonic()
    torch.manual_seed(73)
    random.seed(73)
    try:
        model, tokenizer = load_model(args.resume or args.initial_adapter, train=True)
        training = [encode(row, tokenizer, characters, actions, args.max_length) for row in train]
        valid = [encode(row, tokenizer, characters, actions, args.max_length) for row in validation]
        report['longestTokens'] = max(len(x['input_ids']) for x in training + valid)
        params = [p for p in model.parameters() if p.requires_grad]
        param_names = [name for name, p in model.named_parameters() if p.requires_grad]
        report['trainableParameters'] = sum(p.numel() for p in params)
        initial = [p.detach().cpu().clone() for p in params]
        optimizer = torch.optim.AdamW(params, lr=args.learning_rate, weight_decay=0.01)
        batches = []
        for epoch in range(args.epochs):
            order = list(range(len(training)))
            random.Random(73 + epoch).shuffle(order)
            batches += [order[i:i + args.accumulation] for i in range(0, len(order), args.accumulation)]
        if args.max_steps:
            batches = batches[:args.max_steps]
        first_step = 0
        previous_changed = []
        if args.resume:
            state = torch.load(args.resume / 'training-state.pt', weights_only=True, map_location='cpu')
            if state['adapterSha256'] != sha256(args.resume / 'adapter_model.safetensors'):
                raise ValueError('Checkpoint weights do not match optimizer state')
            first_step = state['step']
            if not 0 < first_step <= len(batches):
                raise ValueError('Checkpoint step is outside this schedule')
            previous_changed = state['changedTensorNames']
            optimizer.load_state_dict(state['optimizer'])
            torch.set_rng_state(state['cpuRng'])
            torch.cuda.set_rng_state_all(state['cudaRng'])
            report['lossHistory'] = [row for row in report['lossHistory'] if row['step'] <= first_step]
        report.setdefault('epochValidation', [])
        report['epochValidation'] = [row for row in report['epochValidation'] if row['step'] <= first_step]

        def evaluate():
            model.eval()
            total, tokens = 0.0, 0
            with torch.no_grad(), torch.autocast('cuda', dtype=torch.bfloat16):
                for row in valid:
                    count = sum(x != -100 for x in row['labels'][1:])
                    value = float(response_loss(model, row))
                    if not __import__('math').isfinite(value):
                        raise FloatingPointError('Nonfinite validation loss')
                    total += value * count
                    tokens += count
            return total / tokens

        def checkpoint(step):
            destination = output / f'checkpoint-{step}-{time.time_ns()}'
            destination.mkdir()
            model.save_pretrained(destination, safe_serialization=True, save_embedding_layers=False)
            write_json(destination / 'identity.json', identity)
            torch.save({'step': step, 'optimizer': optimizer.state_dict(),
                'cpuRng': torch.get_rng_state(), 'cudaRng': torch.cuda.get_rng_state_all(),
                'changedTensorNames': training_evidence(previous_changed,
                    [name for name, old, p in zip(param_names, initial, params) if not torch.equal(old, p.detach().cpu())]),
                'adapterSha256': sha256(destination / 'adapter_model.safetensors')}, destination / 'training-state.pt')
            report['lastCheckpoint'] = str(destination)

        if not args.resume:
            report['beforeValidationLoss'] = evaluate()
            if initial_adapter:
                starting_path = initial_adapter['path']
            else:
                starting_path = str(output / ('epoch-0-'+str(time.time_ns())))
                model.save_pretrained(starting_path, safe_serialization=True, save_embedding_layers=False)
            report['startingAdapterCandidate'] = {'epoch':0,'step':0,
                'loss':report['beforeValidationLoss'],'adapter':starting_path}
        report.update(phase='training', plannedOptimizerSteps=len(batches), gpu=torch.cuda.get_device_name(0))
        write_json(report_path, report)
        print(json.dumps({'output': str(output), 'phase': 'training', 'steps': len(batches), 'longestTokens': report['longestTokens']}, ensure_ascii=False), flush=True)
        for index, batch in enumerate(batches[first_step:], start=first_step + 1):
            model.train()
            optimizer.zero_grad(set_to_none=True)
            total = 0.0
            for item in batch:
                with torch.autocast('cuda', dtype=torch.bfloat16):
                    loss = response_loss(model, training[item])
                if not torch.isfinite(loss):
                    raise FloatingPointError('Nonfinite loss')
                (loss / len(batch)).backward()
                total += float(loss.detach()) / len(batch)
            norm = torch.nn.utils.clip_grad_norm_(params, 1.0)
            if not torch.isfinite(norm):
                raise FloatingPointError('Nonfinite gradient')
            optimizer.step()
            report['lossHistory'].append({'step': index, 'loss': total})
            report['optimizerSteps'] = index
            per_epoch = (len(training)+args.accumulation-1)//args.accumulation
            if index % per_epoch == 0 or index == len(batches):
                destination = output / ('epoch-'+str((index+per_epoch-1)//per_epoch)+'-'+str(time.time_ns()))
                model.save_pretrained(destination, safe_serialization=True, save_embedding_layers=False)
                report['epochValidation'].append({'epoch':(index+per_epoch-1)//per_epoch,'step':index,
                    'loss':evaluate(),'adapter':str(destination)})
                print(json.dumps({'epochValidation':report['epochValidation'][-1]}),flush=True)
            if index % 25 == 0 or index == len(batches):
                checkpoint(index)
            report['elapsedSeconds'] = round(time.monotonic() - started, 1)
            write_json(report_path, report)
            if index == 1 or index % 5 == 0 or index == len(batches):
                print(json.dumps({'step': index, 'total': len(batches), 'loss': round(total, 4), 'seconds': report['elapsedSeconds']}), flush=True)
        report['lastEpochValidationLoss'] = evaluate()
        report['changedTensorNames'] = training_evidence(previous_changed,
            [name for name, old, p in zip(param_names, initial, params) if not torch.equal(old, p.detach().cpu())])
        report['changedTensors'] = len(report['changedTensorNames'])
        selected = select_adapter(report['epochValidation'], report.get('startingAdapterCandidate'))
        report['selectedEpoch'] = selected['epoch']
        report['selectedTrainingImproved'] = selected['loss'] < report['beforeValidationLoss']
        # Select only using validation, never the held-out generation test.
        del optimizer
        base = model.unload()
        if hasattr(base, 'peft_config'):
            delattr(base, 'peft_config')
        from peft import PeftModel
        model = PeftModel.from_pretrained(base, selected['adapter'], local_files_only=True).eval()
        report['afterValidationLoss'] = evaluate()
        adapter = output / ('adapter-' + str(time.time_ns()))
        model.save_pretrained(adapter, safe_serialization=True, save_embedding_layers=False)
        tokenizer.save_pretrained(adapter)
        report['adapterPath'] = str(adapter)
        report['adapterSha256'] = sha256(adapter / 'adapter_model.safetensors')
        report['adapterBytes'] = (adapter / 'adapter_model.safetensors').stat().st_size
        base = model.unload()
        if hasattr(base, 'peft_config'):
            delattr(base, 'peft_config')
        from peft import PeftModel
        model = PeftModel.from_pretrained(base, adapter, local_files_only=True).eval()
        report['reloadValidationLoss'] = evaluate()
        if abs(report['afterValidationLoss'] - report['reloadValidationLoss']) > 1e-5:
            raise RuntimeError('Reloaded adapter validation loss differs')
        report['adapterReloaded'] = True
        samples = []
        for action in ['touch', 'walk', 'treat', 'pet', 'play', 'rest']:
            row = {'characterId': args.character, 'action': action, 'affection': 75}
            samples.append({'input': row, **generate(model, tokenizer, row, characters, actions)})
        write_json(output / 'samples.json', samples)
        report.update(phase='complete', peakAllocatedMiB=round(torch.cuda.max_memory_allocated() / 1048576),
                      elapsedSeconds=round(time.monotonic() - started, 1),
                      validFormatSamples=sum(x['valid'] for x in samples), sampleCount=len(samples))
        write_json(report_path, report)
        write_json(HERE / 'runs/latest.json', {'output': str(output), 'characterId': args.character})
        print(json.dumps({key: report[key] for key in ['phase', 'trainRows', 'validationRows', 'optimizerSteps', 'beforeValidationLoss', 'afterValidationLoss', 'adapterBytes', 'adapterReloaded', 'validFormatSamples', 'elapsedSeconds']}, ensure_ascii=False), flush=True)
    except BaseException as error:
        report.update(phase='interrupted' if isinstance(error, KeyboardInterrupt) else 'failed', error=repr(error))
        write_json(report_path, report)
        raise


if __name__ == '__main__':
    main()
