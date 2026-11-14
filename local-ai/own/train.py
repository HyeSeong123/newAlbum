"""Gomgomi's own word neural generator. Random initialization; no model downloads.

The learning algorithm and gradients are implemented in neural.py. NumPy is a
PC matrix-arithmetic tool; the app runs our own TS matrix implementation.
"""
import argparse
import base64
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import random
import re
import time

os.environ['OPENBLAS_NUM_THREADS']='4'
os.environ['OMP_NUM_THREADS']='4'
import numpy as np
from neural import OwnWordNet

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
TOKEN = re.compile(r"[^\s.!?…]+|[.!?…]")
MOODS = ['calm', 'curious', 'delighted', 'playful', 'sleepy', 'irritated']
ACTIONS = ['touch', 'walk', 'treat', 'pet', 'play', 'rest']


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def features(row):
    affection = row.get('affection', 45)
    tier = 'close' if affection >= 60 else 'familiar' if affection >= 30 else 'distant'
    sleeping = bool(row.get('sleeping'))
    state = 'asleep-quiet' if sleeping and row['action'] == 'rest' else 'asleep-disturbed' if sleeping else 'awake'
    return ['character:'+row['characterId'], 'action:'+row['action'], 'tier:'+tier,
            'state:'+state, 'condition:'+row.get('condition', 'normal'),
            'mood:'+row.get('mood','calm'), 'energy:'+('low' if row.get('energy',3)<=1 else 'normal')]


def corpus(extra=None):
    source = ROOT/'local-ai/data/gomi-actions-v3/train.jsonl'
    original = [json.loads(line) for line in source.read_text(encoding='utf-8-sig').splitlines()]
    rows, excluded = [], []
    for row in original:
        if row['action'] in ACTIONS:
            rows.append({**row, 'condition':'normal'})
        elif row.get('condition') in ('cold', 'unwell'):
            rows.append({**row, 'action':'touch', 'condition':row['condition']})
        else:
            excluded.append({'id':row['id'], 'reason':'free-form scene lacks an unambiguous structured action; preserved in original corpus'})
    drafts = read(HERE/'action-drafts.json')
    characters = read(ROOT/'local-ai/characters.json')
    rng = random.Random(20261115)
    for cid in characters:
        profile = drafts['profiles'].get(cid, drafts['profiles']['default'])
        for action in ACTIONS:
            for tier, affection in [('distant',10), ('familiar',45), ('close',80)]:
                parts = drafts['gomi'][action][tier] if cid == 'gomi' else {
                    'starts':profile['starts'], 'ends':drafts['others'][action]}
                for pi, opening in enumerate(parts['starts']):
                    for ei, ending in enumerate(parts['ends']):
                        # Leave composition gaps: never train on every possible
                        # combination of the authored clauses.
                        if (pi+ei)%4 == 0:
                            continue
                        reply = (opening+' '+ending).strip()
                        if len(reply)>50:
                            continue
                        rows.append({'id':f'own-draft-{len(rows)}', 'characterId':cid, 'action':action,
                                     'affection':affection, 'energy':3, 'sleeping':False, 'mood':rng.choice(MOODS[:4]),
                                     'condition':'normal', 'reply':reply, 'authorship':'agent-authored-own-v1',
                                     'source':'local-ai/own/action-drafts.json'})
        for action in ACTIONS:
            parts = drafts['sleepQuiet'] if action == 'rest' else drafts['sleepDisturbed']
            for start in parts['starts']:
                for end in parts['ends']:
                    rows.append({'id':f'own-sleep-{len(rows)}', 'characterId':cid, 'action':action,
                                 'affection':rng.choice([10,45,80]), 'energy':0, 'sleeping':True,
                                 'condition':'normal', 'mood':'sleepy' if action=='rest' else 'irritated',
                                 'reply':start+' '+end, 'authorship':'agent-authored-own-v1'})
    for condition in ('cold','unwell'):
        for start in drafts[condition]['starts']:
            for end in drafts[condition]['ends']:
                for affection in (10,45,80):
                    rows.append({'id':f'own-condition-{len(rows)}','characterId':'gomi','action':'touch',
                                 'affection':affection,'energy':1,'sleeping':False,'condition':condition,
                                 'reply':start+' '+end,'authorship':'agent-authored-own-v1'})
    extra_sources = {}
    if extra:
        for line in extra.read_text(encoding='utf-8-sig').splitlines():
            row=json.loads(line)
            if row.get('characterId') not in characters or not re.fullmatch(r'[a-z][a-z0-9-]{0,47}',row.get('action','')) or not isinstance(row.get('reply'),str) or not 4<=len(row['reply'])<=50:
                raise ValueError('Extra training row needs a registered character, action ID and a 4–50 character reply')
            rows.append({'affection':45,'mood':'calm','energy':3,'sleeping':False,'condition':'normal',
                         'authorship':'user-added-own-training',**row})
        extra_sources[str(extra)]={'sha256':sha(extra)}
    # Original replies remain byte-preserved in the source. This model only
    # learns spoken words; annotations, role prompts and old model output are absent.
    dump(HERE/'corpus.json', {'rows':rows, 'excluded':excluded,
         'sources':{'gomiActionsV3':{'path':str(source.relative_to(ROOT)), 'sha256':sha(source)},
                    'newDrafts':{'path':'local-ai/own/action-drafts.json','sha256':sha(HERE/'action-drafts.json')},
                    'extraTraining':extra_sources},
         'pretrainedParents':[], 'teacherModel':None,
         'dataAuthorship':'User-original verbatim rows and explicitly labeled AI coding-assistant drafts; not all human-authored or human-approved.'})
    return rows


def quantized(tensor):
    data = tensor.astype(np.float32)
    rows = data.reshape(data.shape[0], -1)
    scales = np.maximum(np.max(np.abs(rows), axis=1)/127, 1e-9).astype('<f4')
    q = np.rint(rows/scales[:,None]).clip(-127,127).astype(np.int8)
    return {'shape':list(data.shape), 'values':base64.b64encode(q.tobytes()).decode(),
            'scales':base64.b64encode(scales.tobytes()).decode()}


def train(args):
    rng = random.Random(args.seed)
    rows = corpus(args.extra)
    vocab = ['<bos>','<eos>','<pad>','<unk>'] + sorted({t for r in rows for t in TOKEN.findall(r['reply'])})
    feature_names = sorted({f for r in rows for f in features(r)})
    tok = {t:i for i,t in enumerate(vocab)}
    next_tokens=[set() for _ in vocab]
    for row in rows:
        words=[0]+[tok[token] for token in TOKEN.findall(row['reply'])]+[1]
        for before,after in zip(words,words[1:]):next_tokens[before].add(after)
    fmap = {f:i for i,f in enumerate(feature_names)}
    xs, fs, ys = [], [], []
    rng.shuffle(rows)
    for r in rows:
        words = TOKEN.findall(r['reply'])
        history = [0]*4
        for word in words+['<eos>']:
            xs.append(history[:]);fs.append([fmap[f] for f in features(r)]);ys.append(tok[word])
            history = (history+[tok[word]])[-4:]
    device = 'cpu-numpy-matrix-arithmetic'
    x=np.asarray(xs,dtype=np.int32);f=np.asarray(fs,dtype=np.int32);y=np.asarray(ys,dtype=np.int32)
    model=OwnWordNet(len(vocab),len(fmap),seed=args.seed)
    order_rng=np.random.default_rng(args.seed)
    started = time.perf_counter()
    loss_value = None
    for epoch in range(args.epochs):
        order=order_rng.permutation(len(y))
        losses = []
        learning_rate=args.lr*(0.1+0.9*(1-epoch/args.epochs))
        for start in range(0,len(y),512):
            indices=order[start:start+512]
            loss,gradients=model.loss_and_gradients(x[indices],f[indices],y[indices])
            if not np.isfinite(loss):raise ValueError('Own-network training loss became non-finite')
            model.step(gradients,learning_rate);losses.append(loss)
        loss_value = sum(losses)/len(losses)
        if epoch == 0 or (epoch+1)%25 == 0 or epoch+1 == args.epochs:
            print(json.dumps({'epoch':epoch+1,'loss':round(loss_value,5),'seconds':round(time.perf_counter()-started,1)}),flush=True)
    artifact = {
        'format':'gomgomi-own-wordnet-v1', 'context':4, 'embedding':24, 'hidden':112,
        'vocab':vocab, 'features':feature_names,
        'nextTokens':[sorted(values) for values in next_tokens],
        'characters':sorted({r['characterId'] for r in rows}),
        'actions':sorted({r['action'] for r in rows}),
        'weights':{name:quantized(value) for name,value in model.params.items()},
        'provenance':{'initialization':'random','pretrainedParents':[],'teacherModel':None,
            'architecture':'own conditional feed-forward word neural network',
            'trainingTool':'first-party forward/backprop/AdamW; NumPy matrix arithmetic on PC only',
            'dataAuthorshipCounts':dict(Counter(r.get('authorship','unknown') for r in rows)),
            'syntheticDraftAuthor':'AI coding assistant in this session; not human-approved. No teacher-model API is called by the trainer.',
            'sourceCorpusSha256':sha(HERE/'corpus.json'),'trainerSha256':sha(Path(__file__)),
            'learningAlgorithmSha256':sha(HERE/'neural.py'),
            'seed':args.seed,'epochs':args.epochs,'rows':len(rows),'wordExamples':len(y),
            'parameters':sum(p.size for p in model.params.values()),'trainingSeconds':round(time.perf_counter()-started,3),
            'trainingLoss':loss_value, 'commercialLegalClearance':False},
    }
    destination = ROOT/'src/features/characters/ownAi/model.json'
    dump(destination,artifact)
    np.savez(HERE/'checkpoint.npz',**model.params)
    dump(HERE/'training-result.json',{'model':str(destination.relative_to(ROOT)),'bytes':destination.stat().st_size,
         'sha256':sha(destination),'device':device,'provenance':artifact['provenance']})
    print(json.dumps({'finished':True,'bytes':destination.stat().st_size,'parameters':artifact['provenance']['parameters'],
                      'rows':len(rows),'sha256':sha(destination)}),flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--epochs',type=int,default=180)
    parser.add_argument('--lr',type=float,default=0.006)
    parser.add_argument('--seed',type=int,default=20261115)
    parser.add_argument('--extra',type=Path,help='Optional user-authored JSONL with new actions/character examples')
    train(parser.parse_args())
