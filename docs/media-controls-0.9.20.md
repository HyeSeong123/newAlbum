# 감자싹 0.9.20 — 동영상 미리보기·메뉴 아이콘·정렬

기준: `feature/app-ux-20261023`의 0.9.19. 구현 커밋 `483cbce0d092b2f4982c9e5eb3bdcd34367475be`. 재생 스트림 테스트 데이터와 혼합 앨범 검사 보완: `52e746a`, `f41c3b9`.

| 화면 | 버튼/기능 | 사용자 기대 동작 | 기존 실제 동작 | 문제점 | 개선할 버튼 이름 | 개선 위치 | 수정 결과 |
|---|---|---|---|---|---|---|---|
| 사진 목록·공통 미디어 카드 | 동영상 미리보기 | 영상을 열기 전에 내용을 구분 | 사진만 썸네일 요청, 동영상은 빈 배경 | 높음: 동영상 구분 어려움 | 영상 표시는 유지 | 기존 카드 내부 | Android 네이티브 프레임 추출·캐시, 브라우저 프레임 추출 대체 경로, 실패 시 동영상 아이콘 |
| 우측 상단 전체 메뉴 | 8개 메뉴 | 아이콘과 이름으로 이동할 곳 찾기 | 현재 화면에만 체크, 나머지 아이콘 없음 | 보통: 메뉴를 글자로만 구분 | 기존 메뉴 이름 유지 | 기존 메뉴 버튼 옆 | 홈·사진 기록·내 앨범·일기장·추억·새싹 도감·사람과 반려동물·설정 각각 아이콘, 현재 화면 강조 |
| 사진 기록 | 촬영일 정렬 | 촬영 날짜를 기준으로 최신/오래된 순 | ‘날짜’가 어떤 날짜인지 모호 | 보통: 기준 혼동 | 촬영일 최신순 / 촬영일 오래된순 | 기존 정렬 선택란 | 명칭 명확화, 날짜별 보기 유지 |
| 사진 기록 | 등록일 정렬 | 앱에 등록한 순서로 확인 | 선택지 없음 | 높음: 최근 가져온 기록 찾기 어려움 | 등록일 최신순 / 등록일 오래된순 | 기존 정렬 선택란 | SQLite 기존 created_at 전달, 별도 날짜 생성·기존 데이터 변경 없음 |
| 사진 기록 | 별점 정렬 | 높은 별점부터 화면에 표시 | 정렬 후 촬영일 재그룹으로 순서가 바뀔 수 있음 | 높음: 선택한 순서와 결과 불일치 | 별점 높은순 | 기존 정렬 선택란 | 등록일·별점·댓글·이름 정렬은 재그룹·대표 사진 재배치 없이 순서 유지 |

## 공통 보존 사항

원본 파일, 등록된 인물·반려동물 연결, 앨범 순서, 즐겨찾기, 별점, 댓글을 보존한다. 데이터베이스 스키마 변경 없이 이미 저장된 등록일을 사용한다. 기존 댓글순·이름순과 데스크톱 조회수순을 유지한다. 모바일 메뉴의 위치·탭 공간과 기능별 도움말 방식을 유지한다.

동영상 프레임은 화면 가까이에 있는 카드부터 요청하며, 동시에 최대 2개를 처리한다. Android 캐시는 파일 경로·크기·수정 시간을 구분한다. 브라우저 대체 경로는 한 프레임을 추출한 뒤 재생 자원을 해제한다. 지원되지 않거나 손상된 영상에는 빈칸 대신 동영상 아이콘을 표시한다.

## 수정 파일

- 썸네일: `src/components/MediaVisual.tsx`, `src/features/media/videoThumbnail.ts`, `src/design-system.css`, `src-tauri/src/thumbnails.rs`, `src-tauri/src/android_media.rs`, `src-tauri/android/GamjassakMediaPlugin.kt`.
- 메뉴: `src/App.tsx`, `src/components/ActionMenu.tsx`, `src/components/action-menu.css`.
- 정렬·등록일: `src/features/media/LibraryView.tsx`, `src/features/media/collectionModel.ts`, `src/features/media/browserImport.ts`, `src/services/tauriMediaService.ts`, `src/types/media.ts`, `src-tauri/src/lib.rs`.
- 검증: `tests/media-controls.spec.ts`, `tests/feature-models.test.mjs`, `scripts/smoke-android.mjs`, `scripts/app-ux-smoke.mjs`, `playwright.app-ux.config.ts`, `.github/workflows/app-ux-validation.yml`.
- 버전: `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`.

## 검증 기록

- 로컬 단위 테스트: 150개 통과.
- 로컬 SQLite/Python 테스트: 24개 통과.
- TypeScript 검사, Vite 빌드, 버전 일치 검사 통과.
- 모바일/데스크톱 브라우저: 232개 통과, 실패·불안정 테스트 0개. 플랫폼별 조건부 검사 26개는 해당하지 않는 환경에서 건너뛰었으며 반대 플랫폼에서 별도 검사한다. 실행: https://github.com/HyeSeong123/newAlbum/actions/runs/39887600156
- Android API 36 x86_64 에뮬레이터: 실제 설치 검증 통과. 동영상 프레임·재생·탐색·재시작, 메뉴 아이콘, 실제 SQLite 등록일·별점 정렬, 선택·뒤로 가기, 사진/동영상 혼합 앨범, 일기, 인물·반려동물 연결 보존 통과. 실행: https://github.com/HyeSeong123/newAlbum/actions/runs/39887844202

브라우저 검증은 IPC 모의 데이터를 사용하며 Android 네이티브 처리 확인과 구분한다. 실제 휴대전화의 제조사별 코덱, 손상된 모든 동영상 형식, TalkBack 수동 조작은 이 환경에서 검증하지 못한다.

## 설치 파일 확인

- 파일: `Gamjassak-0.9.20.apk`
- 크기: 327,864,878바이트. ABI: `arm64-v8a`. 버전 코드: `9020`.
- 앱 ID: `com.oraedameun.album.next`.
- APK SHA-256: `af1daed519b9520ade7eb617f59c15a7f918810996f2d62ed5bd4594766fddec`.
- 서명 인증서 SHA-256: `1e63dd9f0e9ee481875de0cabe4ba479720ceee6c4c0f088cc383a6685f67ba1` (0.9.19와 동일).
- APK 및 Android 검증 소스: `f41c3b976877b1cb8d039153205e08eeaed9c58d`. 브라우저 검증 소스: `52e746afd2e3ae95739d0f634be033460f332e90`. 두 소스의 앱 코드는 동일하며 차이는 Android 검사 스크립트뿐이다.
- 변경 전후 모바일 브라우저 캡처와 실제 설치 앱 캡처는 함께 제공하는 HTML 검증 보고서에 포함했다.
