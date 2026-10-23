# Character Spotlight Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans in this session. Steps use checkbox syntax.

**Goal:** 사용자가 요청할 때 현재 실제 버튼 옆에서 대표 캐릭터가 호감도별로 안내한다.
**Architecture:** 화면 상태를 받는 공통 Provider, 의미 기반 Registry, 순수 배치 함수, 호감도 대사 Resolver, 안전한 포털 Overlay.
**Tech Stack:** 기존 React/TypeScript/CharacterVisual/Playwright/Node tests; 신규 제품 의존성 없음.
**Spec:** docs/superpowers/specs/2026-10-23-character-spotlight-design.md

## Global Constraints
- final 기준, Android 우선, 오프라인 지원.
- 기존 캐릭터 17종/이름/성장/호감도 0·20·30·60·90 및 저장 데이터 보존.
- 도움말 중 원래 버튼 실행/교감 저장 금지. 오류/위험/상태 안내 보존.

## Review Focus
- 중첩 모달의 뒤로 가기에서 바깥 모달까지 닫히지 않아야 한다.
- 스크롤/작은 화면/회전에서 캐릭터가 버튼을 가리지 않아야 한다.
- 분석 완료 등으로 버튼이 사라지면 안전하게 건너뛰어야 한다.
- 선택 모드와 입력 중 도움말 종료 후 값/스크롤이 보존돼야 한다.
- 비활성/숨긴 버튼은 단계와 전체 개수에 포함되지 않아야 한다.

### Task 1: 기준 화면과 실패하는 사용자 시나리오
- [x] tests/help-spotlight.spec.ts 및 fixtures로 기존 화면 캡처와 실패 테스트: ? 진입/단계/모달/선택/위험 동작 방지/복원.
- [x] tests/help-model.test.mjs: 화면 경계/대상 비중첩, 대사 모든 캐릭터/5경계/불변 기능 정보.

### Task 2: 공통 시스템
- [x] src/features/help/{helpContent,helpDialogue,helpGeometry}.ts: 명시적 의미/캐릭터별 대사/순수 좌표 함수.
- [x] src/features/help/{HelpProvider,HelpOverlay}.tsx 및 help.css: 범위 수집/공통 ?/82% 마스크/동적 배치/입력 차단/접근성/복원.
- [x] 테스트 red → green 확인.

### Task 3: 전체 화면 연결과 중복 문구 정리
- [x] App.tsx에 화면 키/선택 상태 연결; 기존 GomiGuide 진입은 공통 시스템으로 교체.
- [x] FunctionHelp를 같은 시스템으로 통합; 실제 주요 화면/모달 버튼을 Registry에 연결.
- [x] 불필요 소개/중복 문구만 정리; 필수 경고와 빈 상태는 유지.
- [x] 도움말 이후 실제 선택/저장/취소 동작 검증; 캐릭터/호감도 변경 검증.

### Task 4: 회귀/시각/Android/전달
- [x] TypeScript build, 전체 Node unit, 관련 PC/모바일 Playwright 및 기존 인식/데이터 보존 검사.
- [x] 전후 동일 화면 캡처, 320/393/430px와 짧은 화면, 대화상자/스크롤/오프라인/키보드 검증.
- [ ] 최신 원격 final과 차이 확인 후 실제 Git parent를 보존해 반영, 기존 키로 Android 빌드/설치 검사.
- [ ] 독립 리뷰 후 필요한 수정, 적용 표/결과/미검증 항목 보고.

Ruling: 사용자가 상세 명세로 실제 수정과 검증을 명시했으므로 별도 설계 승인 대기로 중단하지 않는다. 현 작업 전용 scratch 체크아웃을 사용하고 기존 작업 파일을 보존한다. 원격 반영은 synthetic 로컬 이력을 push하지 않고 GitHub 실제 parent/tree를 사용한다.

검증 기록: Node 157개 통과, TypeScript/Vite/오프라인 자산 검사 통과. 독립 리뷰에서 팝업 키보드 접근, 캐릭터 발견창 보존, 반려동물 선택 설명을 수정했다. 관련 PC/모바일 회귀 138개 중 129개 통과·7개 조건부 건너뜀, 문구 기대값 2개는 설명을 보완하고 재실행하여 통과했다. 전체 실행 로그의 실패 이력은 숨기지 않는다. Android 서명 빌드/에뮬레이터 설치 결과는 원격 반영 뒤 확인한다.
