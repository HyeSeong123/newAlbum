# 곰고미 고미 행동 반응 학습

**Powered by HyperCLOVA X**

외부 AI API·Ollama 서버 없이 PC에서 직접 학습하고 새 문장을 생성합니다. 현재 선택한 모델은 한국어 특화 `HyperCLOVAX-SEED-Text-Instruct-0.5B`(실제 약 0.57B)입니다. 기존 범용 Qwen 0.6B와 Qwen2.5 0.5B도 비교했으나 한국어·주체 오류가 많아 기본 실행에서 제외했습니다. 이전 자료와 결과는 보존했습니다.

## 실행

저장소 루트의 **`곰고미-AI-실행.cmd`**를 더블클릭하세요.

1. GPU 환경 검사
2. 검토·보강한 고미 자료로 새 학습
3. 행동을 골라 새로운 짧은 반응 시험
4. 자료 검사

성격과 조건을 고려한 생성이지만 아직 의미·문법 오류가 남는 연구용 모델입니다. 형식 통과를 품질 승인으로 표시하지 않습니다. 실패한 출력을 고정 대사로 바꾸지 않습니다.

```powershell
.\.venv\Scripts\python.exe local-ai/react.py --character gomi --action pet --affection 83
.\.venv\Scripts\python.exe local-ai/react.py --character gomi --action play --sleeping --mood irritated --energy 1
```

학습·생성은 오프라인 로컬 파일만 사용합니다. `prepare.py`와 환경 설치만 공개 가중치/패키지 다운로드에 인터넷을 사용합니다. 사진·일기·앱 DB는 입력으로 읽지 않습니다.

## 자료와 성격

원문 고미 v4 학습465/평가64와 사용자 제공 대사는 수정하지 않았습니다. 새 행동 자료는 **408개(새 파생 초안320 + 사용자 원문 그대로88)**, 선택용 평가28개입니다. 16개 최종 상황은 이 자료에 넣지 않았습니다. 이 평가는 알려진 행동의 새 장면 검사이며 독립 사용자 평가나 모든 새 행동의 일반화 검증은 아닙니다.

초기의 32개 비교 상황은 문제 진단과 입력 정책 개선에도 사용했으므로 독립 최종 테스트로 부르지 않습니다. 상세 원문별 보존/제외 이유는 `data/gomi-actions-v2/source-audit.json`에 있습니다. 새 파생 대사는 에이전트 작성 초안이며 사용자 원문/사용자 승인 자료로 표시하지 않습니다.

- `characters.json`: 이름·성격. 실제 앱 정의17종이며 18번째 캐릭터는 미정입니다.
- `actions.json`: 행동 설명과 `characterGoals`. 앱이 아는 행동·관계·기분으로 원하는 반응 방향을 정하고, 모델이 그 뜻을 새 문장으로 표현합니다. 답변 문장을 선택하는 표가 아닙니다.
- 수면 상태는 자는 캐릭터와 집사의 역할을 명확히 구분합니다. 조용한 휴식과 수면 방해를 구별합니다.
- 고미 어댑터는 고미에게만 적용합니다. 감자·고구마 등은 성격 설정만 준비했으며 전용 학습을 완료한 것이 아닙니다.

## 새 행동과 추가 학습

`actions.json`에 새 ID·label·description을 추가하면 시험 목록에도 표시됩니다. 원하는 반응 방향은 `characterGoals`의 `gomi.default` 또는 distant/familiar/close로 지정할 수 있습니다. 새 행동의 실제 앱 버튼을 추가하는 작업은 별도입니다.

추가 UTF-8 JSONL의 형식(대사 부분은 직접 승인한 문장으로 작성):

```json
{"id":"고유ID","group":"독립장면그룹","split":"train","characterId":"gomi","action":"새행동ID","affection":75,"mood":"calm","energy":3,"sleeping":false,"scene":"직접 제공한 상황","reply":"직접 승인한 대사","source":"작성자·자료출처"}
```

평가 자료는 `split:validation`으로 분리하고 학습과 group·실제 입력·답변이 겹치지 않게 작성하세요. 다른 캐릭터를 학습할 때도 그 캐릭터의 학습/평가 자료가 모두 필요합니다.

```powershell
.\.venv\Scripts\python.exe local-ai/train.py --character gomi --corpus local-ai/data/gomi-actions-v2 --extra 추가자료.jsonl --epochs 4 --learning-rate 0.0001
```

이전 어댑터에서 이어서 새 실험을 시작하려면 `--initial-adapter`에 해당 run의 adapter 폴더를 지정합니다. 모델·revision·캐릭터·해시가 다르면 거부합니다. 현재 결과는 4epoch 학습 중 validation 최저인3회차를 고른 뒤, 행동 의도/수면 역할 입력을 보강해2epoch 추가 학습하고 그중1회차를 선택한 결과입니다. 별도 기본 모델로 어댑터를 바꿔 끼우지 않습니다.

중단 복구는 같은 corpus·epochs·학습률·설정에 `--resume`으로 체크포인트를 지정합니다. optimizer/RNG와 가중치 해시를 확인합니다. 자료·코드·성격·행동이 달라지면 재개를 거부하고 새 실험을 요구합니다. 기존 결과는 삭제하거나 덮어쓰지 않습니다.

## 앱용 모델 크기

`exports/gomi-action-v3`에 병합한 단일 GGUF 후보가 있습니다.

| 형식 | 실제 파일 크기 |
|---|---:|
| Q4_K_M (우선 후보) | 368,181,952바이트, 약368MB |
| Q5_K_M | 416,940,736바이트, 약417MB |

두 파일은 기본 모델+어댑터가 병합된 **독립 실행 모델**입니다. 이전 4B용 어댑터와 함께 사용하지 않습니다. PC Python/CUDA 환경과 원본 가중치를 앱에 넣지 않습니다. 모델이 작아도 Android 실제 메모리·응답 속도·APK 호환성 검사가 필요합니다.

native GGUF와 HF의 프롬프트 토큰 ID333개가 일치함을 확인했습니다. Windows 파일 저장의 줄바꿈 변환을 막고, CLI의 자동 대화 템플릿 중복 적용도 비활성화했습니다. 샘플러 구현이 달라 두 실행의 문장이 바이트 단위로 같지는 않습니다.

현재 앱은 기존 4B 다운로드/어댑터 정책을 사용합니다. 이 결과를 연결하려면 모델 정책과 프롬프트 연결 및 기기 검증이 필요합니다. 기존 앱·사진·DB·서명 설정은 변경하지 않았습니다. APK 생성은 준비 단계에서 Android 프로젝트·SDK·NDK·Rust 부재로 실패했으며 APK를 생성한 것으로 표시하지 않습니다.

## 라이선스와 환경

선택 모델은 Apache-2.0가 아닌 **HyperCLOVA X SEED Model License Agreement**입니다. 배포 후보에 원문LICENSE·NOTICE·변경 고지·파생 모델 이용 조건을 함께 넣었습니다. 파생 모델 이름은 `HyperCLOVA X Gomgomi Gomi 0.5B`입니다. 재배포 시 원문 제공·출처/Powered by 표시·이용 제한과 추가 상업 조건을 지켜야 합니다. 앱 공개 배포 승인이나 상업 적합성을 이번 연구 결과로 대신하지 않습니다. [원본 모델·라이선스](https://huggingface.co/naver-hyperclovax/HyperCLOVAX-SEED-Text-Instruct-0.5B)

환경: Python3.12.16, torch2.11.0+cu128, Transformers4.57.6, PEFT0.18.1. 독립 `.python`/`.venv`를 사용합니다. 환경 복구는 `local-ai/setup.ps1`입니다. 폴더를 이동하면 가상환경 경로를 다시 구성해야 할 수 있습니다.

현재 설정은 `model-selection.json`, `preferred-training.json`, 성공 실험 포인터는 `runs/latest.json`, 선택 경량 파일은 `selected-export.json`입니다. 실측 결과·실패·남은 오류는 `개선결과-2026-11-12.md`와 `quality-v2/`를 참고하세요. 이전 초기 구성 안내는 `README-initial-setup.md`에 이력으로 보존했습니다.
