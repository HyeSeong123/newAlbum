# Selective person precision implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 첫 분석을 유지하고 사용자가 다시 찾은 사진에만 추가 얼굴 탐색을 제공한다.
**Architecture:** 기존 Worker에 순차 구역·원본 얼굴 분석을 추가하고 기존 재시도 버튼에서 모드를 전달한다. 후보 비교의 기준 선택만 방향별로 보완한다.
**Tech Stack:** 기존 React/TypeScript/TFJS/FaceAPI/Rust/SQLite, 새 의존성 없음.
**Spec:** `docs/superpowers/specs/2026-10-28-person-selective-precision-design.md`

## Global Constraints

- `final` 기준, PR #20은 미병합 상태로 유지. 기존 모델·128차원·자동 연결 임계값·원본·DB·서명 보존.
- 기본 분석에는 추가 추론 없음. 사용자가 누른 재시도에만 정밀 모드.
- 구역 4개와 불확실한 얼굴 최대 4개를 순차 처리하고 전체 최대 100얼굴.
- 실제 사진 정확도와 휴대폰 속도는 측정 전 개선 수치로 주장하지 않음.

## Review Focus

- 구역 겹침과 사진 가장자리: 좌표 검증·중복 제거 단위 검사.
- 이웃 얼굴: 정밀 분석의 위치 일치 검사, 모호하면 기존 결과 유지.
- 취소·모델 오류: 원본 ImageBitmap 해제 및 저장 전 AbortSignal 확인.
- 새 사진과 재시도 사진 혼합: 정확한 사진에만 정밀 모드 전달.
- 확인된 옆모습이 최근 정면 32장에 밀리는 경우: 실제 기준 선택 Rust 검사.

### Task 1: 구역과 선택적 추론

**Files:** 새 `engine/precision.ts`, `tests/person-precision.test.mjs`.
**Interfaces:** `analyzePreciseFaces(initial, detectRegion)`; 정규화 좌표와 기존 FaceFeatures 사용.
- [x] 기본 결과·겹침·이웃 얼굴·횟수 제한·잘못된 결과 검사를 작성하고 실패 확인.
- [x] 구역 좌표 매핑·중복 제거·최대 4개 얼굴 정밀 분석 구현.
- [x] `node --test tests/person-precision.test.mjs` 통과 확인.

### Task 2: 실제 분석 연결

**Files:** `engine/client.ts`, `person.worker.ts`, `types.ts`, `faceService.ts`, `PeopleView.tsx`, 관련 브라우저 검사.
**Interfaces:** 마지막 선택 인자 `{ precision?: boolean }`; 기존 기본 호출 호환.
- [x] 기본 모드 추가 작업 없음·재시도만 정밀 모드인 동작 검사 작성.
- [x] 정밀 모드에서만 원본 ImageBitmap 전달, 순차 crop 분석과 해제 연결.
- [x] 재시도 사진 집합에만 모드 전달하고 진행 문구 표시. 실제 버튼 검사.

### Task 3: 방향별 확인 기준 선택

**Files:** `src-tauri/src/person_engine.rs`, `faces.rs`.
**Interfaces:** 확인된 기준을 방향별로 고르게 선택. 기존 rank/rank_for_review 유지.
- [ ] 최근 정면이 많아도 확인된 옆모습·다른 사진 기준이 남는 Rust 실패 검사 작성.
- [x] 한 사람당 32장·사진당 하나·확인 조건을 유지하며 선택 구현.
- [ ] 관련 Rust 저장·후보 검사 실행, 데이터 보존 확인.

### Task 4: 검증과 전달

- [ ] 영향 단위·타입/제품 빌드와 버튼 검사를 실행하고 실제 결과 기록.
- [x] 한 번의 독립 코드 검토 후 필요한 결함만 수정.
- [ ] 커밋/PR로 전달하고 미검증 실기기·정확도·백그라운드 범위를 구분.
