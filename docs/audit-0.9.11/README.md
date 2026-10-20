# 감자싹 0.9.11 출시 기반 감사

2026-10-20 · 기준 `655363a475c7748f57a819b44e835ff2ffd715f0` · branch `feature/gamjassak-audit-refactor` · [리뷰 PR #18](https://github.com/HyeSeong123/newAlbum/pull/18)

실제 코드 수정·공통화·정리를 완료했고, 자동화 및 Android emulator에서 재검증했다. 최종 판정은 **CONDITIONAL PASS**다. 미검증 기능을 정상으로 세지 않았다. 안정 브랜치 병합/버전 변경/연구 모델 활성화/사용자 사진·DB 변경은 하지 않았다.

## 보고서

1. [전체 기능 점검](01-functions.md)
2. [미사용 코드 정리](02-unused-code.md)
3. [공통화](03-common-components.md)
4. [CSS 최적화](04-css.md)
5. [UI/UX·스크린샷·접근성](05-ui-ux.md)
6. [성능 비교](06-performance.md)
7. [PM 독립 검토와 출시 판정](07-pm.md)

[실제 아키텍처·데이터 흐름](architecture.md), [변경 파일/커밋](changes.md), [전후 비교](evidence/visual-comparison.json), [전체 browser 실행 원본](evidence/gamjassak-final-browser.json).

## 실제 변경

- 공통 사진선택에 길게 누른 뒤 drag를 추가하고 빠른 swipe scroll/PC drag를 유지.
- 편집 창 focus trap/복귀 공통 Hook과 album editor 범위선택 재사용.
- Android Back에서 열린 메뉴 우선 닫기, 잘못된 IPC cursor 무한반복 방지.
- 사용되지 않는 AlbumContentsList 및 전용CSS 제거, portal menu CSS 통합.
- 전체 browser회귀를 CI에서 실행, Windows 보안test의 Linux경로 의존성과 release inventory CRLF 변환 해결.

## 검사 결과

| 명령/환경 | 결과 |
| --- | --- |
| npm ci | PASS, lockfile/dependencies 변경 없음 |
| npm run version:check | PASS 0.9.11 |
| npx tsc --noEmit | PASS |
| npm run test:unit | PASS 144 |
| python3 -m unittest discover -s tests -p 'test_*.py' | PASS 22 |
| cargo test --manifest-path src-tauri/Cargo.toml --lib --locked -j 2 | PASS 116, GitHub Linux CI. 로컬cargo 없음 |
| npm run build | PASS |
| npm run ai:release:check | PASS. 권리 미해결 기록 유지 |
| npm run ai:native:release:check | 의도된 연구 출시 차단 FAIL, 제품 출시 검사와 구분 |
| npx playwright test --workers=2 | 412 PASS / 44 SKIP / 0 FAIL / 0 flaky |
| AUDIT_STAGE=before/after npx playwright test tests/audit-visual.spec.ts --project=desktop --workers=2 | 각각12 PASS, 96장씩 |
| Android APK·설치·offline smoke | [PASS run39411226617](https://github.com/HyeSeong123/newAlbum/actions/runs/39411226617), bf2fdff 제품코드 |
| Source CI | [PASS babe008](https://github.com/HyeSeong123/newAlbum/actions/runs/39411866394), 후속은 CI 상태 파일 참고 |
| Windows NSIS·설치·업데이트 | 재실행 결과는 [CI 상태](evidence/ci-status.json) 참고. 검사 해시는 완화하지 않음 |

44skip은 platform전용·중복viewport/실제GPU환경 조건 등 원래의test.skip이며 PASS가 아니다. 처음 실패한13개 stale assertion을 원래사용동선에 맞춰 수정했고 신규8 case(프로젝트별 실행)와6폭 capture를 추가했다. 원본 실패 결과도 보관했다.

200개 mock기록은 기존 개·고양이 fixture를 재사용하며 실제 서로 다른 동물사진200장의 정확도/복사성능 시험이 아니다. 실제사용자DB·실기기update·ARM64메모리/발열·전체WCAG AA는 미검증이다. Windows CI진행중/실패를 플랫폼통과로 바꾸지 않는다.

제품 CSS -2,260bytes(-1.06%), JS +1,664bytes(~0.03%). 시작/FPS의 전후 개선 수치는 없다. 전후96쌍 중78쌍 pixel동일(허용8),18쌍은 글꼴/고미/decode 시점차이가 있어 시각승인은부분검증이다.

원본 screenshots·Android smoke 자료와 보고서 묶음은 별도 제출 archive에 포함한다. 저장소에는 판정·원본 검사 JSON·증빙 목록을 남기고, PNG는 제출 ZIP과 CI artifact에 보관해 저장소의 영구 이력을 불필요하게 늘리지 않는다. 모든화면10상태×6폭 전체완료를 주장하지 않는다.
