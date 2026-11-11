"""Try action-conditioned new sentences; this is not a conversational API."""
import argparse
import json
from pathlib import Path
import time

from core import HERE, read_json, registries, messages_for
from modeling import load_model, local_base, generate


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--character', default='gomi')
    parser.add_argument('--action', default='pet')
    parser.add_argument('--affection', type=float, default=75)
    parser.add_argument('--mood', default='calm')
    parser.add_argument('--energy', type=float, default=3)
    parser.add_argument('--sleeping', action='store_true')
    parser.add_argument('--scene', default='')
    parser.add_argument('--previous', action='append', default=[])
    parser.add_argument('--run', type=Path)
    parser.add_argument('--base', action='store_true')
    parser.add_argument('--interactive', action='store_true')
    args = parser.parse_args()
    characters, actions = registries()
    row = {'characterId': args.character, 'action': args.action, 'affection': args.affection,
           'mood': args.mood, 'energy': args.energy, 'sleeping': args.sleeping,
           'scene': args.scene, 'previous': args.previous}
    messages_for(row, characters, actions)  # Validate before loading GPU weights.
    adapter = None
    if not args.base:
        latest = HERE / 'runs/latest.json'
        run = args.run or (Path(read_json(latest)['output']) if latest.exists() else None)
        if run:
            report = read_json(run / 'report.json')
            if report['phase'] != 'complete':
                raise ValueError('Run has not completed validation and adapter reload')
            if report['revision'] != local_base()['revision']:
                raise ValueError('Run uses a different base model revision')
            if args.character in report['trainedCharacterIds']:
                adapter = Path(report['adapterPath'])
            else:
                print('이 캐릭터의 학습 어댑터가 없어 기본 모델과 성격 설정으로 시험합니다. 고미 어댑터는 적용하지 않습니다.', flush=True)
    print('로컬 모델을 GPU에 불러오는 중입니다. 첫 실행은 잠시 걸립니다.', flush=True)
    model, tokenizer = load_model(adapter)
    print('모델 준비 완료. ' + ('캐릭터 학습본 사용.' if adapter else '기본 모델 사용: 캐릭터 추가 학습 전.'), flush=True)
    while True:
        if args.interactive:
            entries = list(actions)
            print('\n' + ' / '.join(f'{i + 1}: {actions[name]["label"]}' for i, name in enumerate(entries)) + ' / 0: 종료')
            selected = input('행동 번호 또는 ID: ').strip()
            if selected in ['0', 'exit', 'quit']:
                break
            if selected.isdigit() and 1 <= int(selected) <= len(entries):
                selected = entries[int(selected) - 1]
            if selected not in actions:
                print('actions.json에 등록된 행동을 선택해 주세요.')
                continue
            row['action'] = selected
            if selected == 'scene':
                row['scene'] = input('직접 제공할 장면: ').strip()
            else:
                row['scene'] = ''
        started = time.perf_counter()
        result = generate(model, tokenizer, row, characters, actions)
        result['generationSeconds'] = round(time.perf_counter() - started, 3)
        result['characterId'] = args.character
        result['action'] = row['action']
        result['qualityApproved'] = False
        print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)
        if result['valid']:
            row['previous'] = (row['previous'] + [result['line']])[-3:]
        else:
            print('짧은 한국어 응답 형식 검사에 실패했습니다. 고정 대사로 바꾸지 않았습니다.', flush=True)
        if not args.interactive:
            if not result['valid']:
                raise SystemExit(2)
            break


if __name__ == '__main__':
    main()
