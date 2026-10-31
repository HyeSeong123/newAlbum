# 고미 4B 대사 시험 학습

앱이 새로 다운로드하는 `Qwen3-4B-Instruct-2507`에 작은 4비트 LoRA 어댑터를 만든다. 학습용 배포본은 같은 원본의 `unsloth/Qwen3-4B-Instruct-2507-bnb-4bit`이며 2.65GB다. `Qwen3-4B`나 legacy 1.7B로 바꿔 학습하지 않는다. 앱의 GGUF 자체를 학습하는 것은 아니다.

## 환경

WSL2 Ubuntu, Python 3.11, GTX 1660 6GB. PyTorch는 `2.7.1+cu126`을 별도로 설치하고 같은 가상환경에 다음을 설치한다.

```bash
uv pip install -r /mnt/d/project/newAlbum/scripts/gomi-training/requirements.txt
```

bitsandbytes/Triton 실행에는 Ubuntu의 C 컴파일러(`build-essential`)도 필요하다. WSL 안에는 별도 NVIDIA Linux 드라이버를 설치하지 않는다.

## 입력 데이터

Windows 저장소에서 Node로 앱의 실제 프롬프트를 내보낸다. 출력 디렉터리는 새 디렉터리를 지정해야 한다.

```powershell
node scripts/gomi-training/export-data.mjs gomi-training-output/data-v3
```

현재 v3는 기존 초안 120개, 최초 사용자 대사 9개, 추가 원문 `user-dialogues-240.txt`의 240개를 사용한다. 기존 초안은 8종 상황과 5개 친밀도별 3개 답변이며 96개 학습/24개 평가다. 사용자 원문 249개를 모두 학습에 넣어 학습 345개가 됐다. 새로 작성한 평가 상황 24개를 기존 평가에 추가해 평가 48개다. 원문은 수정하지 않고 6주제 × 40개 파싱과 전체 일치를 검사한다. 평가는 같은 성격 주제에서 새로 작성한 문답이며 독립 사용자 품질 평가나 보지 못한 주제 전체의 성능을 뜻하지 않는다. 이전 v1과 v2 원본 데이터·결과는 각 결과 폴더에 보존돼 있다.

성격 기준은 '무조건 귀찮아하는 친구'에서 구체화했다. 산책은 재촉하지만 목줄·양치·입 닦기는 싫어하며, 발을 닦고 들어가는 순서를 안다. 낯선 손님에게는 가족 반응에 따라 숨거나 경계하고, 주인 뒤에서는 허세를 부린다. 집사에게 편의를 요구하는 모습과 혼났을 때 시선·접촉을 피하는 모습도 보존한다. 사용자 원문은 바꾸지 않고, 파생 초안은 agent-authored-draft-v2로 구분한다.

추가 240개에 명시된 최신 설명을 우선한다. 손님은 무조건 무서워 숨는 것이 아니라 귀찮아서 자리를 피하고, 밥그릇까지 직접 간 뒤 숟가락질을 기대한다. 다른 동물에게는 보호자를 믿고 허세를 부리되 실제 싸움은 피한다. 친밀도가 높아도 더 순종적으로 바뀌지 않는다. 새 원문이 제공한 삐짐 대사는 학습하지만, 최초의 `speech:null` 장면에 임의의 말을 붙이지 않는다.

### 추가120개와 v4 이어 학습

`user-dialogues-120.txt`는 다음 사용자 첨부120개를 원문 그대로 보관한 자료다. 추위/컨디션 저하, 집사 외출, 반나절 뒤 귀가, 새벽 베개 요구의4주제×30개다. 추위·몸이 좋지 않은 상황에는 솔직히 의지하며, 배변 실수를 의도적 보복으로 단정하지 않는 최신 규칙을 각 장면 설정에 반영한다.

```powershell
node scripts/gomi-training/export-additional.mjs gomi-training-output/data-v4
```

기존 v3 내보내기는 재현을 위해 그대로 유지한다. 별도 v4 내보내기가 기존345개에 새120개를 전부 더해465개를 만들고, 기존 평가48개를 보존하면서 에이전트가 새로 작성한 평가16개를 더한다. 기존345/48행이 이전 저장본과 바이트 단위로 일치하는지 실제 실행 전에 확인한다. 새 평가도 알려진 성격 주제에서 작성한 문답이며 독립 사용자 품질 평가가 아니다.

`train.py --initial-adapter EXISTING_ADAPTER_DIRECTORY`는 모델명·r8·대상 모듈·canonical reference를 확인하고 기존 어댑터를 학습 가능한 상태로 불러온다. 새 실험으로 optimizer를 생성하며, **학습 전 평가는 기존 어댑터가 켜진 상태**에서 수행한다. 경로와 가중치 SHA256을 `initialAdapter`에 기록한다. 기본값은 여전히 새 어댑터 생성이며, `--resume-step`은 같은 실험 중단 복구에만 사용한다.

이번 v4는 검증된 v3 최종 어댑터에서 학습률0.0001로465개를1epoch/117update 추가 학습한다. 기존 학습 이력을 처음부터 다시 실행하는 방식과 구분한다. 새 데이터의 성격 반영과 기존 상황 변화는 별도로 확인하며 학습 실행만으로 대사 품질 합격을 선언하지 않는다.

혼났을 때는 행동만 제공됐으므로 `speech:null`로 보관하고 음성 대사 학습에서 제외한다. '나 삐졌어' 같은 말을 임의로 만들지 않는다. 나머지 성격 참고 대사는 명시적으로 가정한 장면으로 프롬프트를 구성한다. 앱이 방문객·목줄·양치·식사·다른 동물을 자동 감지하는 기능을 추가한 것이 아니다. 사진·일기·기존 사용자 기록은 읽지 않는다.

프롬프트는 `buildTouchPrompt`로 만들고 Android `CompanionModelRegistry.DIALOGUE.preparePrompt`처럼 빈 think suffix와 `/no_think`를 제거한다. 이 규칙을 앱 코드와 바이트 단위로 비교하는 테스트가 있다.

## WSL에서 실행

데이터를 `~/gomi-training/data/`에 복사한 뒤 다음을 실행한다. 학습은 사용자 홈에서 이루어지고 모델·캐시·체크포인트는 Git에 포함하지 않는다.

```bash
cd ~/gomi-training
source .venv/bin/activate
python /mnt/d/project/newAlbum/scripts/gomi-training/train.py --work "$PWD" --mode prepare
python /mnt/d/project/newAlbum/scripts/gomi-training/train.py --work "$PWD" --mode check
python /mnt/d/project/newAlbum/scripts/gomi-training/train.py --work "$PWD" --mode train --output "$PWD/runs/gomi-4b-first"
```

`prepare`가 원본과 NF4 배포본의 revision을 고정하고 NF4 파일을 받는다. `check`가 전체 예시의 길이와 분리를 검사한다. `train`은 새 출력 디렉터리에서만 실행한다. 배치 1, 길이 640토큰, gradient accumulation 4, rank 8, NF4, FP32 계산이며 GTX 1660에서 BF16을 가정하지 않는다. 기본은 한 epoch이고 `--epochs 2`로 두 차례 학습할 수 있다. 매 epoch 평가·저장 후 최저 평가 loss 회차를 최종 선택하며, 재로딩 loss가 일치해야 complete가 된다. 중간 어댑터 저장 간격은 `--checkpoint-every`로 지정한다. 가장 긴 입력의 GPU 역전파를 먼저 확인하고 메모리 부족이나 NaN이면 실패 기록을 남긴다.

`report.json`의 phase, 단계별 loss, `before.json`과 `after.json` 생성 결과, `adapter/`가 결과물이다. `complete`는 실제 optimizer 실행·가중치 변경·저장 어댑터 재로딩과 평가가 끝났다는 뜻이며 대사 품질 합격을 뜻하지 않는다. `qualityApproved`와 `deployedToApp`은 false다. 새 실험은 새 출력 이름으로 실행한다.

중단된 실험은 동일한 `--work`, `--output`, epoch/학습률/묶음 설정에 `--resume-step N`을 추가해 저장된 `checkpoint-N`부터 재개한다. 데이터 해시와 모델 revision이 달라지면 거부하며 기존 보고서는 별도 파일에 보존한다. 새 체크포인트는 optimizer와 CPU/CUDA RNG도 함께 저장한다. 예전 가중치만 있는 저장본은 `--allow-optimizer-reset`을 명시해야 하며 optimizer 초기화 이력을 기록한다. 이때 연속 학습과 동일한 수치 결과를 보장하지 않는다. 모든 update가 끝난 마지막 단계의 재개는 거부하므로, 최종 평가 중 종료되었다면 직전 체크포인트를 선택해 마지막 몇 update와 평가를 다시 수행한다.

VRAM을 줄이기 위해 Qwen3의 `logits_to_keep`에 답변을 예측하는 위치만 전달한다. 입력 문맥은 모두 계산하며 표준 masked causal loss와 동일한 loss/gradient인지 작은 Qwen3로 검증한다. v3 학습 전후 생성 표본은 새 평가 주제별 1개씩 6개와 기존 앱 산책 1개다. 추론 생성에는 KV cache를 사용한다. 이 표본을 자동 품질 합격 기준으로 쓰지 않는다.

## 검증

```powershell
node --test tests/gomi-corpus.test.mjs tests/gomi-training.test.mjs tests/companion-touch.test.mjs
```

```bash
python -m unittest discover -s /mnt/d/project/newAlbum/tests -p test_gomi_training.py
```

앱에 적용하려면 별도로 어댑터 병합/호환 GGUF 변환, 해시·다운로드 정책, 다른 캐릭터에 대한 영향과 실제 Android 대사 품질을 검증해야 한다. 이 실험은 APK 버전·앱 다운로드 URL·DB·서명 설정을 변경하지 않는다.

참고: [Qwen 4B 모델](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507), [PEFT 4비트 학습](https://huggingface.co/docs/peft/developer_guides/quantization).

계보 기록의 한계: NF4 배포자가 원본으로 명시한 모델은 위 Qwen 4B다. 기록한 `originalModelRevision`은 준비 시점의 공식 저장소 reference이며, NF4 변환 당시 정확히 그 commit을 썼다는 바이트 단위 검증을 뜻하지 않는다. 실제 다운로드 파일은 NF4 배포본의 고정 revision과 공식 LFS SHA256으로 검증했다.

실행 기록: [첫 실험](../../docs/gomi-training-2026-10-31.md), [사용자 성격 자료를 합친 v2 재학습](../../docs/gomi-retraining-2026-10-31.md). v2는 실제 학습·재로딩까지 끝났으나 대사 품질은 미승인 상태다.

[추가 원문240개를 합친 v3 결과](../../docs/gomi-240-training-2026-10-31.md): 학습345/평가48, 2 epoch/174 update와 저장본·Windows 복사본 검증 완료. 동일 평가 자료에서 이전 v2 loss2.422001 → 새 v3 2.071296. 중단 후120단계에서 optimizer를 초기화해 복구한 이력이 있다. 새 상황 출력에는 의미·주체 혼동이 남아 대사 품질 미승인/앱 미배포 상태다.

[추가120개 v4 결과](../../docs/gomi-120-training-2026-10-31.md): 기존 v3에서465개/1epoch/117update 이어 학습과 재로딩·독립 평가·복사 검증을 완료했다. 동일64개 loss2.102170 → 2.087444로 소폭 감소했다. 최종 가중치와 동결 데이터는 [models/gomi-lora-v4](../../models/gomi-lora-v4/README.md)에 Git 보관한다. 자연스러움/상황·주체 혼동이 남아 품질 미승인, APK 연결 전 상태다.
