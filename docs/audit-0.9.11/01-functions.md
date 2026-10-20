# 전체 기능 점검 보고서

2026-10-20. 기준 655363a, 제품 0.9.11. 운영 사진/DB를 사용하지 않고 임시 DB·저장소·fixture만 사용했다. PASS는 표의 시험 범위에 한정한다. PARTIAL은 일부 경로만 실행하거나 실제 플랫폼·규모 조건을 충족하지 못함, FAIL은 현재 실패 재현, NOT TESTED는 실행 근거 없음이다. 코드 검토만으로 PASS를 부여하지 않았다.

## 실행 근거

- 로컬 전체 Playwright: 412 PASS / 44 SKIP / 0 FAIL / 0 flaky, 456 cases. 원본 `evidence/gamjassak-final-browser.json`에는 파일·case·프로젝트·실행 시간·skip 사유가 있다. skip은 PASS가 아니다.
- 기준 전체 검사 371 PASS / 28 SKIP / 13 FAIL. 오래된 문구·접근 경로·모바일 메타데이터 기대와 잘못된 mock을 수정했다. 기능 검증을 삭제하지 않았다. 신규 회귀 검사는 원본에서 4 FAIL / 2 PASS / 2 SKIP였고 수정 후 통과했다.
- Node 단위 144, Python 22 통과. Rust 116 통과는 GitHub Source validation에서 실행했다. 로컬 cargo/adb가 없어 해당 결과와 구분했다.
- Android: [빌드·API 36 x86_64 설치·오프라인 smoke 성공](https://github.com/HyeSeong123/newAlbum/actions/runs/39411226617). 테스트 커밋 bf2fdff. 이후 제품 변경은 없고 테스트·Windows checkout 설정만 변경했다. ARM64 실기기 결과가 아니다.
- 6개 폭 × 빈/데이터 × 주요 8화면 = 전후 각 96장. 별도 메뉴·상세·오류·등록 화면 캡처도 보관한다. 모든 화면의 10상태를 6개 폭에서 전부 촬영했다고 주장하지 않는다.

## 기능별 판정

| 화면·기능 | 실제 방법·근거 | 결과 | 문제·수정 및 미검증 범위 |
| --- | --- | --- | --- |
| 최초 실행·안내·재실행 | onboarding-empty, branding, usability-recovery | PASS | 기존 일기/사람 데이터의 비동기 로드 후 안내 억제, 안내 닫힘 복원; 실제 이전 사용자 DB 전체는 미사용 |
| 홈·상하단 탐색·숨은 메뉴 | app, mobile-layout, mobile-polish, 6폭 캡처 | PASS | 숨은 탭 화살표·가로 탐색 및 PC 키보드 확인 |
| 검색·날짜/즐겨찾기 복합 필터 | search-diary, photo-date-navigation | PASS | 잘못된 날짜·역순 범위와 초기화 확인 |
| 화면 전환·Android Back | audit-regression + Android system-bars smoke | PARTIAL | 열린 포털 메뉴부터 Escape 소비하도록 수정; 모든 Android OS/제조사 제스처는 미검증 |
| 로딩·오류·재시도 | usability-recovery, memory-map-v2 | PASS | 초안/필터를 보존하며 실패만 재시도하는 fixture 경로 |
| 고미 표시·대사·포즈·호감도 1~6 | gomi-behavior, characters, branding + Android guide 캡처 | PARTIAL | 모델/상태 단위 및 일부 UI 검증; 6단계 모든 포즈의 실기기 조합은 미검증 |
| 사진·동영상 가져오기 | Android gallery-smoke 및 video-playback-imported/restart | PASS | 사진2·영상1 native picker/관리 저장·재실행 확인; 지원하지 않는 형식 숨김 |
| 음성 가져오기·오류 재생 | media-playback 단위 + 코드 계약 | PARTIAL | 파일/오디오 소스 분류 확인; 실제 Android 음성 가져오기·재생은 미검증 |
| 파일·폴더 가져오기 | onboarding filechooser, export/import browser, Rust | PARTIAL | 브라우저 파일·mock native 경로 확인; Windows 실제 폴더 OS 선택은 별도 패키지 검사 필요 |
| 대량 가져오기·중복·부분 실패 | audit-regression, usability-recovery | PARTIAL | 100개 개 경로+100개 고양이 경로 mock200건. 성공분 보존·재시도 중복 방지; 200개 독립 실제 사진 복사/정확도는 미검증 |
| 진행률·취소 | Android gallery-smoke, useMediaLibrary 코드 | PARTIAL | 선택창 취소·권한 거부 시 기록 불변. 실제 복사 진행 중 취소 기능은 없음(P2 후속). 안전한 롤백 없이 취소를 추가하지 않음 |
| 갤러리·정렬·필터·날짜별 조회 | app, photo-date-navigation, timeline, calendar | PASS | 200개 fixture와 페이지·선택/필터 경계 |
| 사진 상세·확대·이동 | app, photo-list-ratios, mobile-layout | PASS | fixture 상세/원본 비율/중첩 사진 이동; 실기기 모든 pinch 조합 미검증 |
| 즐겨찾기 하트·Android 메타데이터 숨김 | mobile-polish + Android mobile-photo-favorite.png | PASS | 오른쪽 위 빨간 하트. 크기/해상도/조회수/PC 전체화면 비노출 확인 |
| 제목·평점·댓글 | photo-titles, mobile-layout, feature-models | PARTIAL | 제목 저장/실패 초안/경합·평점 모델 확인. 모든 댓글 편집 조합 직접 검증은 미완료 |
| 내보내기·원본 다운로드 | export-media, photo-download, Rust | PARTIAL | 고유 원본·취소·재시도·바이트·이름 확인. Windows OS 실제 export는 미검증 |
| 미디어 삭제·연결 정리 | mutations, album-content, Rust DB tests, journal-preview | PASS | fixture 삭제 후 앨범 연결/빈 상태; 원본 사용자 파일은 접근하지 않음 |
| 다중선택·길게 누른 뒤 drag | audit-regression, mobile-layout/polish + Android gallery-smoke | PASS | 450ms·8px 경계 적용, 스크롤/짧은 탭/중복 클릭 및 PC drag 보존 |
| 손상·없어진 원본·재생 실패 | calendar, media-playback, source audit, usability-recovery | PARTIAL | 대체 썸네일·변경된 원본·재시도 확인. 실제 손상된 모든 codec 재생 미검증 |
| 앨범 생성·편집·삭제·색/표지 | album-colors, app, journal-preview, usability-recovery | PASS | 색 복원/흰 종이 유지/저장 실패 초안, 삭제·비우기 |
| 앨범 사진 추가/제거/정렬 | journal-preview, album-content, audit-regression | PASS | 고유 ID·순서 유지, 범위 선택/취소 원본6장 보존 |
| 앨범 페이지·애니메이션·글·일기 연결 | search-diary, journal-preview, Android horizontal editor | PASS | immersive reader·중첩 상세·페이지 위치·글/챕터 편집·회전 관련 검사 |
| 앨범 빈/1장/대량·모바일 회전 | app + Android installed-album + 구조검토 | PARTIAL | 빈/소수·가로 편집 확인; 수천장 앨범의 실제 기기 장시간 넘김은 미검증 |
| 일기 CRUD·월/날짜/검색·날씨/감정 | search-diary, diary-photos, usability-recovery | PASS | 저장 실패·중복 submit 차단·초안 보존·취소·레거시 text 일기 저장 시 변환 |
| 일기 사진6장·앨범 연결 | diary-photos, search-diary | PASS | 재시작 유지·사진1장 분리·앨범의 일기 표시 |
| 일기 다중선택·이동 | search-diary, diary-model | PARTIAL | 자동화 범위만 승인; 실제 OS 키보드 중 이동 조합 미검증 |
| 일기 더보기·추가 버튼 | menu-position + Android diary-anchored-menu | PASS | 스크롤 후 버튼 기준 위치·메뉴 클릭/키보드, 작성 버튼 겹침 없음 |
| 입력 중 화면 이동·키보드 | usability-recovery + Android bounded/full-frame | PARTIAL | 초안 실패 보존·가로 편집/화면 프레임; 실기기 IME·글꼴200% 조합 미검증 |
| 달력 월/연도·선택·빈 날짜 | calendar, timeline | PASS | 현재 월·완전한 주·사진 count·day popup 및 오류 저장 |
| 일정/D-day | app의 비노출 검사·코드 확인 | PARTIAL | 현 제품 달력은 일정/D-day 제어를 노출하지 않음. 이번 작업으로 기능을 복원/추가하지 않음 |
| 타임라인·날짜 기록·추억 | timeline, memories, memory-map-v2 | PASS | 날짜 묶음/개수·일기/메모·사진 상세 연결 |
| 지도 지역·수정·GPS 없음/오류 | map-district, memory-map-v2, usability-recovery + Android gps | PASS | 미분류·기존 지역 code 보존·수동 수정·권한 거부·원본 복원 |
| 여행 분류·앨범 제안 | trip-discovery | PASS | 방문 분리·2장 후보 제외·제안은 확인 전 자동 저장 안 함 |
| 지도 빈/대량·페이지 선택 | memory-map-v2 | PARTIAL | 페이지 쿼리/mock 대량·필터 변경 선택 정리. 천장 실기기 렌더 성능 미검증 |
| 사람 등록/이름·직접 사진/미탐지 등록 | people, people-controls, usability-recovery + Android manual-person | PASS | 이름 실패 초안·표지 보존·기존 개체 직접 연결·미탐지 재학습 |
| FaceAPI 128·랜드마크·방향 | person-detection, recognition-094, person-runtime smoke | PASS | 실제 offline fixture 3얼굴128 유효·CPU/WASM 비교·기하 방향 단위. 사람별 인식 정확도 미측정 |
| 사람 후보·이름 없음·이동/제외 | people, person-validation, Rust | PASS | 선택한 후보만 적용, split/move/이름/사진 연결 보존 |
| 사람 재분석·중단/재시작·실패 | people, person-validation, audit-regression | PASS | 불량 batch 응답의 무한 반복을 오류로 종료하도록 수정, 기존 저장 사진/이름 유지 |
| Pet 개/고양이 등록·이름/표지 | pets, people-controls, usability-recovery | PASS | 편집/등록 실패 보존·공통 관리 위치 |
| Pet 탐지·MobileNet 외형·고양이 보조 | pet-recognition, pet-engine, pet-cat-face smoke | PASS | 실제 개/고양이 fixture offline 추론 및 WASM fallback; 개체 정확도 미측정 |
| Pet 직접 연결·영역·방향·뒷모습 | pets, pet-pose, Android face-region/relearning | PARTIAL | 수동 crop/방향과 rear identity 제거 모델 확인. 다양한 실제 뒷모습 집단 비교 미검증 |
| Pet 결과 확인/수정·다중선택·재분석 | pets, mobile-polish, pet-recognition | PASS | 사용자 확인·기존 연결·영역 보정 및 재분석 저장 계약 |
| Pet 중단·재개·기존ID | pets, pet engine + Rust pet_jobs | PASS | 영속 대기열·실패/재시도·기존 ID/수동 연결 유지 |
| 가져오기 후 Pet 자동분석 금지 | audit-regression의200건 가져오기 | PARTIAL | worker/queue 자동 실행0. 실제 독립 개100+고양이100 사진 가져오기는 미검증 |
| 설정·데이터 초기화·재시작 복원 | app, mutations, diary-photos, Rust | PASS | 등록 데이터 비우기·disabled·fixture 복원; 사용자 원본/DB에는 실행하지 않음 |
| DB 마이그레이션·기존 연결 | Rust116·Python22·legacy diary tests | PARTIAL | 임시 DB 및 구형 데이터 fixture 검사; 실제 사용자의0.9.11 DB를 복사해 업그레이드는 미검증 |
| Android 저장 권한/로컬 접근/재실행 | Android gallery/security/video/system bars | PASS | API36 x86_64 emulator에서 실행, 다른 OS/제조사 미검증 |
| Android 실제 업데이트/재설치 보존 | 이 환경에서 실행 안 함 | NOT TESTED | 같은 서명 update와 uninstall/reinstall을 구분해야 함. 삭제 후 자동 복원 보장 불가 |
| Windows 설치/업데이트·데이터 유지 | Windows package CI | PARTIAL | Windows runner에서 full/update NSIS 설치·미디어/앨범/글/재생/WebView seed기록 보존 성공. 실제 이전 사용자 DB의 사람/Pet 연결·수동확인은 미검증 |

## 남은 실행 제한

PASS를 합산해 제품 전체 PASS로 변환하지 않는다. Android smoke에 없는 음성·200개 독립 동물 사진·실제 이전 DB·ARM64 메모리/발열·실제 업데이트·스크린리더·모든 화면 10상태×6폭은 미검증이다. 모든 기존/신규 자동화 case의 개별 실행 결과는 원본 JSON을 기준으로 추적한다.
