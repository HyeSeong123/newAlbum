# 곰고미 학습 기반 구현 계획

> **For agentic workers:** 이 계획은 현재 세션에서 직접 실행한다. 이어받는 작업자는 superpowers:executing-plans 절차를 적용한다.

**Goal:** 기존 고미 자료를 보존하면서 여러 캐릭터 학습 프로젝트를 시작할 명령형 도구 제공.
**Architecture:** 기존 저장소에서 Node 표준 라이브러리 기반 순수 검증 코어와 파일 입출력 CLI를 분리한다.
**Tech Stack:** Node.js 24, node:test, GitHub Actions.
**Spec:** docs/superpowers/specs/2026-11-04-gomgomi-training-foundation-design.md

## Global Constraints
- 목표 캐릭터 18종, 실제 등록 17종; 나머지를 임의 생성하지 않는다.
- 기존 고미 465/64행, 원문·출처·분할·기존 파일을 보존한다.
- 새 의존성, 학습 실행, 앱 모델·UI·DB·서명 변경 없음.
- 기존 출력 디렉터리에 쓰지 않는다. Git 내부 출력은 gomgomi-training-output 아래로 제한한다.

## Review Focus
- 다른 캐릭터의 ID가 잘못 연결되는 입력.
- 공백만 바꾼 학습/검증 중복 대사.
- 기존 폴더, 심볼릭 링크, 읽기 실패 및 부분 출력.
- 원본 manifest의 해시와 파일 내용 불일치.
- 검사 성공을 실제 모델 학습·품질·속도 합격으로 해석하는 상태.

## Task 1: 검증 코어와 캐릭터 현황
Files: scripts/gomgomi-training/core.mjs, tests/gomgomi-training-core.test.mjs.
Interfaces: buildRegistry(definitions,targetCount), validateCorpus({train,validation},characterIds).
- [ ] 기대 결과·실패 입력 테스트를 먼저 작성해 RED 확인.
- [ ] 유효성 검사와 분할 누출 검사 구현, GREEN 확인.

## Task 2: 기존 자료 검사와 내보내기
Files: scripts/gomgomi-training/cli.mjs, scripts/gomgomi-training/project.json, tests/gomgomi-training-io.test.mjs.
Interfaces: readBaseline(root), exportCorpus(root,destination).
- [ ] 실제 저장소 자료와 임시 폴더에서 해시·원문 보존·덮어쓰기 거부·잘못된 출력 경로를 검사하는 테스트 작성.
- [ ] status/check/export 및 종료 코드 구현.
- [ ] 출력 manifest는 모든 파일 저장 후에 작성; 실패 폴더 재사용 거부.

## Task 3: 사용 안내와 CI
Files: scripts/gomgomi-training/README.md, .github/workflows/gomgomi-training-validation.yml, .gitignore.
- [ ] 관련 테스트와 status/check만 실행하는 경량 CI 추가.
- [ ] 기존/새 도구 역할과 실제 미구현 단계를 구분해 설명.
- [ ] CI와 변경 범위를 확인해 final 대상 draft PR로 제공.
