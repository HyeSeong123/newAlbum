# 0.9.13 인식 범위 복구

2026-10-20 사용자 정정에 따라 과도하게 적용한 0.9.12의 외부 모델 전체 제거를 되돌렸다. 최초 지시의 유지/제외 범위가 기준이다. `manual-only-no-models`와 그때 작성한 모델 미포함 APK 검증은 현재 제품 설명이 아니다. 당시 변경은 Git 이력으로만 남는다. 잘못된 0.9.12 APK와 구분하기 위해 버전은 0.9.13이다.

## 실제 변경

- 128차원 FaceAPI, 사람 얼굴 탐지/랜드마크/기하학적 방향 추정, 기본 개/고양이 탐지, MobileNet 외형 비교, 고양이 얼굴 보조 탐지를 복구했다.
- 자동 찾기·후보 확인·재분석과 기존 수동 등록/수정/확인 기능을 복구했다. 가져오기/저장만으로 분석을 자동 시작하지 않는 기존 사용자 요청 조건을 유지한다.
- FaceX tiny512·QuadPose f2·전용 ONNX 런타임과 자체 미학습 연구 모델 제품 추론은 계속 제외한다. 호환용 과거 DB 특징과 독립 연구 코드는 보존한다.
- 소스·스크립트·CSS·테스트·출시 정책·CI는 감사 완료 커밋 `58abcfa3599dca780dc8da0f7259d611d46c3f1b`와 동일하다. 차이는 버전 파일과 이 정정 문서/릴리스 설명뿐이다. 원래 감사의 수정과 공통화는 유지한다.
- SQLite 스키마·마이그레이션·사람/반려동물 ID·사진 연결·수동 확인·원본은 변경하지 않았다. 기존 기준 브랜치와 Git 이력은 덮어쓰지 않는다.

## 검증

- 로컬 TypeScript/Vite/release build PASS. `npm run ai:release:check -- --dist` PASS: 유지할 모델의 해시·필수 고지 검증 및 제외 모델 재유입 검사.
- 로컬 단위 테스트144 PASS, Python22 PASS, 인식 관련 브라우저44 PASS/8 SKIP/0 FAIL. 실제 모델/Worker, 사용자 요청 분석, 100장 가져오기 후 자동 분석 방지, 수동 등록과 재분석을 확인했다.
- [새 Source CI](https://github.com/HyeSeong123/newAlbum/actions/runs/39436705914) PASS: 단위144, Rust116, 전체 브라우저412 PASS/44 SKIP/0 FAIL, build 및 모델 해시·제외 검사 PASS. SKIP은 검증 통과를 의미하지 않는다. [동일 커밋 push CI](https://github.com/HyeSeong123/newAlbum/actions/runs/39436694075)도 PASS.
- 기존 감사의 전체 브라우저 412 PASS/44 SKIP와 Android/Windows 성공은 이전 커밋 증빙이다. 0.9.12 모델 없는 앱의 성공 결과를 이번 인식 앱 검증으로 재사용하지 않는다.
- [Android 설치 앱 검사](https://github.com/HyeSeong123/newAlbum/actions/runs/39436694146) PASS: API36 x86_64 에뮬레이터에서 오프라인128차원 얼굴 모델의 CPU/WASM 실행과 기본 개/고양이 추론, 사용자 확인·수동 등록·재분석, 사진 권한/갤러리 선택·스크롤을 확인했다. 512 제외와 no-pose 엔진을 확인했고 ID/연결 보존 assertion이 통과했다. 동일 개체 정확도와 실기기 성능을 측정한 것은 아니다. [화면·원본 JSON](https://github.com/HyeSeong123/newAlbum/actions/runs/39436694146/artifacts/12271604409), [0.9.13 ARM64 테스트 APK](https://github.com/HyeSeong123/newAlbum/actions/runs/39436694146/artifacts/12272217229).
- [Windows 설치/업데이트 검사](https://github.com/HyeSeong123/newAlbum/actions/runs/39436694104) PASS: 이번 실행은 이전0.9.12 설치파일(artifact12267999145)에 시험 기록을 넣고0.9.13 full/update 설치와 WebView·SQLite·썸네일·재시작 보존을 검사했다. 이전0.9.11→0.9.12 검사는 과거 이력이며 이번 실행의 대상 버전과 구분한다. [설치/업데이트 파일](https://github.com/HyeSeong123/newAlbum/actions/runs/39436694104/artifacts/12271749326).
- 현재 로컬 cargo는 없으며 Rust116건은 위 새 커밋 CI에서 확인했다.
- ARM64 실기기·실제 사용자 DB 전체 업데이트·전체 접근성은 미검증이다.

필수 라이선스/출처/권리 검토 기록과 `commercialRightsVerified=false`를 원래대로 유지한다. 이 작업은 사용자가 지정한 기능 범위를 복구하며 권리 해결 완료를 선언하지 않는다.

## PM 재검토

복구 범위와 모델 제외 상태는 PASS다. 기능/스타일/저장소 코드는 마지막 감사 완료 상태와 동일해 추가 추상화나 데이터 마이그레이션을 도입하지 않았다. 기존 감사 개선도 보존했다. 전체 출시 준비는 CONDITIONAL PASS로 유지한다. 실기기·실제 사용자 DB·전체 접근성과 대표 데이터의 동일 개체 인식 정확도는 미검증이기 때문이다. 병합하지 않고 PR18에 증빙과 함께 제출한다. [검증 JSON](recognition-scope-restored-0.9.13-evidence.json)을 따른다.
