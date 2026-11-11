# Local Action AI Implementation Plan

> **For agentic workers:** Execute inline using superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** PC에서 외부 AI API 없이 작은 행동 반응 언어모델을 학습하고 시험한다.

**Architecture:** 독립 Python 3.12 / PyTorch CUDA 12.8 환경. 캐릭터·행동 설정과 데이터 변환을 순수 모듈로 분리하며 Qwen3-0.6B용 LoRA를 새로 학습한다.

**Tech Stack:** Python, PyTorch, Transformers, PEFT, Windows PowerShell/CMD.

**Spec:** ../specs/2026-11-12-local-action-ai-design.md

## Global Constraints
- 기존 final 앱/DB/다운로드/서명은 수정하지 않는다.
- 고미 학습465/평가64 원문과 출처를 보존한다. 기존 4B 어댑터 재사용 금지.
- 17종만 등록하며 18번째 캐릭터/추가 정답 대사는 임의 생성하지 않는다.
- 추론과 학습은 로컬 파일만 읽는다. 준비 명령만 공식 공개 가중치를 다운로드한다.
- 기존 출력 거부, 길이 초과 데이터 거부, 품질/앱배포 미승인 유지.

## Review Focus
- 새 행동 ID는 사전에 등록하면 코드 수정 없이 학습/생성에 반영되는가.
- 서로 다른 캐릭터의 데이터/어댑터가 섞이지 않는가.
- 4B용 프롬프트/어댑터가 0.6B에 암묵적으로 재사용되지 않는가.
- split 누출이나 긴 입력을 조용히 잘라내지 않는가.
- 생성 실패/반복/긴 답변을 성공 또는 고정 대사로 숨기지 않는가.

### Task 1: PC runtime
- [x] 독립 Python/CUDA 설치, 실제 GPU 역전파 확인.
- [x] NF4 LoRA 저장/재로딩 호환성 검사.

### Task 2: Input and corpus contract
Files: local-ai/core.py, actions.json, characters.json, tests/test_local_action_ai.py.
- [x] 순수 테스트로 새 행동·성격·데이터 변환·누출·잘못된 입력을 먼저 실패시킨다.
- [x] 레지스트리 기반 messages와 원문 출처를 유지하는 변환을 구현한다.
- [x] 관련 테스트와 기존 고미 자료 검사를 실행한다.

### Task 3: Local training and generation
Files: local-ai/prepare.py, train.py, react.py, run.ps1, launcher.cmd.
- [x] 고정 revision 공식 모델 준비와 파일 해시 기록.
- [x] 답변만 supervision, 짧은 생성, 학습/평가 분리, 새 출력에 어댑터 저장.
- [x] 실제 고미 자료의 GPU 학습과 저장 어댑터 재로딩·생성 확인.

### Task 4: Handoff
- [x] 한국어 안내와 원클릭 실행 명령, 새 행동/캐릭터 자료 형식 제공.
- [x] 로컬 설치 의존성 고정, 자료 해시·크기·검증 결과 저장.
- [x] 앱 품질/변환/실기기 미검증 범위를 명시한다. GitHub 푸시는 하지 않는다.
