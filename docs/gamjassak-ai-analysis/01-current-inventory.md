# 01. 현재 인식 경로·모델 의존성 분석

기준: `feature/warm-journal-v2` / `cd3d1be70331d35d504c7081022b2cead8351498`. **실행 테스트가 아닌 소스 경로 분석 결과.**

## A. 사람 인식 데이터 흐름

1. `src/features/people/PeopleView.tsx` → 사용자 선택으로 분석 시작; `faceService.ts`의 `enqueuePersonPhotos`, `scanPhoto`를 호출.
2. `src/features/people/engine/client.ts` → 이미지 로딩/Orientation 적용/최대 1600px 축소, `runAI('people')` 직렬화, `person.worker.ts` 전송.
3. `person.worker.ts` → `FaceApiAdapter` 로딩 및 오류 시 WASM → CPU 재시도.
4. `faceApiAdapter.ts` → `@vladmandic/face-api` SSD 검출(최소 score 0.35, maxResults 100) + 68점 랜드마크 + ResNet **128차원** descriptor 동시 호출; 낮은 score와 작은 영역은 `detectionPolicy.ts`로 제한.
5. `pose.ts` → 랜드마크 6점으로 PnP 기하 기반 yaw/pitch/roll 추정; 좌/우/정면/unknown 판정. 이는 학습된 방향 모델이 **아니다**.
6. `embedding512.ts` → FaceX Tiny 자체 학습이 아닌 **외부** `facex-tiny.onnx` 추론: 5개 랜드마크 정렬 → 112×112 전처리 → **512차원** 벡터 정규화. 실패 시 기존 128차원 결과로 계속 진행.
7. `faceService.ts` → `save_face_scan`/`refresh_face_scan` 호출; `src-tauri/src/faces.rs`와 `person_engine.rs`가 유효성·모델 버전·원본 지문을 확인하고 사용자 ID/특징/포즈를 SQLite에 저장, 후보 비교.
8. `find_face_matches`는 모델 버전별 128/512 특징을 구별한다. 신규 모델의 임베딩을 기존 128/512 벡터와 직접 비교할 수 없다.

증거: [faceApiAdapter](https://github.com/HyeSeong123/newAlbum/blob/feature/warm-journal-v2/src/features/people/engine/faceApiAdapter.ts), [embedding512](https://github.com/HyeSeong123/newAlbum/blob/feature/warm-journal-v2/src/features/people/engine/embedding512.ts), [client](https://github.com/HyeSeong123/newAlbum/blob/feature/warm-journal-v2/src/features/people/engine/client.ts), [faces.rs](https://github.com/HyeSeong123/newAlbum/blob/feature/warm-journal-v2/src-tauri/src/faces.rs), [person_engine.rs](https://github.com/HyeSeong123/newAlbum/blob/feature/warm-journal-v2/src-tauri/src/person_engine.rs).

### 사람 외부 가중치 — 모두 독립 교체 대상

| 기능 | 현재 자산/로더 | 현재 상태 | 새 엔진 필수 조건 |
|---|---|---|---|
| P01 얼굴 탐지 | FaceAPI `ssd_mobilenetv1_model.bin` | 외부 가중치·WIDER FACE 계보 | 자체 모델 구조·권리 확인 데이터로 무작위 초기화 학습 |
| P02 68 랜드마크 | `face_landmark_68_model.bin` | 외부 가중치·학습 출처 일부 불명 | 자체 얼굴 기준점 모델 및 검증 |
| P03 128 특징 | `face_recognition_model.bin` | 외부 가중치 | 신규 인식 특징과 버전별 저장소 |
| P04 512 특징 | `people512/facex-tiny.onnx` | 외부 FaceX, MS1M-RefineV2 계보 | 자체 512차원 모델 학습 |
| 방향 계산 | `pose.ts` | 프로젝트가 작성한 기하 계산, 외부 랜드마크에 의존 | 독립 기준점 결과로 교체·좌우 명세 유지 |

`faceAlignment.ts`의 수학적 정렬은 자체 로직이지만 기존 모델이 기대하는 5개 랜드마크 템플릿 좌표를 사용한다. 새 모델은 자신의 학습/전처리 규약을 독립 정의해야 한다.

## B. 반려동물 인식 데이터 흐름

1. `PetsView.tsx`/`PetPhotoSearch.tsx` → 등록 또는 사용자 분석 시작/다중선택; `usePetAnalysis.ts`에서 SQLite 작업 대기열 등록.
2. `engine/manager.ts` → `prepare_pet_input`로 미리보기와 원본 지문 준비·중복 스캔 재사용; `engine/client.ts`에서 로컬 픽셀을 Worker로 전달(최대 640px).
3. `engine/pet.worker.ts` → COCO-SSD/SSDLite MobileNetV2로 개/고양이 탐지(현재 상한 20, score 0.55).
4. `poseModel.ts`/`poseGeometry.ts` → QuadPose 외부 가중치, 256×256 입력/17 heatmaps(출력 `[1,17,64,64]`), 눈·코·목 특징점에서 머즐 좌우/정면 추정; 근거 없으면 `unknown`. 뒷모습 자동 판정하지 않음.
5. `catFace.ts` + `cat-face-cascade.json` → 외부 고양이 정면 Cascade 가중치; 개 얼굴 자동 랜드마크 모델은 확인되지 않음.
6. `pet.worker.ts` → MobileNet V1에서 **1024차원** 몸/반전 몸 특징, 얼굴 영역 있을 때 얼굴/반전 얼굴 특징. `features.ts`/`foreground.ts`는 **120차원 색상**과 **10차원 체형 근사**를 독자 계산.
7. `matcher.ts` → 종 분리, 얼굴/몸/반전 비교, 후면은 색+형태 비교만 사용. `0.60` 컷오프는 검색 설정이며 정확도 목표 60%가 아님. `autoPetId=null`로 자동 개체 연결을 보류한다.
8. `pet_recognition.rs`/`pet_jobs.rs` → 사진·대상/모델 버전·원본 지문·사용자 확인 연결·작업 상태를 영구 보존한다.

증거: [pet.worker](https://github.com/HyeSeong123/newAlbum/blob/feature/warm-journal-v2/src/features/pets/engine/pet.worker.ts), [poseGeometry](https://github.com/HyeSeong123/newAlbum/blob/feature/warm-journal-v2/src/features/pets/engine/poseGeometry.ts), [matcher](https://github.com/HyeSeong123/newAlbum/blob/feature/warm-journal-v2/src/features/pets/engine/matcher.ts), [foreground](https://github.com/HyeSeong123/newAlbum/blob/feature/warm-journal-v2/src/features/pets/engine/foreground.ts).

### 반려동물 외부 가중치 — 독립 교체 대상

| 기능 | 현재 자산/로더 | 새 개발 방향 |
|---|---|---|
| A01 개/고양이 탐지 | SSDLite MobileNetV2 / COCO-SSD | 자체 탐지·종 분류 |
| A02 관절/머즐 방향 | QuadPose `pet-pose/quadpose.onnx` | 자체 관절·머즐 방향 모델 |
| A03 고양이 정면 얼굴 | `cat-face-cascade.json` (외부 Cascade) | 자체 개/고양이 얼굴 탐지 및 기준점 |
| A04 동일 개체 외형 | MobileNet V1 TFJS 가중치 | 자체 개체 임베딩, 좌우 반전 규약/후면은 독립 성능 측정 |
| 색/체형/후면 비교 | `features.ts`, `foreground.ts`, `matcher.ts` | 원칙·인터페이스 참고 가능; 새 클린룸 구현에서는 코드를 복사하지 않음 |

※ 기존 프로젝트의 수학·업무 코드가 모두 저작권 문제가 있다는 뜻이 아니다. 완전 자체 개발 목표에서 외부 사전학습 가중치와 출처 의존성을 명확히 분리한 목록이다.

## C. 공통 런타임과 데이터 보존

- `src/features/ai/runtime.ts`: 인물/반려동물 분석을 직렬화하고 서로 다른 영역의 Worker를 교체하여 메모리 경합을 완화.
- `src/features/ai/onnxRuntime.ts`: ONNX Runtime Web `1.22.0` WASM, 앱 내부 모델만 로딩; 런타임 자체가 제3자 모델 권리 문제의 원인이 되는 것은 아님.
- `src/features/people/engine/client.ts` / `src/features/pets/engine/client.ts`: Worker 취소, 대기열, 타임아웃, 로컬 경로; 모델 교체 시 그대로 유지할 핵심 동작 계약.
- `src-tauri/src/database.rs`: DB 버전 `17`; 변경 시 새 버전 마이그레이션 필수.
- 관련 테이블: `person`, `person_photo`, `face_scan`, `detected_face`, `person_face_metadata`, `person_scan_metadata`, `person_model_feature`, `person_face_pose`, `person_scan_issue`, `person_analysis_job`, `pet`, `pet_media`, `pet_scan`, `pet_detection`, `pet_recognition_link`, `pet_analysis_job`, `pet_direction_observation`.
- 저장 원칙: 원본 사진과 수동 person/pet 연결·배제·방향 수정은 유지; 새 버전 특징을 추가로 저장하고, 확인된 물체/얼굴 영역 대응으로 이전 링크에 연결한다. 감지 실패/벡터 불일치에서 기존 confirmed 링크를 삭제하지 않는다.
- `relearnPersonPhoto`·`refresh_pet_reference` 등 UI의 '다시 학습'은 기존 사진의 **특징 재추출/기준 갱신**이며 신경망 가중치를 학습하는 것이 아니다.

## D. 현재 모델 자산 유입 지점

- `package.json`의 `predev`/`prebuild`는 `prepare-recognition-models.mjs`, `verify-recognition-models.mjs`, `prepare-face-models.mjs`, `prepare-pet-models.mjs` 실행.
- `prepare-recognition-models.mjs`는 FaceX/QuadPose를 **빌드 시 다운로드**하고 해시를 확인해 `public/models`에 저장한다.
- `prepare-face-models.mjs`는 설치된 FaceAPI 패키지에서 SSD·랜드마크·ResNet 가중치를 복사한다.
- `prepare-pet-models.mjs`는 외부 SSDLite·MobileNet 모델을 빌드 준비한다.
- 신규 독립 엔진의 상업 릴리스에는 이 네 모델 준비 경로를 완전히 분리·제거하고, 새 자산 허용 목록과 실물 APK/AAB 스캔이 필요하다.

## E. 테스트가 있는 부분과 아직 검증이 아닌 부분

- 단위: `tests/person-detection.test.mjs`, `tests/recognition-094.test.mjs`, `tests/pet-engine.test.mjs`, `tests/pet-pose.test.mjs`, `tests/ai-runtime.test.mjs`.
- 브라우저/스모크: `tests/person-worker.spec.ts`, `tests/pet-recognition.spec.ts`, 사용자 조작 관련 spec.
- 평가 기반: `src/features/pets/engine/evaluation.ts`, `src/features/ai/protocol.ts`(800장 데이터 프로토콜 형식 점검), `scripts/evaluate-person.py`, `scripts/evaluate-pets.mjs`.
- 알고리즘 단위/합성 입력·자기 동일도·에뮬레이터 실행은 정면/측면 **독립 개체 식별률을 증명하지 않음**. 사용자 동의·권리 확보 데이터의 진짜 held-out 평가가 필요하다.
- `docs/recognition-095.md` 당시 기록: 독립 평가 `0/800`. 이번 조사에서 최근 실제 데이터셋이 수집/검증되었다는 별도 증거는 확인하지 않았다.

## F. 1차 분석이 밝혀낸 핵심 갭

1. 새 네트워크를 학습할 **권리 확인 데이터/라벨/동의/학습 인프라**가 현재 확인 범위에 없음.
2. 사람 512/128 및 반려동물 1024 임베딩은 새 512/기타 임베딩과 호환되지 않음.
3. 신경망을 직접 학습하는 명령/파이프라인이 현재 앱 레포에서 확인되지 않음; 기존 코드는 외부 학습 가중치 추론.
4. `0.60` 후보 컷오프를 모델 정확도로 해석해서는 안 됨.
5. 기존 상업 차단 검사는 개발 모델 일부만 검사하며 `npm run build` 기본 경로에서 `--commercial`을 호출하지 않음.
6. 실기기 장기 메모리·발열·배터리와 대규모 독립 검증 자료 확보가 과제로 남음.
