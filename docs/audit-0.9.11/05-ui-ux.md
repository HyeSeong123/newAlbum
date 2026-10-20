# 실제 화면 UI/UX 검증 보고서

따뜻한 종이/올리브/감자싹 분위기와 사진 원본 비율을 유지했다. 별도 새 디자인을 도입하지 않았다. 제품 개발 서버와 실제 Android WebView 화면을 확인한 후 판단했다.

## 화면 근거와 범위

| 환경 | 실제 실행 | 검증 상태 |
| --- | --- | --- |
| Chromium 153, 360/390/430px | 홈·사진·앨범·일기·추억·도감·사람/Pet·설정, 빈/데이터 각 캡처 | PASS(가로 넘침 검사), 시각 일치 PARTIAL |
| 같은 브라우저 768/1280/1440px | 같은 화면/fixture | PASS(가로 넘침 검사), 시각 일치 PARTIAL |
| Pixel 7 touch emulation | 길게 누름·이동·스크롤·메뉴/헤더·사진 상세 | 자동화 통과, 실제 OS 키보드 아님 |
| Android API36 x86_64 | APK 설치, native gallery, 저장 권한, WebView, offline AI, 재실행 | smoke 통과, evidence/android 참고 |
| Windows | 브라우저 PC 레이아웃 + 별도 installer CI | 실제 PC 수동 UI/IME/고대비는 미검증 |

전후96쌍 중 동일 dimension94쌍, RGB 차이8 허용에서 완전 일치78쌍이다. 18쌍의 예외는 일기12(글꼴 swap), 빈 홈5(고미 무작위 대사/포즈·2장 높이 변화), 앨범1(표지 이미지 decode 시점)이다. 일기390px 전후를 직접 나란히 확인했으며 배치·버튼 위치는 유지되고 글꼴 렌더링이 다르다. 이 예외를 제품 개선/회귀 수치로 해석하지 않는다. 원본은 `evidence/visual-comparison.json`. 완전한 시각 회귀 승인에는 동적 영역 mask와 실제 사용 글꼴 완료 후 재캡처가 필요하다.

폰트 전체를 명시 preload하는 실험은 파일 일부 요청 NetworkError/timeout으로 폐기했다. 제품/테스트의 기존 document.fonts.ready 대기로 되돌렸고 12개×2단계 캡처 검사를 다시 통과시켰다. 실패한 실험 결과를 정상으로 대체 해석하지 않는다.

## 발견·수정

| 우선순위 | 근거 | 조치·결과 |
| --- | --- | --- |
| P1 | 공통 useRowSelection이 mouse만 처리; 기존 longpress 회귀 재현 | 450ms 정지 후 range 선택, 먼저8px 이동 시 scroll, 손가락 추가 시 pinch 보존. 화면별 새 구현 없이 공통 Hook 보완 |
| P1 | 앨범 입력창에 Tab 경계/복귀 불일치 | useDialogFocus를 편집 창6곳에 재사용. Tab/ShiftTab·취소 후 trigger 복귀 검사 |
| P1 | Android Back이 portal menu를 먼저 소비하지 못함 | focused control에서 Escape 전파, menu preventDefault 후 화면 유지 검사 |
| P2 | 앨범 편집의 개별 click만 지원 | 공통 범위 선택으로 일관화. 취소 후 저장된6장 불변 |
| P2 | menu panel 규칙이 여러 CSS파일에 분산 | 최종 유효 규칙 이동, portal상 불가능한 ancestor 선택자 제거 |
| 확인 | 일기 작성 버튼/더보기 메뉴 | 메뉴가 trigger 근처에 있고 작성 버튼과 겹치지 않음. 기존 위치 버그를 새로 발견했다고 기록하지 않음 |
| 확인 | 사진 즐겨찾기·불필요 메타데이터 | Android 사진 오른쪽 위 빨간 하트, 파일크기/해상도/조회수/PC전체화면 숨김 유지 |

## 상태별 캡처 연결

- 최초/빈/데이터 목록: 전후 매트릭스 각96장. repo에는 대표6쌍, 전체는 별도 증빙 archive.
- 상세/다중선택/메뉴: menu-position, mobile-polish 기존 captures, Android favorite/gallery-three-selected/album-menu/diary-menu.
- 등록/수정: Android horizontal-chapter-editor, horizontal-letter-editor, manual-person-registration, pet-face-region.
- 로딩/오류/권한: gallery-permission-denied, gps-permission-denied, browser recovery 테스트의 DOM 결과. 모든 로딩 프레임을 촬영한 것은 아니다.
- 저장 후 복귀: Android diary-anchored-menu의 저장 안내와 native 재실행 결과, browser diary/photos reload.

## 접근성

| 목표 | 확인 | 판단 |
| --- | --- | --- |
| 키보드·포커스 이동/제한/복귀 | 공통 dialog Tab loop + menu keyboard + tabs wrap | 해당 경로 PASS, 전체 창 조합 PARTIAL |
| 버튼 이름·의미 구조 | getByRole/label locator 및 기존 accessibility 구조 검토 | 부분 검증, 스크린리더 실측 없음 |
| 터치 영역 | menu44px 유지, 모바일 헤더/버튼 겹침·폭 검사 | 일부 PASS, 모든 target WCAG measurement 없음 |
| reduced motion | prefers-reduced-motion 캡처/album 경로 | 부분 검증 |
| 대비·200%/400% 확대·OS 글꼴 확대 | 전체 측정 없음 | NOT TESTED |
| 스크린리더 오류 안내·live region | 일부 role/alert 코드 확인 | PARTIAL, TalkBack/NVDA 미실행 |
| 실제 키보드/IME·safe area | Android 가로 편집·system bars smoke | PARTIAL, 실기기 조합 미실행 |

WCAG2.2 AA 충족으로 선언하지 않는다. 후속 우선순위는 실제 TalkBack/NVDA, 글꼴200%+IME, 대비와 최소 target 실측, 권한 복구·작업 중 화면 이탈 검증이다.

[Android 원본 화면 artifact](https://github.com/HyeSeong123/newAlbum/actions/runs/39411226617/artifacts/12260388401)에서 일기 메뉴·즐겨찾기·권한 화면을 확인할 수 있다. 전후 화면 전체는 별도 제출한 감사 ZIP에 포함한다.
