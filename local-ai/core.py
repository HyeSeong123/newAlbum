"""Data contracts for character-conditioned, extensible action responses."""
import hashlib
import json
import math
from pathlib import Path
import re
import unicodedata

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


def sha256(path):
    with Path(path).open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def registries():
    return read_json(HERE / 'characters.json'), read_json(HERE / 'actions.json')


def finite_state(value, low, high):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f'state must be a finite number in [{low}, {high}]')
    return value


def messages_for(row, characters, actions):
    contract = read_json(HERE / 'prompt-contract.json')
    character = characters.get(row.get('characterId'))
    action = actions.get(row.get('action'))
    if not character or not action:
        raise ValueError('unregistered character or action')
    affection = finite_state(row.get('affection', 45), 0, 100)
    energy = finite_state(row.get('energy', 3), 0, 5)
    mood = str(row.get('mood', 'calm'))
    if mood not in ['calm', 'curious', 'delighted', 'playful', 'sleepy', 'irritated']:
        raise ValueError('unregistered mood')
    if not isinstance(row.get('sleeping', False), bool):
        raise ValueError('sleeping must be boolean')
    scene = str(row.get('scene', '')).strip()
    previous = row.get('previous', [])
    if not isinstance(previous, list) or not all(isinstance(item, str) for item in previous):
        raise ValueError('previous must be a list of replies')
    system = contract['system'].format(name=character['name'], persona=character['persona'])
    relation = next(label for threshold,label in contract['relations'] if affection >= threshold)
    mood_label = contract['moods'][mood]
    description = action.get('characterDescriptions', {}).get(row['characterId'], action['description'])
    user = contract['state'].format(action=row['action'], label=action['label'], description=description,
        relation=relation, affection=affection, mood=mood_label, energy=energy,
        sleep=contract['asleep'] if row.get('sleeping') else contract['awake'])
    if row.get('sleeping') and mood == 'irritated':
        user += contract['disturbedNote']
    intent = action.get('characterIntents', {}).get(row['characterId'])
    goals = action.get('characterGoals', {}).get(row['characterId'], {})
    band = 'close' if affection >= 60 else 'familiar' if affection >= 30 else 'distant'
    intent = goals.get(mood, goals.get(band, goals.get('default',intent)))
    if row.get('sleeping'):
        sleep_kind = 'irritated' if mood == 'irritated' else 'rest' if row['action'] == 'rest' else 'other'
        intent = contract['sleepGoals'][sleep_kind].format(name=character['name'])
    if intent:
        user += contract['directionPrefix'] + intent
    if scene:
        user += contract['scenePrefix'] + scene
    if previous:
        user += contract['previousPrefix'] + ' / '.join(previous[-3:])
    if row.get('repair'):
        user += read_json(HERE/'reaction-policy.json')['repairPrefix'] + str(row['repair'])
    user += contract['closing']
    return [{'role': 'system', 'content': system}, {'role': 'user', 'content': user}]


def reaction_issue(row, line):
    if row.get('characterId') != 'gomi':
        return None
    for rule in read_json(HERE/'reaction-policy.json')['rules']:
        if rule.get('actions') and row.get('action') not in rule['actions']:
            continue
        if rule.get('whenSleeping') and not row.get('sleeping'):
            continue
        if re.search(rule['pattern'],line) and not (rule.get('unlessPattern') and re.search(rule['unlessPattern'],line)):
            return {'id':rule['id'],'reason':rule['reason']}
    return None


def convert_legacy(row):
    # Never reinterpret a 4B token stream as the new model's chat template.
    out = {key: value for key, value in row.items() if key != 'prompt'}
    out['characterId'] = 'gomi'
    if row.get('kind') == 'interaction':
        match = re.fullmatch(r'(touch|walk|treat|pet|play|rest|sleepy|irritated)-([0-4])', row['group'])
        if not match:
            raise ValueError(f"unsupported legacy interaction group: {row['group']}")
        event, tier = match.groups()
        out.update(action=event if event not in ['sleepy', 'irritated'] else 'touch',
                   affection=[10, 25, 45, 75, 95][int(tier)],
                   mood=event if event in ['sleepy', 'irritated'] else 'calm',
                   sleeping=event in ['sleepy', 'irritated'])
    else:
        match = re.search(r'<\|im_start\|>user\n(.*?)<\|im_end\|>', row['prompt'], flags=re.S)
        if not match:
            raise ValueError('legacy scene is missing its user turn')
        affection = re.search(r'친밀도:\s*(\d+)', row['prompt'])
        out.update(action='scene', scene=match.group(1).strip(),
                   affection=int(affection.group(1)) if affection else 45)
    return out


def normalized(text):
    return ' '.join(unicodedata.normalize('NFKC', text).casefold().split())


def training_evidence(previous_changed, current_changed):
    names = sorted(set(previous_changed) | set(current_changed))
    if not names:
        raise RuntimeError('No adapter weights changed')
    return names


def select_adapter(epoch_validation, starting_adapter=None):
    """Keep a verified starting adapter when continued training does not improve it."""
    candidates = ([starting_adapter] if starting_adapter is not None else []) + list(epoch_validation)
    return select_epoch(candidates)


def check_rows(train, validation, characters, actions):
    if not train or not validation:
        raise ValueError('training and validation must both be nonempty')
    all_ids = set()
    seen = []
    for rows in [train, validation]:
        keys = {'group': set(), 'prompt': set(), 'reply': set()}
        for row in rows:
            for field in ['id', 'group', 'source', 'reply']:
                if not isinstance(row.get(field), str) or not row[field].strip():
                    raise ValueError('missing field: ' + field)
            if row['id'] in all_ids:
                raise ValueError('duplicate example id')
            all_ids.add(row['id'])
            if not 1 <= len(row['reply']) <= 70:
                raise ValueError('training reply must contain 1..70 characters')
            prompt = messages_for(row, characters, actions)[1]['content']
            for key, value in [('group', row['group']), ('prompt', prompt), ('reply', row['reply'])]:
                keys[key].add((row['characterId'], normalized(value)))
        seen.append(keys)
    for field in seen[0]:
        if seen[0][field] & seen[1][field]:
            raise ValueError('split overlap: ' + field)


def load_corpus(character_id=None, extra=None, corpus=None):
    characters, actions = registries()
    if character_id is not None and character_id not in characters:
        raise ValueError('unregistered character')
    splits = []
    for split in ['train', 'validation']:
        source = Path(corpus) / f'{split}.jsonl' if corpus else ROOT / f'models/gomi-lora-v4/data/{split}.jsonl'
        raw = [json.loads(line) for line in source.read_text(encoding='utf-8-sig').splitlines() if line.strip()]
        rows = raw if corpus else [convert_legacy(row) for row in raw]
        if extra:
            for line in Path(extra).read_text(encoding='utf-8-sig').splitlines():
                if not line.strip():
                    continue
                row = json.loads(line)
                if row.get('split') not in ['train', 'validation']:
                    raise ValueError('extra row must specify split: train or validation')
                if row['split'] == split:
                    rows.append(row)
        if character_id:
            rows = [row for row in rows if row['characterId'] == character_id]
        splits.append(rows)
    check_rows(*splits, characters, actions)
    return *splits, characters, actions


def select_epoch(rows):
    if not rows or any(not math.isfinite(row['loss']) for row in rows):
        raise ValueError('finite nonempty validation results required')
    return min(rows, key=lambda row: row['loss'])


def valid_reply(line, previous):
    if not isinstance(line, str) or not line.strip() or len(line) > 50 or '\n' in line or '<' in line or '>' in line:
        return False
    if not re.search(r'[가-힣]', line):
        return False
    if normalized(line) in {normalized(value) for value in previous}:
        return False
    if re.search(r'(.{2,}?)\s*\1\s*\1', line):
        return False
    return True
