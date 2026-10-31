"""Selection uses held-out token loss, never the latest step or training loss."""
import math


def best_epoch(records):
    if not records or any(not math.isfinite(row['loss']) or row['loss'] < 0 for row in records):
        raise ValueError('empty or invalid validation metrics')
    return min(records, key=lambda row: row['loss'])


def remaining_batches(rows, accumulation, epochs, saved_steps=0):
    """Yield unfinished updates; finalization-only recovery must use an earlier checkpoint."""
    per_epoch = math.ceil(rows / accumulation)
    if rows < 1 or accumulation < 1 or epochs < 1 or not 0 <= saved_steps < per_epoch * epochs:
        raise ValueError('invalid resume step or training limits')
    for epoch in range(epochs):
        for batch, offset in enumerate(range(0, rows, accumulation)):
            if epoch * per_epoch + batch >= saved_steps:
                yield epoch, offset


def validate_initial_adapter(config, model):
    expected = {'base_model_name_or_path': model, 'peft_type': 'LORA', 'task_type': 'CAUSAL_LM',
                'r': 8, 'lora_alpha': 16}
    if any(config.get(key) != value for key, value in expected.items()):
        raise ValueError('initial adapter model or LoRA configuration mismatch')
    if set(config.get('target_modules', [])) != {'q_proj', 'k_proj', 'v_proj', 'o_proj'}:
        raise ValueError('initial adapter target modules mismatch')
