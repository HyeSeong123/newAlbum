# 0.9.11 권리 검토 범위에 따른 모델 제외 정정

기준: `c1cf47ab6b198a47832c867d6966222be7e57f00`, 작업 브랜치 `feature/gamjassak-native-ai`. 안정 브랜치는 수정하지 않는다.

## 정정 이유

사용자가 기존 모델을 활용해 출시 준비를 계속하겠다고 한 결정을 모든 개발 모델의 복구로 확대 해석했다. 0.9.10에서 FaceX512·QuadPose까지 다시 포함한 것은 의도한 범위와 달랐다. 2026-10-20 사용자 지적에 따라 이 두 모델과 의존 기능을 배포에서 제외한다. 기존 0.9.10 APK는 이번 제외 사항이 반영된 파일이 아니다.

512차원이라는 수학적 규격 자체가 금지된다는 뜻은 아니다. 제외 대상은 FaceX tiny512 가중치(MS1M-RefineV2 계보 미확인)와 QuadPose 가중치(AP-10K·ImageNet·ViTPose 관련 미확인 사항)다. 프로젝트의 [기존 권리 조사](commercial-ai-model-rights-audit-2026-10-14.md)와 [128차원 추가 근거](face-model-rights-evidence-2026-10-19.md)를 기준으로 한 제품 범위 결정이며, 위 모델이 법적으로 일괄 금지된다는 판정은 아니다.

## 현재 제품 기능

| 항목 | 처리 | 제품 영향 |
| --- | --- | --- |
| FaceX tiny512 | 가중치·다운로드·추출 어댑터·후보 우선 비교 제외 | 사람은 기존 FaceAPI 128차원으로 비교 |
| QuadPose f2 | 가중치·추론 어댑터·자동 관절·좌우 분석 제외 | 강아지 좌우·뒷모습은 사용자 확인. 자동 측면 인식을 제공한다고 표시하지 않음 |
| ONNX Runtime Web | 유일한 두 사용 모델과 함께 의존성·배포 런타임 제거 | 해당 WASM·JS도 제품에 미포함 |
| FaceAPI 검출·랜드마크·128차원 | 유지 | 얼굴 찾기·후보 제시·수동 확인·방향의 기하학적 추정 유지 |
| Google SSDLite·MobileNet | 유지 | 개·고양이 탐지·1024차원 외형 후보 비교·반전 비교 유지 |
| 고양이 정면 cascade·일반 색상·체형 계산 | 유지 | 고양이 정면 보조 탐지, 뒷모습의 색상·체형 비교 유지 |
| 사람·반려동물 등록·수동 연결·등록 사진 재분석 | 유지 | 사용자 요청 후 실행. 자동 개체 연결은 기존 정책대로 제한 |

유지 항목을 학습 데이터까지 포함한 권리 최종 확인 완료로 바꾸지 않는다. `commercialRightsVerified`와 기존 `commercialClearanceConfirmed`는 false를 유지한다. 가중치의 공개 허가, 자료의 권리, 사용자의 제품 범위 선택을 구분한다.

## 사용자 데이터 보호

- DB 버전·스키마·사용자 ID를 변경하거나 테이블을 초기화하지 않는다.
- 과거 `person_model_feature` 512차원 행은 보존하지만 후보 SQL에서 읽지 않는다. 새 FaceX 특징 저장도 거부한다. 128차원 재분석이 기존 512 행을 지우지 않도록 수정했다.
- 과거 QuadPose 자동 방향·관절 JSON은 DB에 보존한다. 앱에 읽어줄 때 해당 자동 방향은 unknown으로 취급하고 관절·그에 근거한 얼굴 특징을 활성 비교에 전달하지 않는다. 사용자가 직접 확정한 방향과 인물·반려동물 연결은 유지한다.
- 반려동물 엔진 버전은 `gamjassak-pets-v3-no-pose`다. 기존 캐시를 새 엔진 결과로 오인하지 않는다. 버전 변경 자체로 분석을 자동 시작하지 않는다.
- 기존 가중치 기록은 잠금 파일의 `excludedModels`에 남기고 활성 `models`는 빈 배열로 고정한다. 사용자 사진·DB 경로에 대한 삭제 작업은 없다.

## 배포 검증

준비 스크립트는 고정된 앱 자산 경로 `people512`, `pet-pose`, `onnx-runtime`, `recognition-provenance.json`의 이전 빌드 잔여물만 제거한다. 새로 내려받지 않는다. 배포 검사는 해당 경로가 public·최종 dist에 재유입되거나 활성 잠금 목록이 바뀌면 실패한다. 최종 JS도 FaceX·QuadPose·ONNX 런타임 참조가 없는지 검사한다.

## 검증 상태

- 로컬 TypeScript·제품 빌드, 144개 단위·22개 Python 저장소 회귀와 배포 재활성화 차단 검사가 통과했다. 모델·런타임 자산은 72.7 MiB에서 47.7 MiB로 줄었고 최종 dist에 제외 디렉터리가 없다. 이 값은 앱 전체 메모리나 APK 크기가 아니다.
- 기존 브라우저·Android 실제 추론 검사를 제거하지 않고 ‘512/자세 모델이 실행되지 않음’과 ‘128/기본 반려동물 기능 유지’를 검사하도록 변경했다.
- Rust 회귀는 기존 512 행을 직접 넣은 DB에서 후보가 생성되지 않는지, 새 512 결과가 거부되는지, 과거 자세 JSON과 사용자 방향·연결이 보존되는지 확인한다.
- 0.9.11 소스 CI 성공: Node 단위 144개, Rust 116개, Python 22개, Playwright 314개 통과. Playwright 27개는 기존 화면·플랫폼 조건에 따른 제외, 실패 0개다. 제품 빌드도 통과했다. Android API 36 x86_64 설치·오프라인 실행·재시작 검증도 성공했다. 0.9.10의 통과 결과를 이번 수정의 검증 결과로 재사용하지 않았다.

## PM 판단

문제 등급 High: 복구 범위가 사용자 선택을 넘어섰고, 파일만 제거해도 과거 512 DB 비교가 계속될 수 있었다. 코드·준비·의존성·기존 DB의 활성 사용·제품 상태 표시를 함께 수정했다. 반려동물 전체 기능 삭제는 요청 범위를 넘으므로 기본 탐지·외형 비교와 수동 작업을 유지한다. 정확도·실제 휴대폰 성능·남은 권리를 새로 입증했다고 주장하지 않는다.

## 최종 APK 자산 확인

검증 대상 구현 커밋: `1ce76a503b76a54a7c09e7813cf4ccfcc0b65fb1`.

- [0.9.11 ARM64 테스트 APK ZIP](https://github.com/HyeSeong123/newAlbum/actions/runs/39390579912/artifacts/12250180554). 개발 서명 미리보기이며 Play 게시용 서명이 아니다. 아티팩트 만료는 2026-11-19다.
- 실제 APK SHA-256: `e6c54b39820f18124146922dac7f9929b5169823072ba19900c111fb8242825c`.
- APK의 Rust 라이브러리에 등록된 기본 모델 자산 68개 경로를 확인했고 FaceX·QuadPose 가중치 경로와 ONNX 런타임 자산 경로는 없었다.
- 가중치·manifest의 정확한 해시는 빌드 입력 public 및 최종 dist에서 검사했다. APK는 일부 자산을 압축해 포함한다. APK 내부 직접 연속 바이트 SHA 일치는 5개만 확인했으며 나머지 63개를 독립적으로 압축 해제·해시 검증했다고 주장하지 않는다. [실제 APK 확인 JSON](rights-scope-correction-evidence-0.9.11.json)에 확인 범위를 기록했다.
- [소스 CI](https://github.com/HyeSeong123/newAlbum/actions/runs/39390579783), [Android 빌드·설치 CI](https://github.com/HyeSeong123/newAlbum/actions/runs/39390579912) 모두 성공했다. [설치 실행 증거](https://github.com/HyeSeong123/newAlbum/actions/runs/39390579912/artifacts/12249784062)에 실제 화면과 JSON을 보관했다.
- 설치 앱에서 얼굴 3개와 유효한 128차원 특징을 확인했고 `excluded512=true`였다. 개·고양이 탐지·기본 특징, QuadPose 결과 미생성, 수동 등록과 등록 사진 재분석 후 이름·사진 연결·개체 ID 보존을 확인했다. 50주기·100회 추론·99회 사람/반려동물 전환에서 도메인별 tensor 수가 일정했고 저장된 연결이 유지됐다. 재시작 후 사진·앨범·일기·반려동물·대기열이 유지되고 사용자 요청으로 재개됐다. 이 결과는 개체 인식 정확도·휴대폰 성능·앱 전체 최고 메모리를 입증하는 수치가 아니다.

## 실행 명령과 변경 파일

```sh
npm run test:unit
python3 -m unittest discover -s tests -p 'test_*.py'
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked -j 2
npm run build
npm run ai:release:check
npm run version:check
npx tauri android build --debug --apk --ci --features custom-protocol --target aarch64 x86_64 --split-per-abi
node scripts/smoke-android.mjs
```

Rust·브라우저·Android 실행 환경은 GitHub Actions다. 브라우저의 실제 파일별 배치·grep·뷰포트 설정은 [워크플로](../../.github/workflows/source-validation.yml)에 보관한다. 실제 ARM64 휴대폰의 설치·업데이트·성능·발열, Windows 설치파일 실행과 독립 개체 식별 정확도 평가는 이번 실행 범위에서 미실행이다.

구현 커밋의 전체 파일 변경(A=추가, M=수정, D=제거):

```text
M	docs/recognition-restoration-2026-10-20.md
M	docs/releases.md
A	docs/rights-scope-correction-2026-10-20.md
M	package-lock.json
M	package.json
M	public/notices/ai-release-status.json
M	scripts/person-runtime-benchmark.mjs
M	scripts/pet-runtime-benchmark.mjs
M	scripts/prepare-recognition-models.mjs
M	scripts/recognition-models.lock.json
M	scripts/release/check-ai-assets.mjs
M	scripts/release/verify-build.mjs
M	scripts/verify-recognition-models.mjs
M	src-tauri/Cargo.lock
M	src-tauri/Cargo.toml
M	src-tauri/src/faces.rs
M	src-tauri/src/person_engine.rs
M	src-tauri/src/person_evaluation.rs
M	src-tauri/src/pet_evaluation.rs
M	src-tauri/src/pet_recognition.rs
M	src-tauri/src/recognition.rs
M	src-tauri/tauri.conf.json
D	src/features/ai/onnxRuntime.ts
D	src/features/people/engine/embedding512.ts
M	src/features/people/engine/faceApiAdapter.ts
M	src/features/pets/PetPhotoResults.tsx
M	src/features/pets/engine/pet.worker.ts
D	src/features/pets/engine/poseModel.ts
M	src/features/pets/engine/types.ts
M	src/features/settings/RecognitionEvaluation.tsx
D	src/types/onnxruntime-wasm.d.ts
M	tests/ai-packaging.test.mjs
M	tests/manual-photos.spec.ts
M	tests/person-worker.spec.ts
M	tests/pet-recognition.spec.ts
M	tests/pet-review.spec.ts
M	tests/recognition-settings.spec.ts
M	vite.config.ts
```

후속 문서 커밋은 이 보고서·APK 확인 JSON·이전 출시 결정의 범위 정정·자체 AI 연구 안내만 변경한다. 앱과 APK의 검증 대상 코드는 바뀌지 않는다.

## PM 최종 판정

| 항목 | 판정 | 근거·남은 조건 |
| --- | --- | --- |
| FaceX512·QuadPose·ONNX 제외 | PASS | 활성 추론·의존성·준비 자산·dist·APK 등록 경로 제외, 재유입 차단 검사 |
| 128차원·기본 반려동물 기능 | PASS | 브라우저·Android CPU/WASM 실제 실행 |
| 과거 특징·사용자 확인 보존 | PASS | Rust DB 회귀 및 Android 수동 등록·재분석·재시작 검증 |
| 요청 전 분석 금지 | PASS | 기존 100장 가져오기·대기 작업 회귀 유지 |
| Android 제품 적합성 | CONDITIONAL PASS | 두 ABI 빌드와 x86_64 설치 통과. ARM64 실기기·Windows 설치 검증은 미실행 |
| 권리 범위 관리 | CONDITIONAL PASS | 요청한 두 모델을 제외하고 기존 미확인 표시는 유지. 남은 모델의 최종 권리 승인 판정은 아님 |
| 현재 수정 범위의 High 문제 | PASS | 잘못된 복구 범위와 과거 DB의 512 우선 비교 수정·재검증 완료 |

다음 단계는 수정 APK의 실제 휴대폰 확인과 남은 모델의 권리·평가 자료 관리다. 이전의 포괄적인 출시 진행 결정을 제외 모델 재도입의 근거로 사용하지 않는다.
