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
GOMI_TIERS = [('distant',10),('reserved',25),('familiar',45),('close',75),('bonded',95)]


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary=path.with_name(path.name+'.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')
    temporary.replace(path)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def tier(row):
    affection = row.get('affection', 45)
    if row['characterId']=='gomi':
        return 'bonded' if affection>=90 else 'close' if affection>=60 else 'familiar' if affection>=30 else 'reserved' if affection>=20 else 'distant'
    return 'close' if affection>=60 else 'familiar' if affection>=30 else 'distant'


def energy(row):
    value=row.get('energy',3)
    return 'exhausted' if value<=0 else 'low' if row.get('sleeping') or value<=1 else 'normal'


def scene(row):
    return '|'.join([row['characterId'],row['action'],tier(row),'asleep' if row.get('sleeping') else 'awake',row.get('condition','normal'),energy(row)])


def features(row):
    state='asleep' if row.get('sleeping') else 'awake'
    condition=row.get('condition','normal')
    return ['character:'+row['characterId'], 'action:'+row['action'], 'tier:'+tier(row),
            'state:'+state, 'condition:'+condition,
            'mood:'+row.get('mood','calm'), 'energy:'+energy(row),
            'scenario:'+row['action']+'/'+state+'/'+condition+'/'+energy(row)]


def words(row):
    text=re.sub(r'([.!?])\1+',r'\1',row['reply'].strip())
    return TOKEN.findall(text)


def natural_gomi_rows(filename='gomi-natural-drafts.json',authorship='agent-authored-natural-v3'):
    drafts=read(HERE/filename)
    rows=[]
    for item in drafts['scenarios']:
        for name,affection in GOMI_TIERS:
            if name not in item.get('tiers',[name]):continue
            replies=item.get('byTier',{}).get(name,item.get('default',[]))
            for value in item['energies']:
                for index,reply in enumerate(replies):
                    if not 4<=len(reply)<=50 or len(re.findall(r'[.!?]',reply))>2:
                        raise ValueError('Natural training draft must be a coherent 4–50 character, at most two sentence utterance: '+reply)
                    row={'id':f'natural-{len(rows)}','characterId':'gomi','action':item['action'],
                         'affection':affection,'energy':value,'sleeping':item['sleeping'],
                         'condition':item.get('condition','normal'),'meaning':item['meaning'],
                         'reply':reply,'authorship':authorship,
                         'source':'local-ai/own/'+filename}
                    row['mood']='sleepy' if item['sleeping'] else {'walk':'curious','treat':'delighted','meal':'delighted','play':'playful','rest':'sleepy'}.get(item['action'],'calm')
                    rows.append(row)
    repeats=drafts.get('repeat',1)
    if not isinstance(repeats,int) or not 1<=repeats<=4:raise ValueError('Draft weight must be 1–4')
    return [{**row,'id':f'{Path(filename).stem}-{index}-{repeat}'} for repeat in range(repeats) for index,row in enumerate(rows)]


def spoken_rows(rows):
    """Silence is an action policy, never a hostile or blank spoken target.

    Preserve the user's explicit cold/unwell comfort exceptions and all other
    characters. The original source rows remain unchanged on disk.
    """
    spoken,quiet=[],[]
    for row in rows:
        silent=row['characterId']=='gomi' and row.get('affection',45)<60 and row.get('condition','normal')=='normal'
        (quiet if silent else spoken).append(row)
    return spoken,quiet


def corpus(extra=None):
    source = ROOT/'local-ai/data/gomi-actions-v3/train.jsonl'
    original = [json.loads(line) for line in source.read_text(encoding='utf-8-sig').splitlines()]
    rows, excluded = [], []
    for row in original:
        if row.get('authorship')=='user-original-verbatim' and row.get('condition') in ('cold', 'unwell'):
            rows.append({**row, 'action':'touch','meaning':'ask-for-warmth' if row['condition']=='cold' else 'ask-for-comfort'})
        else:
            excluded.append({'id':row['id'], 'reason':'previous home drafts replaced by coherent scene/intent drafts' if row['action'] in ACTIONS else 'free-form scene lacks an unambiguous structured action; original preserved'})
    rows.extend(natural_gomi_rows())
    rows.extend(natural_gomi_rows('gomi-bonded-refinement.json','agent-authored-bonded-refinement-v1'))
    drafts = read(HERE/'action-drafts.json')
    characters = read(ROOT/'local-ai/characters.json')
    rng = random.Random(20261115)
    for cid in characters:
        if cid=='gomi':continue
        profile = drafts['profiles'].get(cid, drafts['profiles']['default'])
        for action in ACTIONS:
            for tier, affection in [('distant',10), ('familiar',45), ('close',80)]:
                parts = {'starts':profile['starts'], 'ends':drafts['others'][action]}
                for pi, opening in enumerate(parts['starts']):
                    for ei, ending in enumerate(parts['ends']):
                        # Leave composition gaps: never train on every possible
                        # combination of the authored clauses.
                        if (pi+ei)%4 == 0:
                            continue
                        reply = (opening+' '+ending).strip()
                        if len(reply)>50:
                            continue
                        for value in (0,1,3):
                            rows.append({'id':f'own-draft-{len(rows)}', 'characterId':cid, 'action':action,
                                         'affection':affection, 'energy':value, 'sleeping':False, 'mood':rng.choice(MOODS[:4]),
                                         'condition':'normal', 'reply':reply,'meaning':'plant-'+action, 'authorship':'agent-authored-own-v1',
                                         'source':'local-ai/own/action-drafts.json'})
        for action in ACTIONS:
            parts = drafts['sleepQuiet'] if action == 'rest' else drafts['sleepDisturbed']
            for start in parts['starts']:
                for end in parts['ends']:
                    for affection in (10,45,80):
                        for value in (0,1):
                            rows.append({'id':f'own-sleep-{len(rows)}', 'characterId':cid, 'action':action,
                                         'affection':affection, 'energy':value, 'sleeping':True,
                                         'condition':'normal', 'mood':'sleepy' if action=='rest' else 'irritated',
                                         'reply':start+' '+end,'meaning':'quiet-sleep' if action=='rest' else 'keep-sleeping', 'authorship':'agent-authored-own-v1'})
    extra_sources = {}
    extra_paths=[HERE/'user-examples.jsonl']
    if extra and extra.resolve()!=extra_paths[0].resolve():extra_paths.append(extra)
    for extra in extra_paths:
        if not extra.exists():continue
        for line in extra.read_text(encoding='utf-8-sig').splitlines():
            if not line.strip():continue
            row=json.loads(line)
            if (row.get('characterId') not in characters or not re.fullmatch(r'[a-z][a-z0-9-]{0,47}',row.get('action',''))
                or not isinstance(row.get('reply'),str) or not 4<=len(row['reply'])<=50
                or row.get('mood','calm') not in MOODS or row.get('condition','normal') not in ('normal','cold','unwell')
                or not isinstance(row.get('sleeping',False),bool)
                or not isinstance(row.get('energy',3),int) or not 0<=row.get('energy',3)<=5
                or not isinstance(row.get('affection',45),(int,float)) or not 0<=row.get('affection',45)<=100
                or not re.fullmatch(r'[a-z][a-z0-9-]{0,63}',row.get('meaning','user-added'))
                or len(re.findall(r'[.!?]',row['reply']))>2 or re.search(r'[<>{}\[\]]',row['reply'])):
                raise ValueError('Extra training row needs a registered character, action ID and a 4–50 character reply')
            rows.append({'affection':45,'mood':'calm','energy':3,'sleeping':False,'condition':'normal',
                         'meaning':'user-added',**row,'authorship':'user-added-own-training'})
        extra_sources[str(extra)]={'sha256':sha(extra)}
    rows,quiet=spoken_rows(rows)
    excluded.extend({'id':row['id'],'reason':'latest user policy: normal Gomi below 60 is nonverbal; not a spoken learning target'} for row in quiet)
    # Original replies remain byte-preserved in the source. This model only
    # learns spoken words; annotations, role prompts and old model output are absent.
    dump(HERE/'corpus.json', {'rows':rows, 'excluded':excluded,
         'sources':{'gomiActionsV3':{'path':str(source.relative_to(ROOT)), 'sha256':sha(source)},
                    'newDrafts':{'path':'local-ai/own/action-drafts.json','sha256':sha(HERE/'action-drafts.json')},
                    'naturalGomiDrafts':{'path':'local-ai/own/gomi-natural-drafts.json','sha256':sha(HERE/'gomi-natural-drafts.json')},
                    'bondedRefinement':{'path':'local-ai/own/gomi-bonded-refinement.json','sha256':sha(HERE/'gomi-bonded-refinement.json')},
                    'extraTraining':extra_sources},
         'pretrainedParents':[], 'teacherModel':None,
         'dataAuthorship':'User-original verbatim rows and explicitly labeled AI coding-assistant drafts; not all human-authored or human-approved.'})
    return rows


def training_examples(rows,tok,fmap):
    xs,fs,ys=[],[],[]
    for row in rows:
        history=[0]*4
        for target in [tok[word] for word in words(row)]+[1]:
            xs.append(history[:]);fs.append([fmap[name] for name in features(row)]);ys.append(target)
            history=(history+[target])[-4:]
    return np.asarray(xs,np.int32),np.asarray(fs,np.int32),np.asarray(ys,np.int32)


def learned_support(rows,tok):
    grouped={}
    for row in rows:
        table=grouped.setdefault((scene(row),row.get('meaning','action')), {})
        sequence=[0,0]+[tok[word] for word in words(row)]+[1]
        for a,b,c in zip(sequence,sequence[1:],sequence[2:]):table.setdefault((a,b),set()).add(c)
    grammars=[];intern={};scenes={}
    for (key,_),table in sorted(grouped.items()):
        packed=tuple((a,b,tuple(sorted(values))) for (a,b),values in sorted(table.items()))
        if packed not in intern:intern[packed]=len(grammars);grammars.append(packed)
        scenes.setdefault(key,[]).append(intern[packed])
    return grammars,{key:sorted(set(values)) for key,values in scenes.items()}


def quantized(tensor):
    data = tensor.astype(np.float32)
    rows = data.reshape(data.shape[0], -1)
    scales = np.maximum(np.max(np.abs(rows), axis=1)/127, 1e-9).astype('<f4')
    q = np.rint(rows/scales[:,None]).clip(-127,127).astype(np.int8)
    return {'shape':list(data.shape), 'values':base64.b64encode(q.tobytes()).decode(),
            'scales':base64.b64encode(scales.tobytes()).decode()}


def dorongi_rows(path):
    drafts=read(path)
    for action, group in drafts['actions'].items():
        for name, affection in [('distant',10), ('familiar',45), ('close',80)]:
            for pi, opening in enumerate(group[name]):
                for ei, ending in enumerate(group['end']):
                    if (pi+ei)%4 == 0:
                        continue
                    reply=f'{opening} {ending}'
                    if not 4<=len(reply)<=50:
                        raise ValueError(f'Dorongi reply exceeds the mobile limit: {reply}')
                    for value in (0,1,3):
                        yield {'characterId':'apple','action':action,'reply':reply,'affection':affection,
                               'energy':value,'authorship':drafts['authorship']}


def train(args):
    rng = random.Random(args.seed)
    source = HERE/('dorongi-drafts.json' if args.dorongi else 'corpus.json')
    rows = list(dorongi_rows(source)) if args.dorongi else corpus(args.extra)
    vocab = ['<bos>','<eos>','<pad>','<unk>'] + sorted({t for r in rows for t in words(r)})
    feature_names = sorted({f for r in rows for f in features(r)}|{'mood:'+m for m in MOODS})
    tok = {t:i for i,t in enumerate(vocab)}
    grammars,scenes=learned_support(rows,tok)
    fmap = {f:i for i,f in enumerate(feature_names)}
    rng.shuffle(rows)
    device = 'cpu-numpy-matrix-arithmetic'
    x,f,y=training_examples(rows,tok,fmap)
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
        'format':'gomgomi-own-wordnet-v3', 'context':4, 'embedding':24, 'hidden':112,
        'vocab':vocab, 'features':feature_names,
        'supportOrder':2,'grammars':grammars,'scenes':scenes,
        'characters':sorted({r['characterId'] for r in rows}),
        'actions':sorted({r['action'] for r in rows}),
        'weights':{name:quantized(value) for name,value in model.params.items()},
        'provenance':{'initialization':'random','pretrainedParents':[],'teacherModel':None,
            'architecture':'own conditional word neural network; full utterance history; learned scene/intent trigram support; three fatigue levels',
            'trainingTool':'first-party forward/backprop/AdamW; NumPy matrix arithmetic on PC only',
            'dataAuthorshipCounts':dict(Counter(r.get('authorship','unknown') for r in rows)),
            'syntheticDraftAuthor':'AI coding assistant in this session; not human-approved. No teacher-model API is called by the trainer.',
            'sourceCorpusSha256':sha(source),'trainerSha256':sha(Path(__file__)),
            'learningAlgorithmSha256':sha(HERE/'neural.py'),
            'seed':args.seed,'epochs':args.epochs,'rows':len(rows),'wordExamples':len(y),
            'speechPolicy':('Dorongi only; awake Home actions' if args.dorongi else
                'normal Gomi below affection 60 is nonverbal before inference; cold/unwell source exceptions preserved'),
            'parameters':sum(p.size for p in model.params.values()),'trainingSeconds':round(time.perf_counter()-started,3),
            'trainingLoss':loss_value, 'commercialLegalClearance':False},
    }
    destination = ROOT/'src/features/characters/ownAi'/('dorongi.json' if args.dorongi else 'model.json')
    if len(json.dumps(artifact,ensure_ascii=False,separators=(',',':')).encode('utf-8'))>2_000_000:
        raise ValueError('Own model and learned support exceed the two-megabyte mobile budget')
    dump(destination,artifact)
    if not args.dorongi:
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
    parser.add_argument('--dorongi',action='store_true',help='Train only Dorongi without altering the existing model or corpus')
    args=parser.parse_args()
    if args.dorongi and args.extra:parser.error('Dorongi uses only the versioned Dorongi draft file')
    if args.epochs<1 or not 0<args.lr<1:parser.error('epochs must be positive and learning rate must be between zero and one')
    train(args)
