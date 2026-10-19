# 아키텍처 및 통합 결정

## 기존 코드 조사와 재사용

사람의 `faceService → engine/client → person.worker → faces/person_engine` 및 동물의 `usePetAnalysis → manager/client → pet.worker → pet_recognition/pet_jobs` 경로를 확인했다. 기존 공유 `src/features/ai/runtime.ts`의 직렬화·도메인 교체·취소 계약과 기존 사진/수동 등록/영구 분석 대기열을 재사용한다. 새로운 범용 영구 작업 시스템이나 사용자/반려동물 ID를 만들지 않았다.

기존 엔진·모델 저장소는 비교용으로 남기고, 기본 모드에서는 두 client 입구에서 미학습 오류를 반환한다. 이 오류는 이미지 fetch와 Worker 생성 및 성공 결과 저장 전에 발생한다. 실패를 `[]`로 위장하지 않으므로 재분석 시 기존 얼굴/동물 연결을 빈 결과로 대체하지 않는다. 기본 프런트 빌드에서는 Vite resolve 경계에서 기존 client를 미학습 모듈로 연결해 외부 모델 Worker 변환 자체를 막으며 (단순 분기 제거만으로는 orphan Worker가 남는 것을 실제 빌드에서 확인해 수정), 남은 개발 의존성은 상업 게이트에서 별도 차단한다. 패키지의 기존 라이브러리를 새 가중치 학습에 사용하지 않았다.

## 디렉터리와 경계

| 경로 | 책임 |
| --- | --- |
| `src/features/ai/native/core.ts` | RGB/RGBA·EXIF 1–8·8×8 nearest resize·HWC Float32 [-1,1], 유한성·차원·0벡터 검사, L2·코사인·거리, 버전/해시/전처리 일치, 후면 및 반전 비교 정책 |
| `native/engines.ts` | 사람 6개/동물 7개 단계 계약, 복수 검출·랜드마크·방향·512 특징 등 출력 타입, 미학습 상태, 사용자 검토 전용 matcher |
| `native/network.ts` | 독립 MLP 192→24→512→K, tanh·softmax·교차 엔트로피·SGD 역전파, 무작위 초기화, 합성 생성기·분리·평가 |
| `native/session.ts` | SHA-256 확인 후 실제 JSON 모델 로드, 포맷·shape·task 검사, 단일 모델 보유·해제 |
| `native/native.worker.ts`, `native/client.ts` | 앱 Worker CPU 추론, 기존 runAI 직렬화, SHA별 중복 로드 방지, 로컬 경로 제한, 취소/타임아웃·30초 유휴 정리·대기 8개 제한 |
| `native/NativePipelineProbe.tsx` | 개발용 명시적 실행/중단, 실제 인식 결과로 저장하지 않는 합성 진단 |
| `native/storage.ts` | 새 특징 sidecar 저장/페이지 조회 Tauri 계약 |
| `scripts/native-ai/` | 권리·해시 검사 로컬 RGB loader, epoch 체크포인트/복원/export/provenance, 출시 게이트 |
| `src-tauri/database/native-ai.sql`, `src-tauri/src/native_ai.rs` | v18 비파괴 모델·특징 저장소, 원본 SHA 검사·정규화 검사·기존 감지 영역 검증 |
| `models/native/registry.json` | 빈 실제 모델 레지스트리, 상업 승인 false |

512층은 **합성 분류 신경망의 은닉층**이다. 실제 인물 512 임베딩으로 내보내지 않는다. 모델의 task는 `synthetic-rgb-classification`이며 Person/Pet 추출 함수는 계속 미학습 상태다. 실제 학습 단계에는 얼굴 alignment, metric learning과 개체/촬영 세션별 평가 및 각 탐지/자세 task 아키텍처를 추가해야 한다. 8×8 MLP는 고해상도 얼굴 인식용 backbone이 아니다.

## 실행 방식 선정

| 선택지 | 이번 판단 | 한계/의무 |
| --- | --- | --- |
| 자체 TypeScript CPU + Worker | 채택. 학습·앱이 동일한 전처리/순전파 모듈을 사용하고 추가 모델·프레임워크가 필요 없다. 기존 WebView Worker 경로에 연결 가능. | 소형 합성 모델만 타당. JS 배열 가중치·스칼라 연산은 실제 대형 CV 모델에 비효율적. Android 실측 없음. |
| Rust 네이티브 추론 | 저장·지문 검증만 사용. 추론 중복 구현은 보류. | 다른 언어 순전파는 parity 검사·FFI·모바일 빌드 부담 증가. 향후 양자화 모델 실행 방식으로 재검토. |
| ONNX Runtime Web/WASM | 기존 프로젝트에 있으나 새 모델에 미사용. | export 연산 지원·입출력 parity·런타임 고지·WASM 자산 번들 및 Android 실측이 필요. |
| 학습 프레임워크 도입 | 이번 소형 증명에는 미채택. 실제 CV 학습 전에 검토. | 이번 수동 SGD 구현이 대규모 학습 프레임워크를 대체한다는 뜻이 아니다. |

신규 자체 경로의 WASM 가속은 **미구현**이다. 기존 WASM 기능을 새 엔진의 실적으로 계산하지 않는다. CPU Worker 최저선부터 실제 단말로 검증한 뒤 대형 모델/가속기를 선정한다. 학습은 개발 머신 CLI에서 실행하며 휴대폰에서 자동 학습시키지 않는다.

## 저장 및 원본 변경

DB v17→v18은 두 테이블·인덱스·보호 트리거만 추가한다. 기존 media/person/pet/detected_face/pet_detection/수동 확인·앨범·일기를 UPDATE/DELETE하지 않는다. 기존 ID를 외래키로 참조한다. 모델 키는 변경 불가이며 task·kind·dimensions와 복합 외래키를 가진다. 모델 SHA/전처리 변경은 새 model_key가 필요하다.

현재 실제 승인 모델은 **0개**이다. toy 출력은 이 저장소에 들어가지 않는다. 향후 모델 등록은 독립 평가·권리 검토 후 별도 관리 도구를 마련해야 하며, 검토되지 않은 등록 UI/API는 이번에 만들지 않았다. `trained-reviewed` 레코드만 저장 가능하다. 저장은 트랜잭션 안에서 현재 원본 SHA, 벡터 차원/유한성/L2 norm, 얼굴/동물 영역의 media 소속을 검증한다. 조회는 model_key와 현재 source_key 및 region 페이지로 제한한다. 오래된 특징은 남기되 현재 원본과 다른 행을 조회하지 않는다. 모델 호환 비교는 SHA와 전처리까지 일치해야 한다.

삭제는 사용자가 원본 등록 항목이나 감지 영역을 삭제할 때만 새 특징에 CASCADE된다. 새 엔진은 사용자의 신원 연결을 만들거나 지우지 않는다. 자동 연결은 모든 matcher 결과에서 false이다. 후면은 color-shape만 허용하며 identity 특징과의 비교는 오류다.

DB 롤백은 앱을 종료하고 기존 `album.sqlite`와 WAL/SHM을 일관된 방식으로 백업한 뒤 진행해야 한다. 권장 방법은 SQLite backup API 또는 앱 종료 후 일관된 복사다. v18 DB를 그대로 v17 앱에 열면 기존 버전 보호가 거절한다. 구버전 앱으로 복귀할 때는 마이그레이션 전 백업을 복원한다. sidecar만 제거하는 개발 테스트는 기존 사용자 데이터를 건드리지 않지만 운영 자동 downgrade를 제공하지 않는다.

## 권리·프라이버시 경계

모델 구조/직접 작성 코드, 새 가중치, 학습 이미지, 기존 개발 의존성의 권리를 분리한다. 새 학습 경로는 사전학습 로더·교사 출력·원격 API가 없고 로컬 RGB JSON만 받는다. 실제 사진을 사용하지 않았다. 생성기와 seed·소스 해시로 합성 자료를 재현한다.

일반 런타임은 JavaScript/Web APIs, Node 내장 fs/crypto/child_process, TypeScript 컴파일 도구를 사용한다. 기존 Tauri/Rust/SQLite의 고지 의무가 사라지는 것은 아니다. 새 수학 연산에 TensorFlow/FaceAPI/ONNX 모델 코드를 복사하지 않았다. 기존 전체 앱의 라이선스 의무나 특허/상표/개인정보·생체정보 문제를 해결했다고 주장하지 않는다.

실제 데이터 loader는 파일 해시·상업 학습 허가·동의·출처·증빙·검토자·검토일을 요구한다. 선언 필드가 법적 허가를 만들어 주지는 않으므로 원본 증빙에 대한 사람의 검토가 필수다. 새 특징 저장소도 자동 암호화되지 않으며, 실서비스 전 암호화·접근/보존/철회 정책 검토가 필요하다.

기본 build는 외부 모델을 준비하지 않는다. legacy opt-in, 기존 모델 의존성, 미확인 registry, 의심 자산을 출시 게이트에서 차단한다. npm AAB/설치 패키지 명령뿐 아니라 Rust release build.rs에도 게이트를 연결했다. 현재 최종 산출물 감사가 없으므로 **게이트는 의도적으로 항상 닫힘**이다. 향후 실제 모델 단계에서 실물 APK/AAB allowlist·해시/계보 검사로 대체하고 독립 검토해야 한다. 승인 필드만 true로 바꾸어 상업 배포를 허용하는 구현이 아니다.
