"""Freeze a second-stage action focus without changing any target or source row."""
import json
from pathlib import Path
from core import HERE,read_json,write_json,sha256,registries,check_rows

def main():
    source=HERE/'data/gomi-actions-v3'
    output=HERE/'data/gomi-actions-v3-focus'
    if output.exists():
        raise FileExistsError(output)
    manifest=read_json(source/'manifest.json')
    for file,digest in manifest['files'].items():
        if sha256(source/file)!=digest:
            raise ValueError('Frozen source differs: '+file)
    rows=[json.loads(line) for line in (source/'train.jsonl').read_text(encoding='utf-8').splitlines()]
    train=[row for row in rows if row['source']=='agent-authored-action-state-rewrite-v3' or row.get('condition') in ['cold','unwell']]
    validation=[json.loads(line) for line in (source/'validation.jsonl').read_text(encoding='utf-8').splitlines()]
    chars,actions=registries()
    check_rows(train,validation,chars,actions)
    assert len(train)==330 and len(validation)==36
    output.mkdir()
    for split,values in [('train',train),('validation',validation)]:
        (output/(split+'.jsonl')).write_bytes((''.join(json.dumps(row,ensure_ascii=False)+'\n' for row in values)).encode('utf-8'))
    write_json(output/'manifest.json',{'phase':'second-stage-action-focus','trainRows':330,'validationRows':36,
        'rule':'All300 corrected action/state drafts plus all30 verbatim cold/illness originals; no targets changed. Other247-source references remain preserved in v3.',
        'sourceManifestSha256':sha256(source/'manifest.json'),'builderSha256':sha256(Path(__file__)),
        'files':{file:sha256(output/file) for file in ['train.jsonl','validation.jsonl']},'qualityApproved':False})
    print('Frozen second-stage corpus:330/36, exact original rows retained.')

if __name__=='__main__':
    main()
