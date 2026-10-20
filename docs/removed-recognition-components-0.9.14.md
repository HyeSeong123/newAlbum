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

## 검증

- 로컬 Node142 PASS(기존144에서 폐기 전용4개 제거, 재유입 차단2개 추가), Python22 PASS, build 및 유지 모델 해시/제외 자산 검사 PASS.
- 소스에서 세 모델의 다운로드 URL/복호화 키/디코더/비교 함수 제거와 npm ONNX 의존성 부재를 확인했다.
- 첫 로컬 브라우저 실행은 Chromium 실행 파일 누락으로50건이 실행 전 실패했다(2건은 브라우저 없는 검사 통과). 기능 실패/통과로 바꾸지 않는다. 브라우저 설치와 재실행 및 새 Source/Rust/Android/Windows CI 결과를 확인한다.0.9.13의 성공 결과를0.9.14 검사로 재사용하지 않는다.

PM 검토: 사용하지 않는 전용 구현을 삭제했고 추가 추상화를 만들지 않았다. 기존 사용자 데이터를 건드리지 않으며 현재 기본 인식 기능과의 경계를 유지한다. 아직 완료하지 않은 검사를 PASS로 판단하지 않는다.
