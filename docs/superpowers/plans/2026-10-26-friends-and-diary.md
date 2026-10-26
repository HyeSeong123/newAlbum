# Friends and diary implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모바일 일기를 넓게 보여주고 친구들 메뉴와 16명의 기본 몸짓을 보완한다.
**Architecture:** 기존 React/Motion/일기 CSS를 확장한다. 동작 선택·키프레임은 순수 모듈,
홈 진입/반응 타이머는 훅, 렌더링은 기존 CharacterVisual에 둔다. 저장소·AI 생명주기는 유지한다.
**Tech Stack:** React, TypeScript, Motion, Vite, 기존 Node/Playwright 검사.
**Spec:** `docs/superpowers/specs/2026-10-26-friends-and-diary-design.md`

## Global Constraints

- `final`, Android 스마트폰 우선. 기존 그림·ID·친밀도·SQLite·모델·서명·패키지 보존.
- 모바일 일기 한 열, 앨범 두 열 유지. 메뉴명 `친구들`.
- 기본 움직임은 AI/저장을 호출하지 않는다. 고미 수면 규칙은 그대로 둔다.
- 기존 의존성을 사용하고 영향 검사와 CI 검증을 중복해 과도하게 반복하지 않는다.

## Review Focus

- 320px 긴 일기 제목과 더보기/선택 조작: 관련 모바일 목록 검사.
- 터치·함께하기 중 원본 그림 DOM 유지: 캐릭터 브라우저 검사.
- 대표 변경·모달·백그라운드에서 타이머/기본 동작 안정성: 훅 브라우저 검사.
- 휴식이 기쁨/하트로 표시되지 않고 성격별 움직임이 구분됨: 순수 모듈+브라우저 검사.
- 자발적 움직임으로 친밀도가 오르지 않음, 고미 수면 유지: 명령 기록과 기존 고미 검사.

### Task 1: 모바일 목록과 메뉴

**Files:** diary.css, App.tsx, CharacterBook/useCharacters/HomeView/helpContent와 관련 검사.
**Interfaces:** 기존 화면 경로와 캐릭터 ID 유지, 사용자에게 보이는 명칭만 변경.
- [x] 관련 브라우저 기대값을 한 열과 친구들로 정하고 최종 CI로 확인한다. 변경 전 브라우저 실행은 다운로드 환경 문제로 미검증이다.
- [x] 작은 화면의 일기 한 열·읽기 여백을 복원하고 메뉴·도움말 이름을 통일한다.
- [x] 일기 저장/재진입과 친구 대표/이름 변경 관련 검사를 수행한다.

### Task 2: 친구 몸짓

**Files:** 새 companionBehavior.ts, useCompanionBehavior.ts, CharacterVisual.tsx, HomeView.tsx.
**Interfaces:** companionHomeMotion(signature, random), companionInteractionMotion(signature, index, resting),
companionMotionForAction(action), companionMotionAnimation(motion, signature),
useCompanionBehavior(enabled, characterId, signature) → motion/sequence/paused/react/activity.
- [x] 순수 동작 선택·다섯 행동·성격별 강도 검사를 작성하고 실패를 확인한다.
- [x] 모듈/훅/렌더러를 연결하고 같은 원본 노드를 유지한다.
- [x] 휴식 유지, 연속 터치, 상태 전환, 타이머 정리와 고미 회귀를 확인한다.

### Task 3: 배포 확인

**Files:** 관련 테스트, package/버전 파일, 변경 검증 기록.
- [x] 영향 단위 검사와 타입/빌드를 수행한다. UI 검사는 가능한 환경에서 수행한다.
- [x] 한 번의 독립 코드 검토로 중요한 결함을 확인하고 필요한 수정만 적용한다.
- [x] 버전을 올려 final에 반영하고 CI/APK 결과와 미검증 항목을 구분해 보고한다.

최종 근거는 [0.9.37 검증 기록](../../friends-and-diary-0.9.37.md#최종-ci와-apk-확인)에 정리했다.
실물 Android 휴대폰 및 Windows 설치 검증은 이번 작업에서 수행하지 않았다.
