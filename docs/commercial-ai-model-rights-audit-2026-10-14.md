# 감자싹 AI 모델 상업 배포 권리 및 가중치 계보 조사 (2026-10-14)

- 기준: `HyeSeong123/newAlbum` / `feature/warm-journal-v2`, `package.json` 0.9.9.
- 목적: 광고 포함 Android 앱 배포 전 **실제 사용 모델의 코드, 가중치, 학습 데이터 권리를 별개로** 조사한다.
- **결론: 상업 출시 최종 승인 불가(추가 증빙 필요)**. 이는 불법 확인 또는 모든 모델의 상업 사용 금지를 뜻하지 않는다.
- 조사 유형: 소스 구성/잠금 매니페스트/원 개발자·데이터셋 라이선스 문서 검토. **외부 권리자 서면 승인, 실물 APK 자산 스캔, 모델 바이너리 독립 재다운로드·SHA256 재계산은 수행하지 않았다.**

## 1. 실제 모델 구성과 판단

| 모델/역할 | 앱 파일 또는 로더 | 모델 가중치 공개 권한 | 학습 자료의 남은 쟁점 | 상업 출시 판단 |
|---|---|---|---|---|
| FaceX tiny512, 추가 인물 특징 | `public/models/people512/facex-tiny.onnx`, `embedding512.ts` | FaceX 작성자 Apache-2.0 및 commercial-use 명시 | MS1M-RefineV2 ← MS-Celeb-1M 원본 비상업 연구 계약과 파생 가중치의 관계 | 보류/법적 검토 |
| FaceAPI SSD MobileNet V1, 얼굴 검출 | `public/models/faces/ssd_mobilenetv1_model.bin` | face-api 코드 MIT; 원래 yeephycho detector는 Apache-2.0 | 원 저자의 WIDER FACE 학습 명시; 원 데이터 라이선스 CC BY-NC-ND | 보류/법적 검토 |
| FaceAPI 68 landmarks, 얼굴 정렬 | `public/models/faces/face_landmark_68_model.bin` | face-api 코드 MIT | 원저자의 약 35k 얼굴 학습 이미지의 권리 내역 미공개. dlib 별도 `shape_predictor_68...`와 동일하다고 볼 근거 없음 | 원 개발자 증빙 필요 |
| FaceAPI 128-d ResNet, 얼굴 특징 | `public/models/faces/face_recognition_model.bin` | FaceAPI 원 저자는 dlib Davis King 가중치 계보 명시; Davis King 본인 가중치는 public domain 선언 | 패키지된 변환 가중치 일치 및 FaceScrub/VGG/웹 수집 학습 이미지 권리 | 계보/법적 검토 |
| QuadPose f2, 반려동물 자세 | `public/models/pet-pose/quadpose.onnx` | 제작자 Apache-2.0 | AP-10K 원본 LICENSE CC BY 4.0 vs MMPose dataset zoo 'non-commercial', 제3자 사진, ImageNet 백본 및 ViTPose teacher 계보 | 보류/서면 확인 |
| SSDLite MobileNet V2, 개·고양이 탐지 | `public/models/pets/detector/model.json` + shard 5개 | TensorFlow 게시자 Apache 2.0 | COCO 원 사진은 Flickr 권리자 소유; 가중치 이용과 사진 재배포는 구분 | 근거 양호/고지 검토 |
| MobileNet V1 1.0 224, 반려동물 특징 | `public/models/pets/embedding/model.json` + shard | 감자싹 `docs/pet-recognition.md`에 Google 게시자 Apache 2.0 기록 | ILSVRC ImageNet 데이터 직접 사용은 non-commercial research/education; 정확한 TF.js 파일과 게시자 모델 카드의 동일성 추가 점검 | 근거 양호/추가 확인 |
| OpenCV frontal cat cascade | `src/features/pets/engine/cat-face-cascade.json` | 원본 Joseph Howse BSD 유형 재배포 허가; `public/notices/pet-cat-face-license.txt` 존재 | 출처·저작권 고지의 실제 APK 포함 확인 | 상대적 위험 낮음 |

추론 런타임은 `@vladmandic/face-api@1.7.15` (MIT), `@tensorflow/tfjs@4.22.0`·`tfjs-backend-wasm@4.22.0` (Apache-2.0), `@tensorflow-models/coco-ssd` (Apache-2.0), `onnxruntime-web@1.22.0` (MIT)이며, 런타임 허가는 **외부 학습 가중치의 모든 권리를 자동으로 해결하지 않는다**.

## 2. 확인된 1차 출처

### FaceX
- 작성자의 저장소는 직접 학습한 인식 모델 가중치 Apache-2.0·상업 이용 허용을 명시하고 `tiny` 512차원 가중치의 MS1M-RefineV2 학습을 공개: https://github.com/facex-engine/facex
- 원 프로젝트의 가중치 커밋은 잠금 파일에 `af7ca9937705a10901ca4b72c4eb19ef49a4ac53`로 명시; `docs/demo/facex_tiny.enc` 복호화 후 설치.
- MS-Celeb-1M Microsoft Research 비상업 연구 이용 계약: https://frchallenge.github.io/assets/MSR-LA%20Data-MSCeleb.pdf
- 위 계약이 FaceX가 자체 학습해 별도 배포한 가중치에 어느 범위까지 미치는지는 확인되지 않았다. 'Apache-2.0이므로 모든 데이터 권리 확보'라고 단정하지 않는다.

### FaceAPI: 세 모델의 별도 계보
- 감자싹 로더 `src/features/people/engine/faceApiAdapter.ts`는 SSD 검출 + 68 랜드마크 + 128 임베딩을 **동시에** 사용한 후 FaceX 512 임베딩을 추가로 계산한다. 512만 교체해도 3개의 FaceAPI 의존은 남는다.
- `@vladmandic/face-api`가 원본 가중치 출처를 `face-api.js-models`라고 명시: https://github.com/vladmandic/face-api/blob/master/README.md
- 원본 모델 파일 저장소: https://github.com/justadudewhohacks/face-api.js-models (현재 별도 LICENSE 파일은 목록에서 확인되지 않음; 원본 코드 저장소는 MIT)
- SSD: https://github.com/justadudewhohacks/face-api.js#available-models 는 `yeephycho` 가중치와 WIDER FACE 학습을 명시. 원 제작자 https://github.com/yeephycho/tensorflow-face-detection 는 모델 Apache-2.0 및 WIDER FACE 별도 조건을 알린다. 공식 데이터셋 https://mmlab.ie.cuhk.edu.hk/projects/WIDERFace/ 은 CC BY-NC-ND를 적는다.
- 68 랜드마크: 원 제작자는 약 35k 얼굴 학습만 밝혔고 이미지별 라이선스가 확인되지 않았다. **주의**: dlib `shape_predictor_68_face_landmarks.dat`의 iBUG 300-W 비상업 조건을 이 FaceAPI 가중치에 근거 없이 적용하지 말 것. 별도 dlib 모델의 경고: https://github.com/davisking/dlib-models
- 128 인식: face-api.js는 Davis King 학습 가중치를 설명; Davis King은 자신의 인식 가중치의 public domain 사용 허가를 밝히지만 FaceScrub, VGG, 인터넷 수집 이미지 기반 학습과 제3자 권리까지 보증하지 않음: https://github.com/davisking/dlib-models

### QuadPose 및 AP-10K
- 앱이 가리키는 가중치는 `EstevanSL/snapml-quadruped-pose`의 `52f0329b5c9af513b5a8f2820aaea6bbd945d0c0/models/quadpose_f2.onnx`.
- 원 저자 Apache-2.0 명시 및 AP-10K 이용 제한 불일치·상업 사용 전 확인 권고: https://github.com/EstevanSL/snapml-quadruped-pose
- 고정 커밋 `NOTICE`: https://github.com/EstevanSL/snapml-quadruped-pose/blob/52f0329b5c9af513b5a8f2820aaea6bbd945d0c0/NOTICE
- AP-10K 원 배포자 CC BY 4.0: https://github.com/AlexTheBad/AP-10K/blob/main/LICENSE
- MMPose의 AP-10K 'non-commercial only': https://github.com/open-mmlab/mmpose/blob/main/docs/en/dataset_zoo/2d_animal_keypoint.md
- ImageNet 직접 데이터 사용 조건(비상업): https://www.image-net.org/download
- 원 저장소의 Snap 모델 검출기는 **별도 Lens prefab에만 포함**. 감자싹의 실제 검출 경로는 TensorFlow COCO-SSD이므로 Snap detector를 감자싹 사용 모델로 잘못 분류하지 않는다.

### 반려동물용 Google 모델 및 고양이 cascade
- SSDLite TF.js 모델 게시자 Apache-2.0: https://www.kaggle.com/models/tensorflow/ssdlite-mobilenet-v2/tfJs/default/1
- COCO 원본 사진은 COCO 공동체 소유가 아님: https://github.com/cocodataset/cocodataset.github.io/blob/master/dataset/termsofuse.htm
- MobileNet V1 ILSVRC 학습 출처: https://www.kaggle.com/models/google/mobilenet-v1/ ; ImageNet 데이터 직접 사용 제한: https://www.image-net.org/download
- 고양이 frontal cascade 변환 고지 및 원본 XML 지문은 `public/notices/pet-cat-face-license.txt`에 정리.

## 3. 잠긴 파일/해시: 검사한 범위와 미검증 구분

| 모델/자산 | 소스 및 설치 처리 | 프로젝트에 고정된 SHA-256 |
|---|---|---|
| FaceX tiny512 | `scripts/recognition-models.lock.json`의 upstream 암호화 데모, 빌드시 AES-GCM 복호화 | 배포 ONNX: `4b4f191410cfc172d9d319f381e175ff3b2c08a5eb5584aefbe24d4dc0a6394c` |
| QuadPose f2 | 같은 lock의 upstream ONNX | `f3807433962d8abcee18f1bd45e5ff9e56bd899768b03a6996c3db4ebd12b884` |
| SSD FaceAPI `.bin` | `@vladmandic/face-api@1.7.15/model` 복사 | `2835640602d53718aa6ae9a42896327eaa21beefed056c218d32ca7d79e1e2f8` |
| Landmark FaceAPI `.bin` | 동일 패키지 | `4611ef65c87d836d03d684b30eec4d195d8b219fa1dd58fc58945831c6b9299b` |
| ResNet 128 FaceAPI `.bin` | 동일 패키지 | `b413e420d6840b2775fba32008db6f3cddb07d485967fb42cfcf379c16a8c589` |
| Pet SSDLite model.json | Google Storage 공개 TF.js 위치+5 shards; 모든 파일 크기·SHA 고정 | `3770b2528339b1e3340cb74360e1e40401816b009779aeb8d0cce3a4353ea3a9` |
| Pet MobileNet V1 model.json | Google Storage TF.js Layers 위치+다수 shards; 모든 파일 크기·SHA 고정 | `a4704cbfa5ca688eaf1fd24bf34bebebb9f4d1c20fac91236b208750c5006714` |
| Cat frontal cascade JSON | OpenCV XML → JSON, Worker 내 포함 | `69cf5c1a84f33860a396b696d44f98ea0f15a3d7e0d6c00e14e5cb8fac2fa2a3` |

위 값은 **프로젝트 파일에 적힌 기대 지문**이다. 빌드 스크립트가 다운로드/복사 시 검증하도록 구현되어 있다는 점은 확인했지만, 이번 조사에서 원본 바이너리를 따로 다운로드하여 SHA256을 재계산하거나 최종 APK와 바이트 단위 대조하지 않았다. 최초 소스 게시자가 설명한 학습 계보와 **개별 가중치가 동일한지에 대한 독립적 재현 증명도 없음**.

## 4. 릴리스 게이트와 고지 관련 결함

1. `scripts/verify-recognition-models.mjs --commercial`은 `scripts/recognition-models.lock.json`의 **단일** `commercialClearanceConfirmed` 값만 검사하며 FaceAPI 별도 검토, Pet 두 모델/고양이 cascade의 상세 승인을 통합 검사하지 않는다.
2. `package.json`의 `prebuild`는 `node scripts/verify-recognition-models.mjs`만 수행한다. `--commercial`이 **기본 APK/AAB 생성 경로에 자동 연결된 것은 아니다**. 따라서 개발 빌드 성공을 상업 출시 승인으로 오인할 수 있다.
3. `scripts/prepare-face-models.mjs`는 `person-model-review.json`의 `commercialClearanceConfirmed===false`가 아니면 오류를 발생시킨다. 향후 정당한 증빙으로 승인값을 변경할 때 이 로직도 업데이트 필요.
4. `prepare-recognition-models.mjs`는 FaceX/QuadPose에 공통 Apache License만 모델 디렉터리로 복사한다. QuadPose의 모델·AP-10K 출처 고지가 담긴 상위 `NOTICE`를 필수 범위에 맞게 포함하고 배포 결과를 확인해야 한다.
5. `public/notices` 내 BSD 및 TFJS 관련 고지의 존재는 확인했지만, 서명된 릴리스 AAB/APK에서 실제 파일 및 접근 가능성을 검사하지 않았다.

## 5. 해결 우선순위 및 서면 확인 질문

- **P0 FaceX:** 제작자 `bauratynov@gmail.com`(공식 README 명시)에게 정확히 `tiny` 512-d ONNX, 정적 Android APK 재배포, 광고/유료 앱 이용, MS1M-RefineV2 수집·사용 라이선스, 3자 권리/면책 범위를 서면 확인. 필요한 경우 MS-Celeb-1M 원 권리자/법률 검토.
- **P0 SSD/얼굴 정렬:** `yeephycho`/WIDER FACE 관리 주체에 학습된 검출 가중치의 상업 앱 배포 가능 범위를 확인; 원 face-api.js 관리 주체에 68-point 학습 35k 사진의 정확한 구성 및 가중치 허가를 요청.
- **P1 QuadPose:** 원 개발자와 AP-10K 저자에게 CC BY 4.0 vs 비상업 표기의 불일치, 웹 수집 사진과 백본/teacher 권리, 필요한 Attribution/NOTICE 문구를 확인.
- **P1 dlib 128:** 공개 도메인 원본 가중치와 FaceAPI 변환 가중치의 출처·동일성 문서화. FaceScrub/VGG/웹 수집 자료에 대한 법적 검토.
- **P2 Google/카스케이드:** 모델 게시자의 정확한 TF.js 가중치 변형과 해시의 관계, ONNX/TFJS/WASM/고양이 cascade의 저작권 고지 반영 확인.
- **릴리스 통제:** 각 모델별 `commercialClearanceConfirmed`+증빙 URL/서면 기록·검토일·해시를 관리하고 릴리스 빌드가 필수 검증을 통과하지 못하면 배포 차단. 모델을 단순 UI 비노출 처리하는 방식은 권리 해결이 아님.

**권리 상태 기록 규칙**: Apache/MIT/BSD에 의한 코드·가중치 이용 허가가 확인됐다는 사실과 학습 데이터 계약의 효력이 해결됐다는 결론을 분리한다. 개발자 답변만으로 다른 이미지 권리자까지 자동 허가받은 것으로 표시하지 않는다. 최종 상업 출시 결정에는 권리자의 명시적 증빙 또는 적격 법률 검토가 필요하다.

## 검토하지 않은 것

- 이번 문서는 AI 모델/가중치 중심이다. 일반 Android 라이브러리 전체 SBOM·모든 폰트/아이콘/미디어 자산의 라이선스, Google Play 광고 정책, 개인정보·생체인식 동의는 별도 검토 필요.
- 개발자나 데이터셋 권리자에게 **연락을 보내거나 답변을 수령하지 않았다**. 법률 자문 또는 상업 사용 허가서가 아니다.
