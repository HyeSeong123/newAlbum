# CSS 최적화 보고서

CSS 34개 파일을 파싱하고 공통 네 파일의 반복 선택자·기능별 문자열 참조를 조사했다. 183개 반복 선택자와 86개 미참조 후보를 발견했다. 반응형·상태·specificity 차이를 포함하므로 자동 삭제 근거로 삼지 않았다.

실제 변경:

1. `ActionMenu` 패널의 최종 유효 스타일을 `components/action-menu.css`로 이동했다. z-index 2000, 200px 최소 폭, 44px 버튼, 줄바꿈/위치 계산을 유지했다.
2. body/fullscreen portal 때문에 적용 불가능한 `.peopleActions .actionMenuPanel`, `.albumJournalTools .actionMenuPanel`, `.savedAlbumFooter .actionMenuPanel`, 카드 `:has(.actionMenuPanel)` 등을 제거했다.
3. 호출 없는 `AlbumContentsList.tsx`와 `album-contents-list.css`를 삭제했다. `albums.css`·`mobile-controls.css`에 남은 `.albumPhotoList`, `.albumPhotoName`, `.albumJournal.is-list` 규칙도 제거했다.
4. 남은 버튼·하트·Android·반응형 규칙의 로딩 순서와 디자인 토큰은 유지했다. 활성 breakpoint 변경은 없다. 미사용 목록에만 속하던 미디어쿼리 규칙을 제거했다.

삭제/통합한 기존 규칙은 31개이며, 전용 CSS 파일의 선택자는 별도 목록에 기록했다. 전체 선택자는 [삭제 내역](evidence/deleted-css.json)을 참조한다. 메뉴 규칙의 재배치는 삭제된 UI가 아니라 통합으로 분류한다. 미사용 albumPhotoList의 `!important` 1개를 함께 제거했다. 나머지 `!important`나 전체 breakpoint를 일괄 변경하지 않았다.

| 실제 제품 산출물 | 수정 전 | 수정 후 | 차이 |
| --- | ---: | ---: | ---: |
| 전체 CSS 파일 합계, 비압축 | 213,260 bytes | 211,000 bytes | -2,260 bytes (-1.06%) |

미사용 컴포넌트 전용 CSS는 처음부터 번들에 없었으므로 그 소스 크기를 번들 절약으로 세지 않았다. 실제 번들 감소는 이미 로드되던 오래된 규칙과 중복 제거에서 발생했다. gzip 및 파일별 값은 `evidence/gamjassak-baseline-bundles.json`, `gamjassak-final-bundles.json`에 기록한다.

같은 고정 날짜·fixture·브라우저·뷰포트로 별도 기준 checkout과 수정 checkout을 캡처했다. 360/390/430/768/1280/1440px의 빈/데이터 화면 96쌍과 메뉴 전후 캡처를 비교한다. 상세 비교 수치와 예외(고미의 시각별/무작위 동작)는 UI/UX 보고서 및 `evidence/visual-comparison.json`을 따른다. 픽셀 비교만으로 터치/키보드/접근성 전체를 승인하지 않는다.
