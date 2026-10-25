# 홈 캐릭터 연속 표시와 모바일 목록 밀도

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 캐릭터 터치·함께하기에서 그림이 반짝이지 않고, 모바일 내 앨범·일기 목록은 한 줄에 두 개씩 표시한다.

**Architecture:** 기존 React/Motion 캐릭터 노드를 유지하며 반응 애니메이션만 다시 실행한다. 고미의 새 그림은 디코딩 후 교체하고 AI 대기 표시의 자리를 고정한다. 목록은 기존 CSS 범위에서만 두 열과 작은 카드 치수를 적용한다.

**Tech Stack:** React 19, Motion, TypeScript, Vite, Playwright.

**Spec:** 사용자의 이 대화 두 요청. 기존 디자인·캐릭터·SQLite·사진·앨범·일기·친밀도·AI 모듈·서명은 보존한다.

## Global Constraints

- `final`의 별도 세션 체크아웃에서 직접 수정한다. 새 브랜치를 만들지 않는다.
- 개발 단계 경량 검증 정책에 따라 관련 화면과 빌드만 로컬 검증한다.
- 모바일 320/393/720px에서 두 열·긴 제목·44px 메뉴·가로 넘침을 확인한다.

## Review Focus

- 빠른 연속 터치에서도 원래 그림이 유지되는가.
- 느린 고미 그림 로딩 중 이전 그림이 유지되는가.
- 움직임 줄이기에서 반응·대사·친밀도 규칙이 유지되는가.
- 두 열에서 긴 제목과 메뉴가 겹치거나 도움말에 가려지지 않는가.
- 사진 유무에 따른 일기 높이와 열 정렬이 적절한가.

### Task 1: 캐릭터 반짝임

**Files:** `CharacterVisual.tsx`, `GomiVisual.tsx`, `HomeView.tsx`, `home.css`, `tests/companion-chat.spec.ts`.
**Interfaces:** 기존 CharacterVisual/HomeView props와 네이티브 명령은 유지한다.

- [x] 터치·함께하기의 실제 그림 연결/불투명도/AI 표시 중 위치 및 느린 이미지 로딩을 재현한다.
- [x] 반응별 노드 재생성과 고미 fade-out/in을 제거하고 Motion controls로 반응을 재생한다.
- [x] 새 고미 그림은 디코딩 후 교체한다. AI 대기 상태의 행 높이는 항상 유지한다.
- [x] 같은 시나리오와 기존 터치 AI 흐름을 확인한다.

### Task 2: 모바일 목록

**Files:** `album-library.css`, `diary.css`.
**Interfaces:** 목록의 열·간격·미리보기 치수만 변경하며 저장·선택·열기·메뉴 동작을 유지한다.

- [x] 320/393px의 수정 전 목록 캡처와 카드 크기를 기록한다.
- [x] 모바일 두 열, 작은 일기 미리보기, 긴 제목·메뉴를 정리한다.
- [x] 320/393/720px와 데스크톱에서 실제 열기·더보기·선택 및 넘침을 확인한다.
- [x] 빌드·관련 검사·변경 묶음 코드 검토를 완료하고 0.9.31로 올린다. 업로드와 APK 설치 검사는 후속 커밋·Actions 결과로 확인한다.
