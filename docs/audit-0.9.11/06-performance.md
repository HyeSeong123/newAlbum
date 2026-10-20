# 성능 비교 보고서

측정하지 않은 시작/화면전환/메모리 값을 추정하지 않는다. 이번 변경은 실제 회귀와 구조 중복을 해결했으며 추측성 memoization은 추가하지 않았다.

| 측정 항목 | 기준 | 수정 후 | 해석 |
| --- | ---: | ---: | --- |
| 제품 CSS 합계 비압축 | 213,260 bytes | 211,000 bytes | -2,260(-1.06%), 같은 build 산출물 비교 |
| 제품 JS 합계, worker 포함 | 5,441,218 bytes | 5,442,882 bytes | +1,664(~0.03%): 터치/포커스·오류 검증 비용 |
| build 경과 | 13.11s | 15.51s | 동시 작업/캐시 조건이 달라 속도 비교에 부적합 |
| 최초 앱 시작·화면 전환 latency | 미측정 | 미측정 | fixture screenshot runtime을 앱 시작 성능으로 쓰지 않음 |
| 수백/수천 사진 스크롤 FPS·decode | 미측정 | 미측정 | 200개 mock 표시/페이지 기능만 검증, thumbnail 실제 비용 아님 |
| React render 횟수·전체 RSS/heap | 미측정 | 미측정 | useMemo/useCallback/React.memo 대량 도입하지 않음 |
| SQLite 쿼리 latency/FS 호출·썸네일 hit | 미측정 | 미측정 | 기존 페이지/관리 썸네일 구조를 보존 |
| ARM64 발열·메모리·백그라운드 | 미측정 | 미측정 | 실제 기기 필요 |

## 반복/복구 안정성

기준에서 잘못된 source audit 응답은 cursor가 전진하지 않고 microtask loop에 빠질 수 있었다. batch schema·items·done 및 safe-integer 증가 cursor를 검증해 사용자 오류 경로로 종료시켰다. 반복 요청 차단 기능 검증이며 latency 개선 측정값은 아니다.

터치 Hook은 언마운트/비활성화 때 timeout과 native listener를 정리한다. 기존 AI client/scheduler는 Worker dispose/abort 경계를 유지했다. 전역 메모리 누수가 없다는 보장은 하지 않는다.

`person-repetition-smoke.json`은 사람/Pet 각20회, 합40회 교차 분석에서 worker peak1·외부 요청0을 확인한다. tensor는 사람300(46,107,804bytes), Pet399(35,049,984bytes)로 해당 반복에서 증가하지 않았다. tensor bytes는 전체 앱 메모리가 아니다. Android 결과는 API36 x86_64 emulator다.

Android `pet-runtime-benchmark.json`의 기존 개 fixture 1장/각3회는 CPU median6,010.8ms, WASM425.4ms다. 이는 서로 다른 backend 비교이며 이번 refactor의 전후 성능 개선이 아니다. `person-runtime-smoke.json`은 실제3얼굴128차원·512제외·offline 확인이고 개체 정확도를 측정하지 않는다.

부피 원본은 bundle JSON 두 개에 기록한다. 모델 자산 약47.7MiB와 사용 모델/라이선스 고지는 유지했다. ai:release:check 통과와 commercialClearanceConfirmed=false는 별개이며 권리 해결을 선언하지 않는다.
