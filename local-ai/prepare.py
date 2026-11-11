"""Download a pinned public model; no inference API or training data upload."""
import os
from pathlib import Path
os.environ.setdefault('HF_HOME', str(Path(__file__).parent / 'cache/huggingface'))
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
os.environ['HF_HUB_DISABLE_XET'] = '1'
os.environ['HF_HUB_DISABLE_SYMLINKS_WARNING'] = '1'
from huggingface_hub import HfApi, snapshot_download
from core import HERE, read_json, write_json, sha256


def main():
    lock_path = HERE / 'base-model.json'
    selection = read_json(HERE/'model-selection.json') if (HERE/'model-selection.json').exists() else {
        'model':'naver-hyperclovax/HyperCLOVAX-SEED-Text-Instruct-0.5B',
        'revision':'3da5046fb0195d14f2497de198136987d35fd644'}
    lock = read_json(lock_path) if lock_path.exists() else dict(selection)
    if lock['model'] not in {'Qwen/Qwen3-0.6B','Qwen/Qwen2.5-0.5B-Instruct','naver-hyperclovax/HyperCLOVAX-SEED-Text-Instruct-0.5B'} or lock['model']!=selection['model']:
        raise ValueError('Use a separate experiment for a different base model')
    if lock['revision']!=selection['revision']:
        raise ValueError('Pinned revision differs from model selection')
    location = Path(snapshot_download(lock['model'], revision=lock['revision'], max_workers=2,
        local_dir=lock.get('localPath',str(HERE/'cache'/('base-'+lock['revision'][:8]))),
        allow_patterns=['*.json', '*.safetensors', '*.txt', '*.jinja', 'LICENSE', 'README.md']))
    lock['localPath'] = str(location.resolve())
    lock['files'] = {p.name: {'sha256': sha256(p), 'bytes': p.stat().st_size}
                     for p in sorted(location.iterdir()) if p.is_file()}
    write_json(lock_path, lock)
    print(f"Prepared {lock['model']} at {lock['revision']}; {sum(x['bytes'] for x in lock['files'].values()):,} bytes")


if __name__ == '__main__':
    main()
