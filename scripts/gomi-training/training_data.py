"""Pure data validation. Training never supervises instructions or silent truncation."""
import json
from pathlib import Path


def supervised_tokens(prompt, answer, eos, max_length):
    if not prompt or not answer:
        raise ValueError('empty prompt or reply')
    tokens = list(prompt) + list(answer) + [eos]
    if len(tokens) > max_length:
        raise ValueError(f'example too long: {len(tokens)} > {max_length}')
    return tokens, [-100] * len(prompt) + list(answer) + [eos]


def validate_splits(train, validation):
    if not train or not validation:
        raise ValueError('empty split')
    for key in ['group', 'prompt', 'reply']:
        if {row[key] for row in train} & {row[key] for row in validation}:
            raise ValueError(f'split overlap: {key}')
    ids = set()
    for row in train + validation:
        if not row['prompt'].endswith('<|im_start|>assistant\n') or '<think>' in row['prompt'] or '/no_think' in row['prompt']:
            raise ValueError('missing 4B native assistant prefix')
        if not isinstance(row['reply'], str) or not 2 <= len(row['reply']) <= 70:
            raise ValueError('invalid reply')
        if row.get('id') in ids:
            raise ValueError('duplicate example id')
        ids.add(row.get('id'))


def load_rows(path):
    return [json.loads(line) for line in Path(path).read_text(encoding='utf-8').splitlines() if line.strip()]


def encode_row(row, tokenizer, max_length):
    prompt = tokenizer.encode(row['prompt'], add_special_tokens=False)
    answer = tokenizer.encode(row['reply'], add_special_tokens=False)
    ids, labels = supervised_tokens(prompt, answer, tokenizer.eos_token_id, max_length)
    return {'input_ids': ids, 'labels': labels, 'attention_mask': [1] * len(ids)}


def response_loss(model, row, device='cuda'):
    """Same causal masked CE, projecting only positions that predict the reply."""
    import torch
    from torch.nn import functional as F
    positions = [index for index, target in enumerate(row['labels'][1:]) if target != -100]
    if not positions:
        raise ValueError('empty supervised answer')
    targets = torch.tensor([row['labels'][index + 1] for index in positions], device=device)
    inputs = {key: torch.tensor([row[key]], device=device) for key in ['input_ids', 'attention_mask']}
    logits = model(**inputs, logits_to_keep=torch.tensor(positions, device=device)).logits
    return F.cross_entropy(logits[0].float(), targets)
