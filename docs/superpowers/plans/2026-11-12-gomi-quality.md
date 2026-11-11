# Gomi Action Quality Implementation Plan

> Execute inline with the established local workflow; review the data/code and generated comparisons independently before handoff.

**Goal:** 0.5~0.6B 범위에서 고미 행동 반응의 문법·주체·성격을 개선하고 앱용 경량 파일의 실제 크기와 생성 품질을 확인한다.

**Architecture:** 원문 자료는 보존한다. 충돌하는 과거 파생 초안은 새 행동 자료에서 제외하고, 사용자 원문 중 명시적 장면을 가진 대사를 추적 가능한 보조 자료로 사용한다. 새 파생 행동 자료·선택용 validation·최종 비교용 test를 분리한다. 선택 모델을 LoRA 학습하고 어댑터를 병합한 단일 양자화 후보를 만든다. 앱 적용은 의미 품질과 기기 검증 후 진행한다.

**Tech Stack:** 기존 Python/PyTorch/Transformers/PEFT, 기존 앱이 사용하는 GGUF 변환 도구. 외부 AI API 사용 없음.

## Constraints and review focus
- `models/gomi-lora-v4`와 사용자 원문·기존 학습 실험 덮어쓰기 금지.
- 고미는 산책/좋아하는 놀이에 적극적, 간식은 가까이 달라고 요구, 손길은 관계에 따라, 휴식은 자기 자리를 요구한다. 친해져도 복종형·위로 전용 캐릭터로 바꾸지 않는다.
- 실제 사건은 명시된 scene만 사용한다. 자는 중 방해와 조용한 휴식을 구별한다.
- 새 문장을 생성한다. 평가 실패를 고정 대사로 숨기거나 평가 정답을 입력하지 않는다.
- test 입력·답변을 학습/epoch 선택에 사용하지 않는다. 키워드 통과를 의미 품질 합격으로 표시하지 않는다.
- 0.5~0.6B 유지. 양자화 전후 동일 입력/조건 비교와 파일 크기/해시 기록. 앱 배포·서명 변경은 없음.

## Tasks
- [x] 원문 465/64 및 최신 성격 규칙 검토, 보존/제외 사유·출처 보고서.
- [x] curated corpus 로딩·관계/기분/행동 의도·가중치 이어 학습·validation epoch 선택을 실패 테스트 후 구현.
- [x] 행동별 파생 자료와 별도 장면 test를 작성하고 중복/누출 검사.
- [x] 이전 어댑터의 동일 새 입력 baseline을 보관하고 추가 학습. validation으로 학습 epoch 선택, 재로딩 검증.
- [x] 동일 test의 생성 전후를 검토하고 오류·반복·행동별 한계를 기록.
- [x] 병합→GGUF→Q4/Q5 후보를 만들고 실제 파일 크기와 생성 비교. 작은 Q4를 연구 후보로 선택; 의미 품질 승인은 보류.
- [x] 원클릭 기본 실행을 선택 모델에 연결하고 한국어 안내/검증 결과 갱신.

## Actual outcome and deviations

- Qwen3 0.6B/Qwen2.5 0.5B의 한국어 오류가 남아 한국어 특화 HyperCLOVAX-SEED-Text-Instruct-0.5B(약0.57B)로 변경했다. 별도 실험과 원문을 보존했으며 사용자에게 구축 방식을 위임받은 범위의 선택이다.
- 408 train/28 validation. 초기32개 test는 진단과 입력 개선에 쓰여 최종 독립 평가에서 제외했다. 새16개는 알려진 행동의 장면 holdout이며 사용자 독립 평가는 아니다.
- 마지막2epoch 추가 학습에서 선택한1epoch의 loss1.97069는 시작 어댑터의1.90835보다 높았다. 따라서 추가 학습 자체의 loss 개선으로 보고하지 않는다.
- 에이전트 의미 검토: 이전1/16, 최종HF12/16, nativeQ4 9/16. 368,181,952바이트의 단일 Q4 모델을 생성했지만 앱 품질 승인·실기기 검증은 완료하지 않았다. HF/native 샘플러 차이로 점수 차이를 양자화 원인으로 단정하지 않는다.
- APK 요청에 따라 실제 준비 명령을 실행했으나 Android 프로젝트와 SDK/NDK/Rust가 없어 종료 코드1로 실패했다. 새 서명키를 만들거나 기존 앱에 미승인 모델을 연결하지 않았다.
- 상세 결과: `local-ai/개선결과-2026-11-12.md`. 원문·학습·양자화·실패 증거와 미검증 사항을 함께 보관한다.
