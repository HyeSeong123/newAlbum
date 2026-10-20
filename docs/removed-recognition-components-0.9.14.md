# 0.9.14 FaceX512·QuadPose·전용 ONNX 완전 제거

사용자의 지시는 세 구성요소를 현재 코드에서 삭제하는 것이다. 이전0.9.13은 제품 배포에서는 제외했지만 불필요한 전용 유틸리티·모델 다운로드 메타데이터를 보존했다. 이번에는 해당 구현과 복원 정보를 삭제한다. 128차원 얼굴 인식·기본 반려동물 인식·독립 자체 AI 연구는 그대로 유지한다.

## 실제 삭제

| 항목 | 삭제 내용 |
| --- | --- |
| `scripts/recognition-models.lock.json` | FaceX/QuadPose 모델 URL, 고정 해시, 복호화 키, ONNX 버전 및 모델 재설치용 등록 파일 전체 |
| `src/features/people/engine/faceAlignment.ts` | 사용하지 않는 FaceX 전용 `alignmentTransform`, `validEmbedding` |
| `src/features/pets/engine/poseGeometry.ts` | `PET_POSE_MODEL`, 전용 `PetPose`/`PetKeypoint`, `decodePetHeatmaps`, `petHeadDirection` |
| Rust `person_engine.rs` | 테스트에만 남았던 512차원 `rank512` 및 그 단독 테스트 |
| Rust `recognition.rs`, `faces.rs` | `PERSON_512_MODEL`, `ModelFeature` 실행 타입·검증, 항상 거부되어 실행 불가능했던 추가 특징 INSERT 두 곳 |
| Pet 현재 TS 타입·manager·벤치마크 | 자동 QuadPose 객체 import/전달과 해당 모델 결과 보고 경로 |
| 폐기 기능 전용 테스트 | `tests/pet-pose.test.mjs` 세 건, FaceX 정렬 단독 검사 한 건. 유지할 얼굴 방향·수동 방향·기본 인식 검사는 삭제하지 않음 |
| 제품에 있던 전용 고지 다섯 파일 | `onnx-runtime-MIT.txt`, `pet-pose-NOTICE.txt`, `recognition-models-Apache-2.0.txt`, `recognition-095-NOTICE.txt`, `recognition-095-review.json`을 public 밖 과거 증빙으로 이동 |

원래 ONNX npm 의존성·설치된 패키지·가중치·런타임 파일은0.9.13에도 이미 없었다. 이번에는 직접/전이 의존성 재추가와 제거한 소스·등록 파일·고지의 제품 재유입을 검사로 차단한다. 빌드 준비는 이전 public/dist 생성물의 고정 경로를 지우는 정리만 수행하며 모델 다운로드/복호화 코드는 없다.

## 의도적으로 남긴 것

- 원본·기존 DB·마이그레이션·사람/Pet ID·사진 연결·수동 확인은 변경/삭제하지 않는다.
- Rust에는 과거 DB의 `quadpose-keypoints` 출처를 미지원 처리하고 자동 특징을 현재 비교에 전달하지 않는 최소 호환 처리가 남는다. 과거 특징은 타입별 모델 객체 대신 JSON으로 읽고 비활성화한다. 수동 방향과 사용자 연결은 유지한다.
- 기존 `additionalFeatures` 입력은 빈 값만 허용하는 거부 경계로 보존한다. 신규512 특징을 저장하는 구현은 삭제했다. 기존 DB의512 행은 읽어 비교하지 않으며 덮어쓰지 않는다.
- 문자열이 남는 위치는 과거 DB 호환, 삭제/재유입 차단 검사, 회귀 fixture, 과거 문서/고지다. 해당 문자열이 모델 구현이나 가중치를 복구하지 않는다.
- [과거 고지](archive/removed-model-notices/README.md)는 제품 public/dist와 분리했다. Git 과거 커밋은 재작성하지 않는다. 현재 사용 중인 FaceAPI·TensorFlow·COCO/MobileNet·고양이 cascade 고지는 유지한다.

## 실제 검증

- [최신 코드 Source CI](https://github.com/HyeSeong123/newAlbum/actions/runs/39509115061) PASS: Node142, Rust115, 전체 브라우저412 PASS/44 SKIP/0 FAIL, build 및 모델 해시/제거 자산 검사 PASS. 검증 커밋은 `9d1479b5d4f3b9192ccdf8c966797489aa662717`이다.
- Node144에서 폐기 기능 전용4개를 제거하고 재유입 차단2개를 추가해142건이다. Rust116에서 폐기한 `rank512` 단독 검사 하나를 제거해115건이다. 유지할 인식·방향·저장소·데이터 보존 회귀 검사는 삭제하지 않았다.
- 로컬 Node142·Python22·build/자산 검사 PASS. 첫 로컬 브라우저 실행은 Chromium 누락으로50건 실행 전 실패(브라우저 없는2건 통과)했고, 설치도 손상된 다운로드로 실패했다. 로컬 UI 검증은 미검증으로 남기며 위 실제 CI 브라우저 결과를 따른다.
- [Android 설치/오프라인 검사](https://github.com/HyeSeong123/newAlbum/actions/runs/39509115142) PASS: API36 x86_64 에뮬레이터에서128차원 얼굴 탐지·CPU/WASM 비교·반복 실행, 기본 개/고양이 인식, 사용자 확인·수동 등록·등록 사진 재분석 후 이름/ID/연결 보존, 갤러리 권한·드래그·스크롤을 검증했다. 벤치마크는 실제 CPU/WASM 출력에 제거한 자세 출력이 없음을 검사한다. [화면/원본 JSON](https://github.com/HyeSeong123/newAlbum/actions/runs/39509115142/artifacts/12306057303), [0.9.14 ARM64 테스트 APK](https://github.com/HyeSeong123/newAlbum/actions/runs/39509115142/artifacts/12305880607).
- [Windows 설치/업데이트](https://github.com/HyeSeong123/newAlbum/actions/runs/39509115034) PASS: 이전0.9.13 설치파일에 시험 기록을 넣고0.9.14 full/update 설치, WebView·SQLite·썸네일·재실행 보존을 확인했다. [설치/업데이트 파일](https://github.com/HyeSeong123/newAlbum/actions/runs/39509115034/artifacts/12305726811).
- public/dist에 세 모델·전용 런타임 파일 0개, package-lock의 ONNX 패키지 0개. 0.9.13의 검사 결과를0.9.14 결과로 재사용하지 않았다. [기계 판독 증빙](removed-recognition-components-0.9.14-evidence.json).

## PM 최종 검토

세 구성요소의 구현·모델 등록/다운로드 정보를 삭제했고 추가 추상화를 만들지 않았다. 소스와 앱 배포 자산에서 제거 확인, 기본 인식 기능 회귀 및 플랫폼 설치 검사는 PASS다. 원본·DB·마이그레이션·기존 ID/연결·수동 확인을 변경하지 않았다. 과거 DB 호환과 재유입 차단 검사에 남은 모델명은 실행 코드가 아니다.

전체 출시 준비는 CONDITIONAL PASS다. 실제 ARM64 휴대폰·실제 사용자 DB 전체 업데이트·전체 접근성·대표 데이터의 동일 개체 인식 정확도/실기기 성능은 미검증이다. 기존 전체 감사의 조건부 판정을 유지한다. 권리 해결 완료나 스토어 승인으로 표시하지 않으며, 기준 브랜치에 병합하지 않는다.
