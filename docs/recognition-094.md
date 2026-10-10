# 감자싹 AI 0.9.4 개발 결과

## 상태

현재 기준은 `feature/warm-journal-v2`의 `cf7c13d5c944525f7fe352711f0cc5e541386453`이다. 이미 적용된 0.9.4의 쉬운 사람 메뉴를 유지한다. 본 작업은 추가 고도화이며 버전은 요청한 0.9.4를 유지한다.

**전체 목표 완료가 아니다.** 승인 가능한 실제 512차원 가중치, 강아지·고양이 좌우 자동 모델, 독립 평가 사진 800장과 실제 ARM64 휴대폰이 확보되지 않았다. 사용자는 평가 자료가 아직 없다고 답했다. 아래 구현과 검증 결과를 실제 정확도 달성과 구분한다.

| 기능 | 결과 |
|---|---|
| FaceAPI 128차원 | 유지. 기존 ID·특징·확인 링크·대표 사진 보존 |
| 실제 학습된 512차원 모델 | **미설치·미완료**. 가중치 상업권 및 학습 자료 권리 미확보 |
| 512차원 TFJS Graph 어댑터 | 5점 정렬·실제 모델 출력 검사·L2 정규화·오프라인 경로 제한·지연 로딩·해제·128차원 fallback 구현. 승인 레지스트리는 비어 있음 |
| 사람 자동 방향 | 68점 중 6점의 근사 3D 머리 모델에 투영 최적화. yaw·pitch·roll 분리, 경계·불량 적합 UNKNOWN. **기하 추정이며 실제 정확도 미검증** |
| 완전한 측면 탐지 개선 | 기존 SSD/68점의 실패 한계가 남음. 대체 탐지 모델의 권리·가중치 미확보로 미완료 |
| 반려동물 기존 엔진 | COCO-SSD 종 탐지 + MobileNet 1024차원 + 공간 색상/형태·반전 비교·고양이 정면 캐스케이드 유지 |
| 반려동물 좌우 자동 판별 | **미설치·미완료**. 기존 고양이 정면 결과와 UNKNOWN만 자동 기록. 수동 입력을 자동 성공으로 계산하지 않음 |
| 방향별 후보 비교 | 사람/개/고양이 각각 6개 조합 별도 집계. 기존 모델의 각 공간만 비교. 128↔512 혼합 없음 |
| 800장 평가 | **0/800장**, 정확도·목표 달성 미측정. 자료 구성·중복·세션·지문 검증 도구 추가 |
| 반려동물 자동 연결 | 꺼짐. 사용자가 최종 확인. 뒷모습은 색상·형태 참고 후보만 유지 |

## 모델과 라이선스

| 모델 | 코드 / 가중치 / 학습 자료 검토 | APK |
|---|---|---|
| 기존 `@vladmandic/face-api@1.7.15` SSD/68점/ResNet 128 | MIT 코드. 기존 잠금 지문 그대로. 학습 자료 전체 상업권은 기존 보고서에서도 미확정 | 기존 유지 |
| 기존 COCO-SSD/MobileNet TFJS 및 고양이 cascade | 기존 Apache/MIT/BSD 고지와 가중치 잠금 유지. 기존 자료 권리의 미해결 항목은 `docs/pet-recognition.md` 참조 | 기존 유지 |
| InsightFace ArcFace 계열 | MIT 코드를 가중치 권리로 확대하지 않음. 공식 배포 학습 자료/모델은 비상업적 연구용, 상업 허가 별도 | 제외 |
| FaceNet VGGFace2 체크포인트 | MIT 코드, 해당 학습 데이터 상업권 미확정 | 제외 |
| OpenCV SFace | 모델 디렉터리 Apache-2.0. 이번 검토에서 체크포인트 학습 데이터 권리·출처의 추가 근거를 확보하지 못함 | 제외 |
| PetFace | 공식 저장소가 데이터·코드·가중치를 비상업적 연구용으로 제한 | 제외 |

근거: [InsightFace 공식 정책](https://github.com/deepinsight/insightface#license), [FaceNet 공식 모델 목록](https://github.com/davidsandberg/facenet), [SFace 공식 디렉터리](https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface), [SFace 학습 출처 확인 논의](https://github.com/opencv/opencv_zoo/issues/318), [PetFace 공식 조건](https://github.com/mapooon/PetFace).

새 가중치는 하나도 추가하지 않았다. `verify-recognition-models.mjs`는 미승인 512/반려동물 자세 가중치 폴더가 있으면 빌드를 거부한다. 네이티브도 비어 있는 승인 레지스트리 밖의 512 특징 저장을 거부한다. 128차원 패딩·복제로 512차원을 생성하지 않는다. 기존 모델의 상업 출시 권리까지 해결됐다고 보고하지 않는다.

## 방향과 저장

SQLite 15→16은 추가 테이블만 생성한다. `detected_face.descriptor` 및 사람·반려동물·앨범·사진·일기 링크를 변경하지 않는다.

- `person_face_pose`: 자동 yaw/pitch/roll/view/적합 오차 JSON과 `manual_view`를 별도 보존.
- `person_model_feature`: 향후 승인 512 모델의 `(face_id,model_version)`별 특징·차원·원본 지문. 이번 버전에는 실제 512 특징 0개.
- `pet_direction_observation`: 자동 방향·출처와 수동 방향 분리. 과거 수동 입력에 가려져 복구할 수 없는 자동 방향은 NULL이며 성공으로 추정하지 않음.

사진 보는 사람 기준 왼쪽은 LEFT, 오른쪽은 RIGHT이다. yaw의 부호로 판별한다. roll로 좌우를 판단하지 않는다. EXIF를 적용한 ImageBitmap 픽셀을 분석하며 사진 원본은 변경하지 않는다. 표시 픽셀이 반전되면 LEFT/RIGHT도 그 픽셀 기준으로 바뀐다. 수치적 회전·반전 테스트는 실제 측면 사진의 정확도 검증을 대신하지 않는다. 일반 사람 메뉴에는 검증·기기 측정 버튼을 넣지 않고, 설정의 접힌 고급 검증에서 방향 수정·평가를 제공한다.

## 독립 평가 규칙과 결과

기본 구성은 사람 10명, 개 5마리, 고양이 5마리 × 40장이다. 개체별 등록 정면/좌측/우측 각 2장과 평가 정면 10장/좌측 12장/우측 12장을 요구한다. 기본 800장은 등록 120장 + 평가 680장이다. 추가 미등록·닮은 개체·다중·어두움·가림 평가를 기본과 별도로 관리한다.

`node scripts/validate-recognition-dataset.mjs manifest.json 사진폴더`로 실제 파일 SHA-256, 기본/추가 구분, 개체·방향별 수량, 등록/평가 세션 분리, originId·derivativeOf·중복 지문을 검사한다. 신고하지 않은 크롭·반전·유사 사진은 사람이 촬영 출처를 감사해야 한다. 메타데이터만으로 독립성을 완전히 증명하지 않는다. 예제 800장 사진이나 가상 성공 수치를 생성하지 않았다.

| 대상 | 평가 사진 | 정면 탐지/Top-1 | 좌측 탐지/Top-1 | 우측 탐지/Top-1 | 좌우 자동 방향 | 오연결/미등록 오수락 |
|---|---:|---|---|---|---|---|
| 사람 | 0 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 |
| 강아지 | 0 | 미측정 | 미측정 | 미측정 | 모델 미설치·미측정 | 미측정 |
| 고양이 | 0 | 미측정 | 미측정 | 미측정 | 좌우 모델 미설치·미측정 | 미측정 |

방향별 탐지·Top-1은 성공/전체와 Wilson 95% 구간을 출력한다. 탐지 실패를 분모에 포함한다. 자동 방향과 사람이 입력한 정답은 별개다. 6개 비교 조합은 방향별 등록 풀을 제한해 비교하며, 사진 총수와 조합별 비교 횟수를 합산하지 않는다. 등록 방향 자료가 없는 조합은 미측정과 부족 건수로 표시한다. 이 비교는 **정답 방향을 조건으로 한 저장 특징의 후보 비교**이며 자동 방향을 포함한 전체 새 엔진 정확도라고 부르지 않는다.

반려동물 60% 달성은 개/고양이 각각 5개체 이상, 좌측·우측 각 60개의 서로 다른 평가 사진, 좌우 각각 Top-1 Wilson 95% 하한 ≥60%를 모두 만족해야 한다. 종 자동 분류 오류도 실패로 계산한다. 부족하면 판단 보류다. 사용자 연결을 실제로 변경하는 자동 오연결 실험은 수행하지 않았으므로 관련 값은 NULL이다. 사람의 기존/새 512 비교는 새 모델 미설치로 불가하다.

설정 → 인식 검증 열기·고급에서 사람/반려동물 평가를 열 수 있다. 개·고양이 필터, 실패 사진 선택, 정답 입력, 자동 방향/수동 수정 분리, 좌우·6조합 결과, JSON/CSV 결과 저장을 제공한다. 원본 사진을 결과 파일에 넣지 않는다. 기존 반려동물 특징 자료 JSON 내보내기는 별도 유지한다. CSV 수식 시작 문자를 이스케이프한다. 기기·모델·평가 시간을 기록하되 저장 특징 비교 시간을 원본 사진 추론 시간으로 보고하지 않는다.

## 추가 학습 계획과 남은 개발

사람 512는 상업 재배포·학습 자료 권리까지 명시한 공급자 계약 모델을 확보하거나, 동의·권리가 확보된 별도 대규모 인물 자료로 직접 학습해야 한다. 800장 평가는 학습 자료로 섞지 않는다. 확보 후 입력 크기/정규화·5점 정렬·모델 출력 이름·가중치 지문을 승인 레지스트리에 고정하고 TFJS WASM/CPU 및 ARM64에서 확인해야 한다. 특징 공간별 임계값을 다른 보정 자료에서 정하고 평가 사진으로 튜닝하지 않는다.

반려동물 좌우/뒷모습 모델은 직접 촬영·사용 동의 자료에 종/머리·눈·코·귀·몸통 랜드마크와 화면 기준 방향을 라벨링한다. 작은 자세 분류 모델과 개체 임베딩 모델은 다른 과제로 학습한다. 학습/보정/평가는 개체와 촬영 세션·원본 단위로 분리한다. 좌우 반전 증강은 학습에서 방향 라벨을 뒤집되 평가 독립 장수에 포함하지 않는다. 256/512/1024 후보를 같은 독립 개체·좌우 세트와 ARM64 지연/메모리로 비교한다. 기존 MobileNet 특징이 개체 식별에 충분하다는 증거는 아직 없다. 종별 좌우 성능과 미등록 오수락이 검증되기 전 자동 연결을 켜지 않는다.

완전한 측면·가려짐의 랜드마크 실패는 별도 탐지 실패로 남는다. 큰 측면 사진 탐지를 위한 새 검출/랜드마크 모델, 강아지 얼굴 영역 자동 검출, 실제 512/Pet 개체 특화 모델은 모두 다음 단계다. 원본 지문 변경·모델 변경 시 기존 연결을 보존하고 덮어쓰지 않는 정책을 유지한다.

## 검증 및 빌드

로컬 TypeScript 검사 및 단위 테스트 123개, Python 저장·마이그레이션 테스트 19개 통과. 로컬은 Rust/Chromium 실행 파일이 없어 네이티브·브라우저 검증은 원격 CI에서 실행한다. CI 결과, 실제 APK 지문 및 코드 커밋은 빌드 후 아래에 확정 기록한다.

Android 반복 검사는 동일한 권리 확인된 테스트 사진 1장을 사람/반려동물 Worker로 번갈아 총 100회 실행한다. 독립 사진 100장 또는 800장 정확도 평가가 아니다. 기존 DB 스냅샷 불변·WASM 실행·텐서 수 안정성을 검사한다. 에뮬레이터 결과를 실제 ARM64 휴대폰 시간·메모리·발열·배터리 측정으로 보고하지 않는다. 저사양 실기기·100장 서로 다른 대용량 사진·열/배터리는 미측정이다.

### 빌드 확정 기록

CI 실행 결과를 기다리는 중. ARM64 APK는 새 앱 코드 빌드 결과만 제공한다.

## 변경 파일

- `.github/workflows/source-validation.yml`
- `docs/recognition-094.md`
- `package.json`
- `public/notices/recognition-094-review.json`
- `scripts/person-repetition-smoke.mjs`
- `scripts/validate-recognition-dataset.mjs`
- `scripts/verify-recognition-models.mjs`
- `src-tauri/database/recognition-094.sql`
- `src-tauri/database/schema.sql`
- `src-tauri/permissions/album-library.toml`
- `src-tauri/src/database.rs`
- `src-tauri/src/faces.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/person_evaluation.rs`
- `src-tauri/src/pet_evaluation.rs`
- `src-tauri/src/pet_recognition.rs`
- `src-tauri/src/recognition.rs`
- `src/App.tsx`
- `src/features/ai/metrics.ts`
- `src/features/ai/protocol.ts`
- `src/features/ai/reportExport.ts`
- `src/features/people/PersonEvaluationPanel.tsx`
- `src/features/people/engine/client.ts`
- `src/features/people/engine/embedding512.ts`
- `src/features/people/engine/faceAlignment.ts`
- `src/features/people/engine/faceApiAdapter.ts`
- `src/features/people/engine/pose.ts`
- `src/features/people/engine/types.ts`
- `src/features/people/faceService.ts`
- `src/features/people/people.css`
- `src/features/pets/PetEvaluationPanel.tsx`
- `src/features/pets/engine/client.ts`
- `src/features/pets/engine/evaluation.ts`
- `src/features/settings/RecognitionEvaluation.tsx`
- `src/features/settings/SettingsPanel.tsx`
- `tests/pet-engine.test.mjs`
- `tests/recognition-094.test.mjs`
- `tests/recognition-settings.spec.ts`
- `tests/test_recognition_094.py`
