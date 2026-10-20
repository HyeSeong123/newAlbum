# 0.9.10 기존 인식 복구 및 출시 구성 정리

> 정정: 이 문서는 0.9.10 당시 결과다. FaceX512·QuadPose까지 복구한 범위는 사용자의 의도와 달랐다. 현재 배포 구성은 [0.9.11 정정 보고서](rights-scope-correction-2026-10-20.md)를 따른다.

기준 커밋: `7b89c1a893e9777c970c1a688b216c615d351a67`. 기존 안정 브랜치는 수정하지 않고 `feature/gamjassak-native-ai`에서 작업한다. 2026-10-20 사용자가 선택한 출시 방향에 따라 기존 인식 기능을 다시 기본 경로로 연결한다.

## 유지·복구

- 사람: 기존 SSD 검출 → 68점 랜드마크·정렬 → 128차원 특징 → 후보 비교. 기존 FaceX 512 추가 특징과 좌우 방향 분석도 유지한다.
- 반려동물: 기존 개·고양이 탐지, MobileNet 외형 특징, QuadPose 방향, 고양이 얼굴 보조 탐지, 후보 비교·사용자 확인을 유지한다. 뒷모습 비교에서는 얼굴 특징을 사용하지 않고 반려동물 자동 연결은 계속 비활성화한다.
- 분석은 사용자의 시작·재개 요청 후 실행한다. 사진 가져오기, 앱 시작, 등록 정보 저장만으로 모델을 불러오거나 대기 중인 사진을 분석하지 않는다.
- Worker, CPU/WASM, 취소, 메모리 직렬화, 원본 변경 감지와 모델별 특징 공간 분리를 유지한다.
- 사진·앨범·일기·인물·반려동물 및 수동 확인 연결을 보존한다. DB 버전 18과 추가 테이블을 유지하며 이전 DB로 내리거나 테이블을 삭제하지 않는다.

## 제거·분리

- 기본 앱을 미학습 자체 모델로 우회하던 Vite alias, `engineMode`, unavailable client, 인식·재분석·재개 차단문을 제거한다. `VITE_AI_ENGINE=legacy`를 설정할 필요가 없다.
- 앱의 자체 AI 준비 중 화면과 합성 색상 모델 실행 버튼을 제거한다.
- 고급 평가·벤치마크 화면은 개발 모드에만 둔다. 제품 빌드에는 해당 평가 화면과 synthetic Worker를 포함하지 않도록 실제 산출물 파일을 확인한다.
- “등록 사진 다시 학습”을 “등록 사진 다시 분석”으로 수정한다. 기존 사진의 특징을 재추출하는 작업을 신경망 가중치 재학습처럼 표현하지 않는다.
- 중복 native-only CI를 기존 전체 회귀 CI에 통합한다. 학습·역전파·체크포인트·자체 Worker·DB 실험 기반과 테스트는 향후 작업용으로 보관하며 앱 자동 인식에는 사용하지 않는다.

## 출시 검사

기존의 무조건 실패하는 자체 AI 출시 검사를 일반 앱 빌드 경로에서 분리했다. `npm run ai:native:release:check`는 미학습 자체 모델에 대한 연구용 차단 검사로 남긴다.

`npm run ai:release:check`와 Tauri release build는 새 `scripts/release/check-ai-assets.mjs`로 다음을 검사한다.

1. 사용자의 출시 결정과 미확인 권리 상태를 별도 기록한 `public/notices/ai-release-status.json` 확인. `commercialRightsVerified`는 false를 유지한다.
2. 기록 당시 모델 잠금 파일·고양이 cascade·필수 라이선스 고지의 해시 확인. 모델 구성이 달라지면 조용히 승인 범위를 넓히지 않는다.
3. 실제 모델·manifest·WASM·ONNX 런타임 파일의 누락·변조 검사. 기록하지 않은 모델 파일과 합성 probe 파일은 제품 자산에 허용하지 않는다.
4. 최종 frontend dist 복사본과 고지 내용까지 대조한다. Rust release 경로도 같은 dist 검사를 호출한다. 이 검사를 APK 전체 서명·스토어 심사·권리 최종 승인으로 표현하지 않는다.

원 제작자 FaceAPI MIT, dlib CC0 및 QuadPose NOTICE를 추가했고 QuadPose 모델 디렉터리에도 NOTICE를 복사한다. 모델 가중치는 변경하지 않았다. 상업 배포에 관한 미해결 학습 데이터 쟁점은 해결됐다고 바꾸지 않았다.

## 로컬 검증

- `npm run test:unit`: 143개 통과. 신규 포장 검사에는 미확인 권리 상태를 허위 승인으로 바꾸는 경우, 가중치 변조, 기록하지 않은 모델, 고지 누락, dist 파일 누락, 잠금 파일 변경 거부가 포함된다.
- `python3 -m unittest discover -s tests -p 'test_*.py'`: 22개 통과. 사람·반려동물·앨범·자체 AI 추가 저장소 회귀.
- `npm run build`: TypeScript·Vite·제품 파일 검증 통과. 사람·반려동물 Worker 포함, 연구용 Worker·평가 화면 분리 확인.
- `npm run ai:release:check`, `npm run version:check`: 통과.
- 이 실행 환경에는 Rust·Android SDK와 설치된 Chromium이 없다. Playwright Chromium 및 별도 headless-shell 다운로드가 손상된 ZIP 응답으로 실패했다. 브라우저·Rust·설치 Android 검증은 GitHub Actions에서 수행한다.
- 실제 인식 정확도·측면 60% 목표·ARM64 휴대폰의 성능과 발열을 측정한 작업은 아니다.

## PM 검토

미학습 엔진을 기본으로 연결해 기존 기능이 모두 막히던 제품 구성을 해소했다. 단순한 플래그 변경 대신 미사용 앱 경로와 중복 CI를 제거했고, 자체 학습 연구를 제품 인식 결과와 분리했다. DB 마이그레이션을 되돌리면 사용자 정보에 위험하므로 추가 테이블과 저장 계약은 보존했다. 기존 모델의 공개 허가·미확인 사항과 사용자의 출시 판단을 분리한 채 실제 자산 무결성과 고지 검사는 유지한다.

남은 확인: 실제 ARM64 휴대폰의 설치·업데이트·성능·발열, Windows 설치파일 실행, Play 업로드용 서명과 광고 SDK 설정. 이 작업에서 광고를 새로 붙이거나 스토어에 게시하지 않는다.

## GitHub Actions 검증

검증 대상 소스는 `96e1d902a0f60f20e2f722be924d43b0b2214ade`다. 이후 보고서·배포 문서만 수정한 커밋은 실행 코드와 APK를 바꾸지 않는다.

- [Source validation](https://github.com/HyeSeong123/newAlbum/actions/runs/39379610167): 성공. Node 단위 143개, Rust 116개, Python 저장소 22개 통과. CI에 명시된 Playwright 회귀 341개 중 314개 통과, 기존 화면·플랫폼 조건에 따른 27개 제외, 실패 0개. 신규 복구 테스트를 피하기 위해 제외한 항목은 없다.
- 같은 실행의 제품 빌드와 최종 dist 모델·고지 검사 성공. 사람·반려동물 Worker를 포함하고 연구용 Worker·평가 화면 청크를 포함하지 않는다.
- [Android preview APK](https://github.com/HyeSeong123/newAlbum/actions/runs/39379610246): 성공. ARM64·x86_64 APK 빌드와 개발 서명 검증, Android API 36 x86_64 에뮬레이터의 설치·오프라인 실행 완료. 실제 얼굴 3개 검출과 128·512 특징 유효성, CPU/WASM 추론, 개·고양이 실행, 뒷모습 얼굴 벡터 제거, 수동 사람·반려동물 등록과 재분석 후 이름·사진 연결·개체 ID 보존을 확인했다. 재시작 후 사진·앨범·일기·반려동물·분석 대기열·수동 연결이 유지되고 사용자 재개 요청 후 처리가 완료됐다. 얼굴·반려동물 개체 인식 정확도나 실제 휴대폰 성능의 측정은 아니다.
- [Android 실행 증거](https://github.com/HyeSeong123/newAlbum/actions/runs/39379610246/artifacts/12245583505): 실제 설치 화면과 사람·반려동물 Worker, 반복 실행, 보안·갤러리 검증 JSON. 100회 분석·99회 도메인 전환에서 도메인별 tensor 수가 일정하고 저장된 사용자 연결이 유지됨을 확인했다. 이 결과를 앱 전체 최고 메모리나 장시간 실기기 발열 측정으로 해석하지 않는다.
- [ARM64 테스트 APK 다운로드](https://github.com/HyeSeong123/newAlbum/actions/runs/39379610246/artifacts/12244752507): ZIP 안의 `Gamjassak-0.9.10.apk`. 스토어 게시용 서명이 아닌 기존 미리보기 개발 서명이다. 아티팩트 보관 만료는 2026-11-19다.

실행 명령:

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

브라우저의 개별 배치·grep·뷰포트 옵션은 [실행한 워크플로](../../.github/workflows/source-validation.yml)의 `Test browser workflows`와 `Test approved brand and capture previews` 단계에 그대로 보관한다. 로컬 Python은 전체 discover, CI Python은 같은 6개 저장소 파일을 개별 discover로 실행했다.

### 발견·수정 사항

| 등급 | 발견 사항 | 조치 |
| --- | --- | --- |
| High | 기본 경로가 미학습 모델로 우회해 기존 인식과 재분석을 차단함 | 우회·차단 코드 제거, 안정 브랜치와 같은 실제 추론 클라이언트·Worker 재연결 |
| Medium | 합성 모델 점검·개발용 성능 메뉴가 제품 기능처럼 노출됨 | 제품 화면·번들에서 분리, 자체 학습 코드·저장소는 유지 |
| Medium | 기존 출시 차단만 제거하면 실제 모델·고지 누락도 놓칠 수 있음 | 모델 잠금·실제 자산·최종 dist의 무결성과 필수 고지를 검사하는 별도 경로 구현 |
| Low | 특징 재추출을 신경망 학습처럼 표현함 | 제품 문구와 브라우저·설치 검사 모두 ‘다시 분석’으로 변경 |
| Low | 새 테스트의 이름 선택자가 빈 화면의 같은 이름 버튼 두 개와 충돌함 | 기본 분석 버튼의 고유 aria-label로 선택자 수정 |
| Low | 배포 문서가 Windows 빌드를 자동 실행한다고 잘못 안내함 | 실제 수동 실행 방식과 브랜치·보관 기간으로 수정 |

인식 클라이언트·Worker와 공통 직렬 실행기의 최종 소스는 안정 브랜치 `cd3d1be70331d35d504c7081022b2cead8351498`과 같다. 새 추론 구현을 중복 작성하지 않았다. 이번 복구는 학습 완료된 자체 얼굴 모델 개발을 완료했다는 의미가 아니며, 자체 학습 연구의 합성 결과를 사진 인식에 사용하지 않는다.

### 승인 판단과 다음 단계

| 항목 | 판단 | 근거·조건 |
| --- | --- | --- |
| 기존 인식 경로 복구 | PASS | 기존 Worker 실행·CPU/WASM·취소 및 제품 번들 검증 |
| 사용자 요청형 분석과 관리 UX | PASS | 100장 등록·대기 작업 자동 시작 금지, 수동 등록·재분석·실패 재시도 회귀 |
| 기존 데이터 호환성 | PASS | 비파괴 DB 유지, Rust·Python 저장소 및 브라우저 연결 보존 회귀 범위 |
| Android 제품 적합성 | CONDITIONAL PASS | 두 ABI의 APK 생성 및 API 36 x86_64 설치·오프라인·재시작 검증 통과. 실제 ARM64 휴대폰 확인이 필요 |
| 자체 AI 연구 기반 유지 | PASS | 무작위 초기화·학습·체크포인트·합성 Worker 회귀 유지. 실제 얼굴 자체 모델 승인은 포함하지 않음 |
| 권리 기록·고지 관리 | CONDITIONAL PASS | 확보한 고지·해시·출시 결정 기록 유지. 상업 권리 최종 확인은 미완료이며 남은 학습 데이터 쟁점은 해결됐다고 판단하지 않음 |
| 유지보수성 | PASS | 미사용 앱 경로·중복 CI 제거, 연구·제품 검사 명령 분리 |
| 다음 단계 진입 | CONDITIONAL PASS | 기존 인식 앱의 휴대폰 사용성 검증과 서명·광고 설정으로 진행 가능. 스토어 게시 승인을 뜻하지 않음 |

현재 수정 범위에서 확인된 실행 코드의 Critical·High 회귀는 남아 있지 않다. 측정하지 않은 휴대폰 성능·정확도와 확인하지 않은 권리까지 통과했다고 확대하지 않는다. 다음 우선순위는 실제 ARM64 기기에서의 설치·업데이트·재분석 확인, 필요한 광고·서명 구성, 별도의 권리 확인된 자료를 통한 인식 평가다. 자체 모델 연구는 확보한 학습 자료와 별도 평가를 준비한 뒤 계속한다.

## 변경 파일

구현 커밋 `4c43f76ab7263d733bdd815eda2e1faceed6cc5b`, 브라우저 선택자 수정 `159a021fad4e47726b4822a5a85207482699884b`, 설치 검사 문구 수정 `96e1d902a0f60f20e2f722be924d43b0b2214ade`. 전체 변경은 아래와 같다. A=추가, M=수정, D=제거.

```text
M	.github/workflows/android-preview.yml
D	.github/workflows/native-ai-validation.yml
M	.github/workflows/source-validation.yml
M	docs/gamjassak-native-ai/README.md
M	docs/gamjassak-native-ai/reproduce.md
A	docs/recognition-restoration-2026-10-20.md
M	docs/releases.md
M	package-lock.json
M	package.json
A	public/notices/ai-release-status.json
A	public/notices/dlib-models-CC0.txt
A	public/notices/face-api-original-MIT.txt
A	public/notices/pet-pose-NOTICE.txt
M	scripts/manual-photo-smoke.mjs
D	scripts/native-ai/build-policy.mjs
M	scripts/prepare-ai.mjs
M	scripts/prepare-recognition-models.mjs
A	scripts/release/check-ai-assets.mjs
A	scripts/release/verify-build.mjs
M	scripts/verify-recognition-models.mjs
M	src-tauri/Cargo.lock
M	src-tauri/Cargo.toml
M	src-tauri/build.rs
M	src-tauri/tauri.conf.json
D	src/features/ai/engineMode.ts
D	src/features/ai/native/NativePipelineProbe.tsx
D	src/features/ai/native/unavailableClients.ts
M	src/features/people/PeopleView.tsx
M	src/features/people/engine/client.ts
M	src/features/pets/PetsView.tsx
M	src/features/pets/engine/client.ts
M	src/features/pets/usePetAnalysis.ts
M	src/features/settings/RecognitionEvaluation.tsx
M	src/features/settings/SettingsPanel.tsx
A	tests/ai-packaging.test.mjs
M	tests/manual-photos.spec.ts
M	tests/native-ai.spec.ts
M	tests/pet-review.spec.ts
A	tests/recognition-restored.spec.ts
M	tests/usability-recovery.spec.ts
M	vite.config.ts
```
