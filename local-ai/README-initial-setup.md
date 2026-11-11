# 곰고미 PC 학습 환경

외부 AI API나 Ollama 서버 없이 이 PC의 RTX 5070에서 직접 학습하고 실행합니다. Python·PyTorch·Transformers는 PC용 학습 라이브러리이며 앱에 포함하지 않습니다. **공개 Qwen3-0.6B를 추가 학습하는 구성**으로, 언어모델을 무작위 가중치부터 만든 것은 아닙니다.

## 시작

저장소 루트의 **`곰고미-AI-실행.cmd`**를 더블클릭하세요.

1. GPU 학습 환경 점검: 무작위 소형 호환성 모델로 역전파·저장·재로딩 검사
2. 고미 학습 시작: 원본 학습 465개·평가 64개로 새 실험 생성
3. 행동별 새 한마디 시험: 모델을 한 번 로드하고 행동을 골라 새 문장 생성
4. 자료 검사: 자료 분리와 등록된 캐릭터·행동 확인

첫 가중치는 준비되어 있습니다. **학습·시험은 오프라인 실행**하며 `prepare.py`와 `setup.ps1`만 패키지/공개 가중치 다운로드에 인터넷을 사용합니다. 개인 사진·일기·앱 DB는 학습 입력으로 읽지 않습니다.

PowerShell에서는 저장소 루트에서 다음을 실행합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File local-ai/run.ps1 -Action react
```

직접 시험할 때:

```powershell
.\.venv\Scripts\python.exe local-ai/react.py --character gomi --action pet --affection 75
.\.venv\Scripts\python.exe local-ai/react.py --character gomi --action rest --mood sleepy --sleeping
```

`walk/treat/pet/play/rest/touch`는 앱의 가상 행동입니다. `scene`은 사용자가 직접 제공한 상황에 반응하는 시험용 입력이며, 현실 사건 자동 감지 기능이 아닙니다. `--previous "직전 말"`을 여러 번 지정하면 반복을 피하도록 요청하고 동일한 응답은 거부합니다. 생성은 확률적이므로 매번 반드시 다른 문장을 보장하지는 않습니다. 길이/반복 검사 실패 시 고정 대사로 대체하지 않고 실패와 실제 원문을 보여 줍니다. 형식 통과가 자연스러움이나 성격 품질 합격을 뜻하지 않습니다.

## 성격과 새 행동

- `characters.json`: 실제 앱 정의에서 가져온 17종의 이름·성격. 고미는 최신 성격 문서를 반영했습니다. 18번째 캐릭터는 미정입니다.
- `actions.json`: 행동 ID, 표시 이름, 상황 설명. 여기에 행동을 추가하면 시험 화면 목록에도 표시됩니다. 학습 코드의 if문을 추가할 필요가 없습니다.
- 기존 고미 어댑터는 **고미에게만** 적용합니다. 감자·고구마 등 다른 캐릭터는 기본 모델과 해당 성격 설정으로 시험하며, 전용 대사 학습이 완료된 것으로 표시하지 않습니다.

새 행동의 등록 예시(아직 실제 자료에 추가하지 않은 설명용 예시):

```json
"brush": {"label": "빗질하기", "description": "집사가 화면 속 캐릭터의 털을 빗어 준다."}
```

원하는 성격을 안정적으로 학습하려면 실제 승인한 대사를 별도 UTF-8 JSONL에 작성합니다. 아래는 **필드 형식 설명**이며 정답 대사가 아닙니다.

```json
{"id":"고유ID","group":"서로독립적인상황그룹","split":"train","characterId":"gomi","action":"brush","affection":75,"mood":"calm","energy":3,"sleeping":false,"reply":"여기에 직접 승인한 대사","source":"작성자와자료출처"}
```

평가용 장면은 `split`을 `validation`으로 지정하고 학습에 없는 group·입력·대사를 사용하세요. 같은 장면의 말투만 바꿔 평가에 넣으면 과대평가될 수 있습니다. 새 캐릭터를 학습할 때는 해당 캐릭터의 학습·평가 자료가 모두 필요합니다. 예시에는 source를 반드시 기입하며, 기존 자료를 덮어쓰지 않습니다.

```powershell
.\.venv\Scripts\python.exe local-ai/train.py --character gomi --extra "추가자료.jsonl" --epochs 3
.\.venv\Scripts\python.exe local-ai/train.py --character potato --extra "감자자료.jsonl" --epochs 3
```

`scene` 행에만 필요한 명시적 상황은 `scene` 문자열 필드로 추가할 수 있습니다. 새 행동은 설명만 등록해도 기본 반응을 생성하지만 **그 행동과 성격이 잘 맞는지는 추가 자료·검토가 필요**합니다. PC 도구 등록이 앱의 새 버튼까지 구현하는 것은 아닙니다.

## 학습·저장·중단 복구

기존 고미 v4의 **대사·출처·학습/평가 분할은 그대로** 두고, 4B용 긴 프롬프트를 새로운 행동/장면 입력으로 변환합니다. 0.6B의 공식 채팅 템플릿으로 다시 토큰화하며 생각 모드는 끕니다. 학습에 4B용 어댑터를 재사용하지 않습니다. 지시문에는 loss를 주지 않고 답변 부분만 학습합니다. 너무 긴 예시는 조용히 자르지 않고 오류로 알립니다.

기본값은 1 epoch, LoRA rank 8, 학습률 0.0002, 누적 4입니다. `--epochs 3 --learning-rate 0.0001`처럼 별도 실험을 만들 수 있습니다. 결과는 `runs/캐릭터-시각/`의 보고서·변환 자료·체크포인트·어댑터·실제 생성 표본입니다. 여러 epoch의 마지막 모델을 저장하므로 평가 loss를 비교해 직접 선택하세요. `runs/latest.json`은 가장 최근에 성공한 실험이며 최고 품질을 자동 선정한 결과가 아닙니다.

학습 중 Ctrl+C로 멈추면 최대 25 update 간격의 마지막 체크포인트부터 이어갈 수 있습니다. 원래와 같은 캐릭터·데이터·설정을 주고 보고서의 `lastCheckpoint`를 사용하세요.

```powershell
.\.venv\Scripts\python.exe local-ai/train.py --character gomi --epochs 3 --learning-rate 0.0001 --resume "local-ai/runs/실험명/checkpoint-저장번호"
```

자료·성격·행동·모델·설정이 바뀌면 재개를 거부합니다. 새 실험으로 시작하세요. 기존 출력은 자동 삭제하지 않습니다. 새 출력 이름이 이미 존재하면 거부합니다. 메모리가 부족하면 다른 GPU 프로그램을 닫고 재실행하세요. 더 큰 모델이나 CPU로 자동 변경하지 않습니다.

## 앱 용량

기본 모델 원본 파일은 PC에서 약 **1.52GB**, LoRA 어댑터는 약 **9.2MB**입니다. **어댑터만으로 실행할 수 없고 기본 모델이 필요합니다.** PC의 `.python`, `.venv`, `.tools`, 캐시, 학습 결과는 앱에 넣지 않습니다.

앱에 적용할 때는 기본 모델+어댑터 병합, 4비트 변환, 실제 한국어·성격 평가, 기존 앱 런타임의 호환성·실기기 메모리/속도 검사가 필요합니다. 0.6B 양자화 파일도 수백 MB가 될 수 있습니다. 이번 작업에서 앱용 양자화 파일을 만들거나 앱 다운로드 모델을 교체하지 않았으므로 최종 앱 증가 용량·1초 응답은 미검증입니다. 작은 모델은 한국어와 성격 유지에 한계가 있을 수 있습니다. `qualityApproved=false`, `deployedToApp=false`를 유지합니다.

## 환경 복구

Python은 이 프로젝트의 `.python`에, 가상환경은 `.venv`에 독립 설치했습니다. 프로젝트를 이동하면 가상환경 경로를 다시 구성해야 할 수 있으므로 현재 위치에서 사용하세요.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File local-ai/setup.ps1
```

구성: Python 3.12.16 / torch 2.11.0+cu128 / CUDA 12.8 / Transformers 4.57.6 / PEFT 0.18.1. `requirements.txt`는 주요 버전을, `requirements.lock.txt`는 실제 설치한 전체 버전을 기록합니다. 독립 NVIDIA 드라이버나 WSL은 새로 설치하지 않았습니다.

검증:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -p test_local_action_ai.py
.\.venv\Scripts\python.exe -m unittest discover -s tests -p test_gomi_training.py
```

공식 자료: [Qwen3-0.6B와 Apache-2.0 이용 조건](https://huggingface.co/Qwen/Qwen3-0.6B), [PyTorch 설치](https://pytorch.org/get-started/locally/), [PEFT LoRA](https://huggingface.co/docs/peft/main/en/conceptual_guides/lora).
