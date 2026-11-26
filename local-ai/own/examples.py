"""Validation shared by the PC training screen and the word-model trainer."""

import json
import re

from personality import TRAITS

MOODS = ['calm', 'curious', 'delighted', 'playful', 'sleepy', 'irritated']
CONDITIONS = ['normal', 'cold', 'unwell']
ACTION_ID = re.compile(r'[a-z][a-z0-9-]{0,47}')
MEANING_ID = re.compile(r'[a-z][a-z0-9-]{0,63}')


def normalize_example(row, characters, *, with_reply=True):
    if not isinstance(row, dict):
        raise ValueError('예시 한 건은 JSON 객체여야 합니다.')
    if not isinstance(row.get('characterId'), str) or row['characterId'] not in characters:
        raise ValueError('학습 대상에 포함된 캐릭터를 선택해 주세요.')
    action = row.get('action', '')
    if not isinstance(action, str) or not ACTION_ID.fullmatch(action):
        raise ValueError('새 행동 코드(action)는 영문 소문자로 시작하고 소문자·숫자·하이픈을 최대 48자까지 사용할 수 있습니다.')
    normalized = {'characterId': row['characterId'], 'action': action, 'affection': 45,
                  'mood': 'calm', 'energy': 3, 'sleeping': False, 'condition': 'normal'}
    normalized.update({key: row[key] for key in normalized if key in row})
    if type(normalized['affection']) not in (int, float) or not 0 <= normalized['affection'] <= 100:
        raise ValueError('친한 정도(affection)는 0~100 사이의 숫자로 입력해 주세요.')
    if type(normalized['energy']) is not int or not 0 <= normalized['energy'] <= 5:
        raise ValueError('피곤한 정도(energy)는 0~5 사이의 정수로 입력해 주세요. 0은 몹시 지침, 1은 졸림이에요.')
    if not isinstance(normalized['sleeping'], bool):
        raise ValueError('수면 여부는 true 또는 false여야 합니다.')
    if normalized['mood'] not in MOODS or normalized['condition'] not in CONDITIONS:
        raise ValueError('기분과 몸 상태를 확인해 주세요.')
    if with_reply:
        reply = row.get('reply')
        if (not isinstance(reply, str) or not 4 <= len(reply.strip()) <= 50
                or len(re.findall(r'[.!?]', reply)) > 2 or re.search(r'[<>{}\[\]\r\n]', reply)):
            raise ValueError('대사를 줄바꿈 없이 4~50자, 최대 두 문장으로 입력해 주세요. 꺾쇠와 괄호 기호 < > { } [ ]는 사용할 수 없습니다.')
        meaning = row.get('meaning', 'user-added')
        if not isinstance(meaning, str) or not MEANING_ID.fullmatch(meaning):
            raise ValueError('대사 묶음 이름(meaning)은 영문 소문자로 시작하고 소문자·숫자·하이픈을 최대 64자까지 사용할 수 있습니다.')
        tag = row.get('styleTrait')
        if tag is not None:
            if not isinstance(tag, str) or tag not in TRAITS:
                raise ValueError('대사에서 드러나는 성격을 다시 선택해 주세요.')
            normalized['styleTrait'] = tag
        normalized.update(reply=reply.strip(), meaning=meaning)
    return normalized


def parse_examples(text, characters):
    rows = []
    for line_number, line in enumerate(text.lstrip('\ufeff').splitlines(), 1):
        if not line.strip():
            continue
        try:
            original = json.loads(line)
            rows.append({**original, **normalize_example(original, characters)})
        except json.JSONDecodeError as error:
            raise ValueError(f'{line_number}번째 줄: JSON 형식을 확인해 주세요.') from error
        except ValueError as error:
            raise ValueError(f'{line_number}번째 줄: {error}') from error
    return rows


def is_quiet_gomi(row):
    return (row['characterId'] == 'gomi' and row.get('affection', 45) < 60
            and row.get('condition', 'normal') == 'normal')
