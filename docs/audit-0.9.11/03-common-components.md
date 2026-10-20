# 공통화 보고서

| 기존 구조 | 최종 구조 | 유지보수 효과 |
| --- | --- | --- |
| Entity/일기의 focus 복귀와 Tab 처리 중복, 앨범 창 일부 누락 | `useDialogFocus` | 하나의 visible/enabled focusable 판정, fieldset disabled·숨김·textarea·링크 포함. 취소 시 열었던 버튼으로 복귀. 화면별 데이터/저장은 그대로 |
| 공통 `useRowSelection`이 마우스만 처리 | 같은 Hook에 정지 450ms 길게 누르기 추가 | 갤러리·사람·Pet 등록·수동 연결·결과 선택·기록 격자에 같은 규칙 적용. 8px 이상 먼저 움직이면 선택하지 않고 스크롤 보존 |
| 앨범 편집 사진만 개별 click 토글 | `useRowSelection` 재사용 | 기존 선택 집합과 삭제/취소 의미 유지, PC drag와 휴대폰 길게 누르기 지원 |
| 공통 메뉴 패널이 세 CSS 계층에서 재정의 | `components/action-menu.css` | 최종 유효한 규칙을 한곳에 둠. portal 위치 계산은 `ActionMenu`가 그대로 담당 |
| Android Back이 dialog 존재 여부만 확인 | focused control에서 Escape 전달 후 소비 여부 확인 | 열린 관리 메뉴가 먼저 닫히고, 그다음 창/화면 단계로 돌아감 |

신규 공통 컴포넌트는 없다. 신규 공통 Hook은 `useDialogFocus` 1개다. 만능 Form/Dialog 옵션 체계나 새 상태관리 라이브러리는 추가하지 않았다.

기존 모듈의 결정:

- `ActionMenu`, `MainNavigation`: 위치/숨은 메뉴 화살표를 유지. 메뉴 portal 스타일만 통합.
- `EntityEditorDialog`, `EntityPhotoPicker`: 사람·Pet의 공통 편집/수동 사진 연결을 유지. 저장 잠금·오류 보존·자동 연결 사진 비활성화 차이를 유지.
- `MediaVisual`, `FavoriteBadge`, `EmptyState`: 원본 비율·오른쪽 위 빨간 하트·다음 행동 안내를 계속 재사용.
- `useRowSelection`: 포인터와 터치 리스너 해제를 동일 수명주기에 둠. React 19 callback ref cleanup을 사용하며 비활성화/언마운트 시 타이머와 리스너를 정리.
- `useModalBehavior`: Escape/좌우 이동·modal stack·body scroll 수명주기 담당. 포커스와 데이터 저장 책임을 합치지 않음.
- `useMediaSelection`: 갤러리 선택 ID 보존·대량 토글·목록 삭제 시 정리 책임 유지.

공통화하지 않은 부분:

| 대상 | 이유 |
| --- | --- |
| 일기/앨범/지역/사람/Pet 전체 입력 Form | 사진·글 페이지·위치·개체 ID 및 저장 계약이 달라 조건 옵션을 늘리면 더 복잡해짐 |
| 사진 상세의 확대·재생·nested zoom 포커스 | 비디오/오디오와 별도 확대창의 수명주기가 있어 이번 범용 편집 창과 무리하게 합치지 않음 |
| 지역 지정 | inline 입력이며 항상 modal이 아님 |
| 일기 사진 추가 | 외부 파일 가져오기와 6장 상한. 등록 사진 membership picker와 저장 방식이 다름 |
| AI 대기열 | 사람/Pet 저장 계약과 실패 복구가 다름. 계산 예산은 기존 AI scheduler가 이미 공통 관리 |

선택 Hook의 코드량은 터치 취소·pinch·스크롤 보존을 처리하면서 늘었다. 이를 코드 단순화 수치로 포장하지 않는다. 공통 Hook 한곳의 검증으로 여러 화면에 누락된 동작을 제공하는 이점이 있다. CSS/미사용 화면 제거와 포커스 중복 제거가 실제 구조 단순화다.
