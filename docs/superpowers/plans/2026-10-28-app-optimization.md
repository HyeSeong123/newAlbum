# 앱 최적화 실행 계획

**Goal:** 0.9.40의 데이터와 품질을 유지하며 중복 AI 저장·초기 UI 로드·반복 계산 비용을 줄이고 0.9.41 APK로 전달한다.
**Architecture:** 기존 Java 모델 정책과 Kotlin 직렬 executor, React 지연 로딩·메모화를 사용한다. 새 의존성·DB 변경은 없다.
**Tech:** React 19, TypeScript, Vite, Java/Kotlin Android, Node, Playwright.
**Spec:** ../specs/2026-10-28-app-optimization-design.md

## Global Constraints

- 원본·SQLite·이름·연결·설정·서명 보존. 현재 모델·임계값·자동 분석 정책 유지.
- 사용자 지시에 따라 필요한 수정을 계속 진행한다. 이미 허용된 게시/APK 작업에 반복 승인을 요구하지 않는다.
- 기준 95d6048, 기존 PR #21의 소스 브랜치에 최종 결합 게시. final 병합과 브랜치 삭제 금지.
- 관련 검증 우선, 전체 CI를 로컬에서 불필요하게 중복하지 않는다.

## Task 1: 구형 모델 저장 정리

- [x] 실제 Java 정책을 호출하는 저장 안전 검사를 추가하고 실패를 확인한다.
- [x] `retireLegacyFiles(File appFiles, boolean currentVerified, long verifiedMtime, Runnable beforeDelete): long` 구현: 검증된 현재 파일 존재/크기/경로 확인, 정확한 구형 파일 및 부분 파일만 제거, 해제 후 현재 metadata 재확인.
- [x] Kotlin executor에서 시작·상태·다운로드 성공 시 정리를 예약하고 진행 중 대화와 겹치지 않게 한다. 실행 시 모델 재선택, 실패 backoff 60초.
- [x] 모델 정책·저장·세션 검증. Expected: 관련 Node 4개 통과.

## Task 2: UI 로딩과 반복 계산

- [x] Home에서 PeopleWorkspace를 요청하지 않는 검사와 지연/실패 후 탐색 검사를 먼저 실행한다. Expected: 기존 eager import에서 실패.
- [x] PeopleWorkspace lazy/Suspense 및 작은 오류 경계. 기존 숨김·진행 중 유지 조건 보존.
- [x] App 사진 서명 `[items]`, Library 지역 대상 `[items, selectedIds]` 메모화, 빈 선택 즉시 빈 배열.
- [x] PC/모바일 새 로딩·분석 수명·지역 수정 검사, 모바일 화면 확인. Expected: 변경 흐름 통과.
- [x] 같은 Vite 빌드 조건으로 초기 JS 전후 바이트 비교. 모델/Worker 수치는 초기 UI 개선 수치와 구분한다.

## Task 3: 검증·게시·APK

- [x] 버전 0.9.41 동기화, 타입/제품 번들/관련 단위 검증.
- [x] 전체 변경에 대해 새로운 컨텍스트의 리뷰 1회. 중요한 문제는 재현→수정 후 검증.
- [ ] 기존 PR #21 브랜치의 예상 SHA를 확인해 결합 게시하고 설명을 최종 소스로 갱신.
- [ ] 소스 CI와 Android 영구 서명/설치 검사를 확인하고 APK를 전달한다.

## Review Focus

현재 모델 검증 증명과 삭제 사이의 파일 변경, 심볼릭 링크 및 디렉터리 경계, 구형 모델만 설치한 오프라인 사용자, 다운로드/대화/정리 executor 순서, 반복 실패 시 release 폭주, 지연 UI 로드 실패의 전체 앱 전파, 인물 분석 중 화면 전환에 따른 unmount, 선택 변경/음성 제외/정렬 순서, 기존 0.9.40 인식 개선과 버전·서명의 보존을 각각 확인한다.
