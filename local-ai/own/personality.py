"""PC personality profiles and the supervision weights they give dialogue examples."""

import json
import math
import re

TRAITS = {'kindness': '친절함', 'aloofness': '무심함', 'care': '세심함',
          'playfulness': '장난기', 'curiosity': '호기심'}
# Only explicit expressions provide weak style hints for older, untagged examples.
CUES = {'kindness': ('고마', '다정', '괜찮', '도와', '고맙', '고맙소', '함께'),
        'aloofness': ('귀찮', '됐어', '나중에', '내버려', '관심 없', '흥', '혼자'),
        'care': ('조심', '살살', '살펴', '챙', '천천히', '다치', '발밑'),
        'playfulness': ('장난', '헤헤', '킥킥', '놀자', '신난', '히히'),
        'curiosity': ('궁금', '어떻게', '어디', '뭐야', '무엇', '왜', '?')}
DEFAULT_TRAITS = dict.fromkeys(TRAITS, 5)


# Common explicit descriptions in Korean reference sheets. Preserve the author's
# text even when no trait can be inferred. Explicit numbers always win.
DESCRIPTORS = {'kindness': r'친절|다정|상냥', 'aloofness': r'무심|무뚝뚝|덤덤',
               'care': r'세심|꼼꼼|사려 깊|배려', 'playfulness': r'장난기|장난꾸러기|짓궂',
               'curiosity': r'호기심|궁금한 게 많'}


def suggested_traits(description):
    suggestions = {}
    for key, pattern in DESCRIPTORS.items():
        levels = set()
        for match in re.finditer(pattern, description):
            tail = description[match.end():]
            low = re.match(r'(?:(?:하|함|이|가|은|는|도|를|을|하지|하지는)\s*){0,3}(?:않|없|낮|약|적)', tail)
            strongly = re.search(r'(?:아주|매우|무척)\s*$', description[:match.start()])
            levels.add(2 if low else 9 if strongly else 8)
        if len(levels) == 1:
            suggestions[key] = levels.pop()
    return suggestions


def validate_profile(profile):
    if not isinstance(profile, dict):
        raise ValueError('성격 자료 형식을 확인해 주세요.')
    description = profile.get('description', '')
    if not isinstance(description, str) or len(description) > 12000 or '\x00' in description:
        raise ValueError('성격 설명은 12,000자까지 입력할 수 있어요.')
    traits = profile.get('traits', {})
    if not isinstance(traits, dict):
        raise ValueError('성격 수치는 항목별로 입력해 주세요.')
    result = DEFAULT_TRAITS.copy()
    aliases = {label: key for key, label in TRAITS.items()}
    for key, value in traits.items():
        key = aliases.get(key, key)
        if key not in TRAITS or type(value) is not int or not 1 <= value <= 10:
            raise ValueError('성격 항목과 1~10 사이의 정수를 확인해 주세요.')
        result[key] = value
    profile_data = {'description': description.strip(), 'traits': result}
    attachment = profile.get('attachment')
    if attachment is not None:
        if not isinstance(attachment, dict):
            raise ValueError('성격 첨부파일을 다시 선택해 주세요.')
        name, content = attachment.get('filename'), attachment.get('content')
        if (not isinstance(name, str) or not name.lower().endswith(('.txt', '.md', '.json')) or len(name) > 255
                or any(c in name for c in ('/', chr(92), chr(0))) or not isinstance(content, str)
                or len(content.encode()) > 128 * 1024):
            raise ValueError('128KB 이하의 UTF-8 성격 파일을 선택해 주세요.')
        profile_data['attachment'] = {'filename': name, 'content': content}
    return profile_data


def import_profile(filename, content, current):
    if not isinstance(filename, str) or not isinstance(content, str) or len(content.encode()) > 128 * 1024:
        raise ValueError('128KB 이하의 UTF-8 TXT, MD 또는 JSON 파일을 선택해 주세요.')
    content = content.lstrip('\ufeff').strip()
    if not content:
        raise ValueError('파일에 성격 설명이나 성격 수치를 입력해 주세요.')
    current = validate_profile(current)
    if filename.lower().endswith('.json'):
        try:
            data = json.loads(content)
        except ValueError as error:
            raise ValueError('성격 파일의 JSON 형식을 확인해 주세요.') from error
        if not isinstance(data, dict) or not {'traits', 'description'}.intersection(data):
            raise ValueError('JSON 파일에는 description 또는 traits 항목이 필요해요.')
        traits = data.get('traits', {})
        if not isinstance(traits, dict):
            raise ValueError('traits에 성격 항목과 수치를 넣어 주세요.')
        description = data.get('description', current['description'])
        hints = suggested_traits(description) if isinstance(data.get('description'), str) else {}
        return validate_profile({'description': description, 'traits': {**current['traits'], **hints, **traits}})
    if not filename.lower().endswith(('.txt', '.md')):
        raise ValueError('UTF-8 TXT, MD 또는 JSON 파일을 선택해 주세요.')
    lines = []
    numbers = {}
    for line in content.splitlines():
        match = re.fullmatch(r'\s*(?:[-*]\s+)?(친절함|무심함|세심함|장난기|호기심)\s*[:=：]\s*(.*?)\s*', line)
        if match:
            label, value = match.groups()
            if not re.fullmatch(r'10|[1-9]', value):
                raise ValueError(f'{label}은 1~10 사이의 정수로 입력해 주세요.')
            key = next(key for key in TRAITS if TRAITS[key] == label)
            numbers[key] = int(value)
        else:
            lines.append(line)
    if any(line.strip() for line in lines):
        current['description'] = '\n'.join(lines)
        current['traits'].update(suggested_traits(current['description']))
    current['traits'].update(numbers)
    return validate_profile(current)


def example_weight(row, profiles):
    profile = profiles.get(row['characterId'])
    if not profile:
        return 1.
    tag = row.get('styleTrait')
    traits = [tag] if tag else [key for key, cues in CUES.items() if any(cue in row['reply'] for cue in cues)]
    if not traits:
        return 1.
    emphasis = sum(profile['traits'][key] - 5 for key in traits) / len(traits)
    return math.pow(2, emphasis / 2.5)
