# 미사용 코드 정리 보고서

TypeScript의 `strict`, `noUnusedLocals`, `noUnusedParameters`를 켠 기존 `tsc`를 그대로 실행했다. 미사용 변수·매개변수·import 진단은 0개다. 앱 진입점에서 AST import/export·동적 import·Worker URL을 추적하고, 진입 그래프 밖 후보를 테스트·스크립트·Rust·SQL까지 검색했다. 모든 미사용 export를 증명한 검사는 아니다.

| 유형 | 발견·결정 | 근거 |
| --- | --- | --- |
| 1. 완전히 미사용 | `AlbumContentsList` 삭제 | main 진입 그래프와 전체 TS/테스트/스크립트에서 호출/import 없음. 현재 앨범은 `AlbumsView` → `AlbumFullscreenReader` 사용. 기존 `album-portrait.spec.ts`는 옛 사진 목록이 없는 흐름을 명시적으로 검사 |
| 1. 완전히 미사용 | `album-contents-list.css` 삭제 | 유일한 import가 삭제 컴포넌트였음. 이 파일과 `albums.css`의 옛 목록 선택자를 함께 확인 |
| 2. 중복 | 포커스 초기화/복귀·Tab 경계 통합 | Entity/일기의 별도 구현을 `useDialogFocus`로 재사용. 누락돼 있던 앨범 생성/편집·글 편집·가져오기에도 적용 |
| 2. 중복·효력 없음 | portal 메뉴 CSS 통합 | body 또는 fullscreenElement에 렌더되므로 카드/toolbar 부모를 요구하는 선택자는 적용 불가. 전후 메뉴 캡처와 위치 테스트로 확인 |
| 3. 연구 | `features/ai/native/**`, `ai/protocol.ts` 보존 | 별도 학습·Worker·저장소 테스트에 사용. 제품 진입 그래프/출시 자산에서 제외되는 것과 연구 삭제는 다름 |
| 3. 연구·검증 | `faceAlignment.ts`, `poseGeometry.ts` 보존 | 512 정렬/자세 연구의 수학 회귀와 과거 기록 타입에서 참조. 해당 가중치·추론을 되살리지 않음 |
| 4. 호환성 | 512차원 타입·person_model_feature·과거 자세 JSON 보존 | 기존 ID·수동 연결·마이그레이션 이력 보존. 현재 512 비교/QuadPose 생성 금지 검사를 유지 |
| 4. 테스트 계약 | `albumListContents` 보존 | `album-content.test.mjs`가 글/챕터·사진 순서와 구형 내용을 검증. 컴포넌트 삭제에 맞춰 테스트를 제거하지 않음 |
| 5. 조건부 | Kotlin·Windows·개발 평가·benchmark 보존 | 설치 앱/플랫폼/DEV에서만 실행되거나 실제 Worker 평가 테스트에서 import |
| 6. 동적·외부 계약 | `pets/engine/index.ts`, Rust 등록 명령 보존 | 엔진 공개 export·외부 소비 가능성은 앱 정적 그래프만으로 부정할 수 없음. 등록 명령은 capability·테스트·DB와 함께 검토 |

새 미사용 판정 때문에 사람/Pet 인식 기능이나 데이터 테이블을 삭제하지 않았다. 직접 의존성도 실제 참조가 있으므로 제거하지 않았다. 동적 클래스·SVG·Android 클래스·타입 전용 import는 미참조 문자열만으로 삭제하지 않았다.

실제 삭제 파일은 위 2개다. 실제 삭제 함수는 `AlbumContentsList` 컴포넌트 함수이며, 다른 사용 중인 함수의 이름 변경·이동을 삭제 실적으로 세지 않았다. 제거한 내부 JSX 콜백은 이 컴포넌트에만 속한다. `useRowSelection`의 이벤트 처리와 포커스 코드 통합은 동작 보강/중복 제거이며, 기능 삭제가 아니다.

전체 후보 원자료: [모듈 그래프](evidence/inventory/gamjassak-module-graph.json), [CSS 후보](evidence/inventory/gamjassak-css-inventory.json). 문자열 후보 86개 중 이번 변경으로 확인하지 않은 항목은 삭제하지 않았다.
