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
    system = (
        f"너는 곰고미의 {character['name']}다. {character['persona']}\n"
        '사용자의 행동에 직접 하는 자연스러운 한국어 반말 한마디, 1~2문장, 50자 이내로 반응한다. '
        '성격과 자기주장을 유지한다. 지문·이모지·역할 설명·생각 과정은 쓰지 않는다. '
        '앱 행동은 가상 교감이다. 현실 사건을 감지하거나 사진·일기·GPS를 읽었다고 주장하지 않는다. '
        '명시된 장면만 참고하고, 주어지지 않은 과거·사건·신체 부위는 만들지 않는다.'
    )
    relation = '아주 친밀한 집사' if affection >= 90 else '가까운 집사' if affection >= 60 else '익숙해지는 사이' if affection >= 30 else '아직 서먹한 사이' if affection >= 20 else '아직 낯선 사이'
    mood_label = {'calm': '차분함', 'curious': '호기심', 'delighted': '기쁨', 'playful': '신남', 'sleepy': '졸림', 'irritated': '짜증'}[mood]
    description = action.get('characterDescriptions', {}).get(row['characterId'], action['description'])
    user = (f"행동: {row['action']} / {action['label']}. {description}\n"
            f"관계: {relation}, 친밀도 {affection}/100. 기분: {mood_label}. 활력: {energy}/5. "
            + ('수면 중.' if row.get('sleeping') else '깨어 있음.'))
    if row.get('sleeping') and mood == 'irritated':
        user += ' 잠을 방해받은 기분을 유지한다.'
    intent = action.get('characterIntents', {}).get(row['characterId'])
    goals = action.get('characterGoals', {}).get(row['characterId'], {})
    band = 'close' if affection >= 60 else 'familiar' if affection >= 30 else 'distant'
    intent = goals.get(mood, goals.get(band, goals.get('default',intent)))
    if row.get('sleeping'):
        intent = (f"잠을 자는 쪽은 너({character['name']})이고 집사는 상대방이다. 너는 집사에게 더 자게 해달라고 요구한다. "
                  '집사를 재우거나 깨우겠다고 하지 않는다. 놀거나 먹으러 가지 않는다.'
                  if mood=='irritated' else
                  (f"잠을 자는 쪽은 너({character['name']})다. 집사는 깨우지 않고 곁에서 쉬고 있다. 너는 편안하게 더 자려 한다. 집사를 깨우거나 없는 방해에 화내지 않는다."
                   if row['action']=='rest' else
                   f"잠을 자는 쪽은 너({character['name']})다. 너는 집사에게 더 자게 해달라고 요구한다. 명시된 장면만 참고하고 집사를 깨우겠다고 하지 않는다."))
    if intent:
        user += '\n반응 방향: ' + intent
    if scene:
        user += '\n제공된 장면: ' + scene
    if previous:
        user += '\n반복하지 않을 최근 말: ' + ' / '.join(previous[-3:])
    user += '\n내가 지금 하는 새로운 짧은 말만.'
    return [{'role': 'system', 'content': system}, {'role': 'user', 'content': user}]


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
