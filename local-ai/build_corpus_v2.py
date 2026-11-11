"""Freeze reviewed action drafts and a traced subset of original user examples."""
from collections import Counter
import json
from pathlib import Path
from core import HERE, ROOT, read_json, write_json, sha256, check_rows, registries, messages_for, normalized


def main():
    out = HERE / 'data/gomi-actions-v2'
    out.mkdir(parents=True, exist_ok=False)
    bank = read_json(HERE / 'action-replies-v2.json')
    sleep = read_json(HERE / 'sleep-replies-v2.json')
    values = [[5,15,18,2,9,13,17,1], [20,21,24,25,26,27,28,29],
              [30,33,36,39,42,45,51,57], [60,62,64,66,68,70,74,76], [90,91,92,93,94,95,99,100]]
    scenes = {
        'touch': ['집사가 가볍게 고미를 불렀다.', '집사가 옆에 와서 눈을 맞춘다.', '집사가 손끝으로 살짝 인사했다.', '집사가 관심을 보이며 대답을 기다린다.'],
        'walk': ['집사가 나갈 준비를 천천히 한다.', '집사가 산책을 제안하고 가만히 있다.', '집사가 아직 출발하지 않는다.', '집사가 함께 갈 길을 정하려고 한다.'],
        'treat': ['집사가 간식을 손에 들고 있다.', '집사 손에 있는 간식이 조금 멀다.', '집사가 간식을 건네려 한다.', '집사가 한 입 크기로 준비한다.'],
        'pet': ['집사가 머리를 천천히 쓰다듬는다.', '집사가 손을 잠시 멈춘다.', '집사가 고미 쪽으로 손을 내민다.', '집사가 귀를 건드리지 않고 쓰다듬는다.'],
        'play': ['집사가 규칙을 간단히 설명한다.', '집사가 놀이를 제안했다.', '집사가 첫 차례를 고미에게 준다.', '집사가 함께 놀 준비를 한다.'],
        'rest': ['집사가 조용히 옆에 앉는다.', '집사가 편한 자리를 나눠주려 한다.', '집사가 곁에서 가만히 쉰다.', '집사가 고미가 기댈 공간을 비운다.'],
    }
    train = []
    for action, tiers in bank['replies'].items():
        for tier, replies in enumerate(tiers):
            for index, reply in enumerate(replies):
                row = dict(id=f'v2-{action}-{tier}-{index}', group=f'v2-main-{action}-{tier}',
                    characterId='gomi', action=action, affection=values[tier][index], energy=3,
                    mood=({'walk':'curious','treat':'delighted','play':'playful','rest':'sleepy'}.get(action,'calm') if index%2 else 'calm'),
                    reply=reply, source=bank['source'], reference='docs/gomi-personality-2026-10-31.md')
                if index % 2:
                    row['scene'] = scenes[action][index//2]
                train.append(row)
    for kind in ['quiet', 'disturbed']:
        for tier, replies in enumerate(sleep[kind]):
            for index, reply in enumerate(replies):
                action = 'rest' if kind == 'quiet' else (['touch','pet','walk','treat','play'][index % 5])
                if kind == 'disturbed' and index == 4:
                    action = 'play'
                train.append(dict(id=f'v2-sleep-{kind}-{tier}-{index}', group=f'v2-sleep-{kind}-{tier}',
                    characterId='gomi', action=action, affection=values[tier][index], energy=1,
                    sleeping=True, mood='sleepy' if kind=='quiet' else 'irritated',
                    reply=reply, source=bank['source'], reference='sleep-state-consistency'))
    source = ROOT / 'models/gomi-lora-v4/data/train.jsonl'
    legacy = [json.loads(line) for line in source.read_text(encoding='utf-8').splitlines()]
    audit = []
    for row in legacy:
        keep = row['kind'] in ['user-dialogue-240','user-dialogue-120'] and int(row['id'].rsplit('-',1)[1]) % 4 == 0
        reason = 'sparse-preserved-user-persona-auxiliary' if keep else 'reference-only-not-action-supervision'
        if row['kind'] == 'interaction':
            reason = 'old-agent-draft-inconsistent-action-priority-and-sparse-state-coverage'
        audit.append(dict(id=row['id'], source=row['source'], decision='retain-exact-reply' if keep else 'exclude-from-v2-training', reason=reason))
        if not keep:
            continue
        section = row['section']
        if row['kind'] == 'user-dialogue-120':
            context = {1:'고미가 춥거나 컨디션이 좋지 않은 장면이다.',2:'집사가 고미를 두고 외출하려는 장면이다.',3:'집사가 긴 외출 뒤 돌아온 장면이다.',4:'고미가 집사 베개의 편한 자리를 원하는 장면이다.'}[section]
        else:
            context = {1:'산책 준비나 산책 중 명시된 장면이다.',2:'밥 먹기나 입 닦기 또는 양치에 관한 명시된 장면이다.',3:'집 안에서 편의를 요구하는 장면이다.',4:'손님이 온 장면이다. 고미는 대체로 귀찮아서 자리를 피한다.',5:'명시된 허세나 삐짐 장면이다. 싸움을 원한다고 해석하지 않는다.',6:'집사에게 애착을 보이는 장면이다.'}[section]
        train.append(dict(id='v2-preserved-'+row['id'],group='v2-preserved-'+row['id'],characterId='gomi',
            action='scene',affection=75,mood='calm',scene=context+' '+row['situation'],
            reply=row['reply'],source=row['source'],originalId=row['id'],originalReplySha256=__import__('hashlib').sha256(row['reply'].encode()).hexdigest()))
    validation = [dict(row,id=f'v2-validation-{index}',group=f'v2-validation-{index}',characterId='gomi',source='agent-authored-heldout-validation-v2')
                  for index,row in enumerate(read_json(HERE/'curated-validation-v2.json'))]
    test = [dict(row,characterId='gomi',source='agent-authored-untrained-test-scenarios-v2')
            for row in read_json(HERE/'curated-test-v2.json')]
    chars, actions = registries()
    check_rows(train,validation,chars,actions)
    seen = {normalized(messages_for(row,chars,actions)[1]['content']) for row in train+validation}
    if any(normalized(messages_for(row,chars,actions)[1]['content']) in seen for row in test):
        raise ValueError('test input overlaps train/validation')
    for split, rows in [('train',train),('validation',validation)]:
        (out/(split+'.jsonl')).write_text(''.join(json.dumps(row,ensure_ascii=False)+'\n' for row in rows),encoding='utf-8')
    write_json(out/'test.json',test)
    write_json(out/'source-audit.json',{'originalTrainSha256':sha256(source),
        'originalValidationSha256':sha256(ROOT/'models/gomi-lora-v4/data/validation.jsonl'),
        'sourceRule': 'Every fourth numbered original user example retained verbatim with explicit section context. All 96 old agent interaction drafts and 9 reference rows stay frozen as reference only.',
        'decisions':audit})
    write_json(out/'manifest.json',dict(trainRows=len(train),validationRows=len(validation),testRows=len(test),
        sources=dict(Counter(row['source'] for row in train)),userApproved=False,qualityApproved=False,
        interpretation='Known-action scenario holdout, not unseen-topic or independent user evaluation.',
        files={p.name:sha256(p) for p in out.iterdir() if p.is_file()}))
    print(dict(output=str(out),train=len(train),validation=len(validation),test=len(test)))


if __name__ == '__main__':
    main()
