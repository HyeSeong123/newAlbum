# 곰고미 전용 AI

현재 기본 AI는 이 폴더의 자체 학습기와 `src/features/characters/ownAi/`의 자체 추론기다. 가중치를 무작위로 초기화하고 다음 단어를 학습한다. 순전파·역전파·학습 갱신도 `neural.py`에 직접 구현했다. 외부 사전학습 가중치·어댑터·토크나이저·추론 엔진을 사용하지 않고, 학습과 앱 실행 중 모델 API를 호출하지 않는다. 학습 문장에는 사용자 원문과 이 작업의 AI 개발 도우미가 작성한 초안이 포함된다. 이전 모델의 생성 시험 결과를 학습하거나 초안을 사람이 작성·승인한 자료라고 표시하지 않는다. PC에서 NumPy는 행렬 곱셈 같은 수학 계산에만 사용하며 앱에는 포함하지 않는다. 일반 앱 라이브러리인 React·Tauri 등은 별도다.

## PC 실행

기존 `곰고미-AI-실행.cmd`의2번은 자체 모델을 처음부터 학습하고3번은 같은 자체 추론기로 반응을 생성한다. 메뉴의 어떤 항목도 외부 모델을 내려받지 않는다.

직접 명령:

```powershell
.\.venv\Scripts\python.exe local-ai\own\train.py --epochs 180
node scripts/prepare-own-character-ai.mjs
node scripts/own-character-ai.mjs --character gomi
```

학습기는 `src/features/characters/ownAi/model.json`을 내보낸다. 앱은 이 가중치를 검증해 Worker에서 단어별로 새 문장을 생성한다. 대사 목록을 검색해 고르는 경로와 실패를 감추는 고정 대사 대체 경로는 없다. 원문·옛 실험·가중치는 보관하지만 새 학습기나 앱에서 읽지 않는다.

## 새 행동과 추가 자료

다음처럼 사용자 작성 자료를 JSONL로 만든다. 같은 행동의 말투·친밀도·상태별 예시를 여러 개 넣는 것이 좋다.

```json
{"characterId":"gomi","action":"greeting","affection":80,"mood":"calm","energy":3,"sleeping":false,"reply":"집사, 왔으면 내 옆에 있어."}
```

```powershell
.\.venv\Scripts\python.exe local-ai\own\train.py --extra 나의자료.jsonl
node scripts/prepare-own-character-ai.mjs
```

새 행동 ID가 모델에 자동으로 등록된다. 앱에서 새 행동을 누르는 버튼을 추가할 때 그 ID를 전달한다. 등록되지 않은 행동은 학습되지 않았다고 실패하며 다른 행동으로 몰래 바꾸지 않는다. 모델의 어휘와 표현 범위는 제공한 자료에 한정되며, 자유로운 범용 한국어 대화 능력을 갖췄다고 주장하지 않는다.

## 계보와 배포

- `corpus.json`: 실제 사용 자료·제외 사유·원본 해시. 기존 원문 파일은 수정하지 않는다.
- `action-drafts.json`: 새 초안의 저자·출처. 외부 모델 출력에서 증류한 자료가 아니다. 사용자 검토 완료 자료로 표시하지 않는다.
- `training-result.json`: 무작위 초기화·부모 모델 없음·학습 코드/자료 해시·실제 학습 시간.
- Android 배포 검사는 외부 캐릭터 GGUF/LoRA와 llama/ggml 추론 라이브러리의 부재 및 자체 가중치 해시를 검사한다.

갤럭시26의 목표는 행동 후 문장 전체가1초 안에 표시되는 것이다. PC·에뮬레이터 측정을 실기기 결과로 대신하지 않는다. 기존 사진의 얼굴·반려동물 인식은 별도 모델·권리 기록이며 자체 캐릭터 AI를 만들었다고 앱 전체의 권리 문제가 해결됐다고 표시하지 않는다.
