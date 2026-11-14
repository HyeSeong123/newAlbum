# 곰고미 전용 AI 프로그램

2026-11-15부터 기본 학습·실행 경로는 [새로 구현한 전용 AI](own/README.md)다. 모델 구조·순전파·역전파·가중치 갱신·앱 추론 코드를 직접 작성하고 가중치를 무작위 초기화부터 학습한다. 학습·실행 중 외부 모델 API를 호출하거나 기존 사전학습 가중치·어댑터를 가져오지 않는다. `곰고미-AI-실행.cmd`의2번은 자체 학습,3번은 자체 반응 시험이다.

학습 문장에는 사용자 원문과 출처를 표시한 AI 개발 도우미의 초안이 포함된다. 자세한 출처와 한계는 새 프로그램 안내에 기록했다.

## 이전 실험 보관

아래 내용은 현재 학습 메뉴와 Android 빌드에 사용하지 않는 이전 구성의 기록이다.

<details><summary>이전 외부 모델 검토 기록 펼치기</summary>

### 이전 고미 행동 반응 학습

**Powered by HyperCLOVA X**

외부 AI API 없이 PC에서 학습·실행하는 한국어0.57B 생성 모델입니다. 저장소 루트의 곰고미-AI-실행.cmd에서3번은 반응 시험,2번은 검토한547개 자료로 새 학습,4번은 자료 검사입니다.

이번 변경과 남은 한계는 [2026-11-14 결과](개선결과-2026-11-14.md)를 확인하세요. 원문·이전 실험을 보존했고 손길·수면 역할·추위/아픔의 조건부 성격을 수정했습니다. 기본 학습547/평가36개입니다.

앱 후보는 기본 모델+어댑터를 병합한 단일368MB Q4 GGUF이며 models/gomi-action-v3/runtime.json으로 Android 포장을 고정했습니다. 고미 홈 반응에서 사용하고 다른 캐릭터의 전용 학습을 완료한 것으로 표시하지 않습니다. 실제 캐릭터 정의는17종이며 미정인18번째 캐릭터는 임의로 만들지 않았습니다.

일부 표현·의미 오류가 남아 연구·개발 후보입니다. 형식 통과를 품질 승인으로 표시하지 않습니다. 주체 오류가 분명하면 로컬 모델에서 다시 생성하며 고정 대사로 숨기지 않습니다. 공유 prompt-contract.json, reaction-policy.json, characters.json, actions.json은 앱과 학습 실행에 함께 사용합니다.

새 행동은 actions.json에 ID·label·description과 필요시 characterGoals를 추가하고 앱 버튼을 연결합니다. 추가 학습 UTF-8 JSONL에는 id,group,characterId,action,affection,mood,energy,sleeping,scene,reply,source를 기록합니다. 학습과 validation의 group·입력·대사를 분리합니다. 고미 어댑터를 다른 캐릭터에 적용하지 않습니다.

학습 예: .\.venv\Scripts\python.exe local-ai/train.py --character gomi --corpus local-ai/data/gomi-actions-v3 --epochs 4 --learning-rate 0.0001

이어 학습은 --initial-adapter, 중단 복구는 --resume입니다. 모델·revision·자료·코드가 달라지면 같은 실험 재개를 거부합니다. 평가가 나빠지면 시작 어댑터를 유지합니다. 기존 파일을 덮어쓰지 않습니다.

PC 도구와 모델 캐시는 앱에 넣지 않습니다. 준비 단계에서만 공개 가중치·패키지를 다운로드하고 학습·생성은 로컬 파일을 사용합니다. 사진·일기·앱 DB는 학습 입력이 아닙니다.

선택 모델은 HyperCLOVA X SEED Model License Agreement를 따릅니다. 필수 LICENSE·NOTICE·변경 및 파생 조건을 보존해야 합니다. 공개 배포 시 이용 제한과 추가 상업 조건을 별도 확인해야 합니다. [원본 모델](https://huggingface.co/naver-hyperclovax/HyperCLOVAX-SEED-Text-Instruct-0.5B)

이전 구성·실험은 README-initial-setup.md와 개선결과-2026-11-12.md에 보존했습니다.
</details>
