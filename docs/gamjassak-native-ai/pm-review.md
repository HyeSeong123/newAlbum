# PM 통합 검토 및 승인 판단

검토일: 2026-10-19 KST. 동일 작업자가 구현 후 PM 역할로 코드·명세·테스트를 재검토했다. 별도 사람/법률가/외부 평가자의 독립 승인으로 해석하지 않는다.

## 결론

**다음 기초 연구·실제 task 모델 개발 단계는 CONDITIONAL PASS. 기존 안정 앱 대체 및 상업 출시는 FAIL.** 학습 파이프라인은 실제로 동작한다. 하지만 실제 사람/동물 모델, Android 실기기 검증, 권리·개인정보 검토는 완료되지 않았다. 최종 GitHub 검증에서 Node 140개·Python 22개·Rust 116개·브라우저 47개가 통과했고 1개는 화면 조건으로 건너뛰었다. 상업 출시 차단은 유지한다.

## 설계상 타당한 부분

- 인터페이스만 만드는 데서 끝내지 않고 무작위 초기화·순전파·역전파·SGD·held-out 평가·체크포인트·export·재로딩을 구현했다. 수치 미분과 전 층의 가중치 변화 및 연속/재개 학습 동등성을 검사한다.
- 학습과 앱은 동일 전처리/순전파를 사용한다. 별도의 Rust 추론을 중복 구현하지 않았다. 실제 app Worker 코드도 별도 Node thread의 Web Worker transport shim으로 검사한다. 이와 별도로 실제 Chromium Worker/Node 출력 일치 및 warm 오프라인 동작도 GitHub에서 통과했다. Android 검증은 별개다.
- 기존 작업 직렬화/도메인 자원 회수·사용자 ID·수동 연결을 재사용한다. 새로운 신원 관리/영구 큐를 중복하지 않았다. 미학습 실패는 저장 호출 전에 발생한다.
- 모델/가중치 SHA/전처리별 특징 공간을 격리하고 현재 원본 지문으로만 조회한다. 새 모델을 legacy 128/512/1024와 혼합하지 않는다. 후면 identity 비교와 모든 자동 연결을 막는다.
- 합성 모델과 실제 모델의 task·저장·출시 경계를 나눴다. 512 은닉층을 실제 인물 임베딩처럼 제시하지 않는다.

## 발견 및 수정 사항

| ID | 심각도 | 발견 문제 | 처리 및 근거 |
| --- | --- | --- | --- |
| PM-01 | Critical | 기본 빌드가 제3자 모델을 준비하고 상업 검사 플래그 누락 | native를 기본값으로 하고 legacy opt-in만 모델 준비. AAB/패키징·프런트 commercial·Rust release에 차단 연결. 현재 게이트 실제 exit 1 확인. |
| PM-02 | Critical | 미학습 모델을 빈 감지 결과로 처리하면 재분석 시 기존 연결을 지울 위험 | 두 client 입구에서 명시적 미학습 오류. 모델/사진 fetch 전에 차단. 새 데이터만 별도 테이블에 저장. |
| PM-03 | High | checkpoint 해시만 맞아도 학습 코드/전처리가 바뀐 재개가 가능 | 학습 소스별 해시와 합성/manifest 해시·optimizer 검사 추가. 변조 거절 및 재개 동등성 테스트. |
| PM-04 | High | 같은 모델을 매 사진 로드하면 파싱/메모리 낭비 | Worker 단일 session·SHA별 dedupe 및 클라이언트 모델 fetch 재사용. 8건 queue·작은 probe 입력 제한·30초 idle terminate. |
| PM-05 | High | 모델 로드 실패 시 이전 모델이 남아 호출자가 다른 모델로 오인할 수 있음 | 로드 오류 시 session의 가중치 0 채움/참조 해제; Worker 오류 및 client 오류에도 dispose. 재실행 테스트. |
| PM-06 | High | 동일 버전 문자열에 다른 가중치를 넣으면 특징 혼합 가능 | 불변 model_key·가중치 SHA·전처리 계약 및 복합 FK. 직접 벡터 비교도 SHA/모델/task/kind/차원 검사. |
| PM-07 | Medium | 학습용·테스트용 TS 로더 중복 위험 | 기존 model-loader를 공용 개발 스크립트로 이동하여 테스트에서 재export. 앱은 Vite 사용. |
| PM-09 | High | UI가 미학습 client에 도달하기 전에 영구 분석 큐/재시도 cache를 변경할 수 있음 | 사람 시작/재학습, 반려동물 시작/재학습/재개에 capability guard 추가. 미학습 안내 전에 분석 큐를 생성·재개하지 않는다. |
| PM-12 | High | npm audit에서 기존 source-map-js 1.2.1의 DoS 취약점 확인 | 호환 patch 1.2.2로 해당 transitive lock만 변경. High 1→0, 기존 TensorFlow 비교 경로 Moderate 3건은 격리·후속 제거 대상으로 기록. |
| PM-13 | Medium | 병렬 Playwright worker가 동일 합성 모델 임시 파일을 쓰면 충돌 가능 | 프로젝트/worker별 학습 출력 경로를 분리. |
| PM-11 | High | Vite가 실행 불가 분기의 Worker URL도 먼저 변환하여 외부 추론 라이브러리 orphan asset 약 4.6MB를 생성 | native 모드에서 legacy client를 해석 단계의 미학습 경계로 연결하고 build 후 legacy Worker 파일 존재 시 실패. 실행 경로 차단만으로 번들 제거를 가정하지 않음. |
| PM-10 | Low | 자산 검사에서 모델 이름이 포함된 고지 파일도 가중치로 오인 | notices 폴더의 라이선스 증빙은 검사 대상 가중치와 분리. |
| PM-08 | Low | SQLite 테스트 INSERT 값 개수 오류 | 실제 실행 중 발견해 수정. 전체 Python 저장소 테스트 재통과. |

## 미해결 사항과 해소 조건

| ID | 심각도 | 상태 및 출시 영향 | 해결 조건 |
| --- | --- | --- | --- |
| OPEN-01 | Critical | 실제 사람·반려동물 탐지/랜드마크/자세/식별 모델 미학습. 기본 모드에서는 실제 분석 불가. 출시 차단. | 권리 확인 자료·정확한 라벨, task별 독립 아키텍처/학습, 세션 분리 정확도/미등록/좌우/후면 평가. |
| OPEN-02 | Critical | 실제 데이터 권리·개인정보 및 최종 APK/AAB 자산/전체 고지 검토 없음. 출시 게이트 닫힘. | 모델·가중치·데이터·라이브러리별 증빙과 최종 binary 감사. 그때 gate를 실물 allowlist 검사로 확장. |
| OPEN-03 | High | Rust 저장소/기존 전체 migration 116개는 GitHub에서 통과. Android SDK/실기기가 없어 단말 추론은 미실행. | Android ARM64 debug 실기기 오프라인·중단·재개·백그라운드·장시간 메모리/발열 측정. |
| OPEN-04 | Medium | 로컬 Chromium 설치는 실패했으나 GitHub에서 browser Worker 및 가져오기 경로 통과. 수동 등록/선택/저장 실패 보존을 포함한 선택 UI 47개가 통과했으며, 전체 E2E와 legacy 실제 모델 비교는 미실행. | 최종 CI 결과 확인 및 실제 모델 도입 때 전체 관련 UI/호환성·legacy 격리 테스트. |
| OPEN-05 | Medium | 순수 JS 스칼라 MLP/JSON 가중치는 대규모 CV 학습·모바일 모델에 비효율적. WASM 가속 없음. | 실제 모델 크기와 연산 요구 확정 후 학습 framework·ONNX/Rust/WASM/양자화 선정 및 parity·단말 benchmark. |
| OPEN-07 | Medium | npm audit의 TensorFlow/sprintf-js/argparse 계열 Moderate 3건이 기존 개발 의존성에 남음. native bundle에는 해당 Worker가 없고 출시도 차단 중. | legacy 비교 의존성 제거 또는 호환 가능한 보안 수정 후 재감사. 강제 major downgrade로 기존 비교 경로를 훼손하지 않는다. |
| OPEN-06 | Medium | DB secure_delete는 암호화/백업·동의 철회를 보장하지 않음. | 개인정보 보존/삭제·보안 설계 별도 검토. 기존 사진을 자동 백업/업로드하지 않는다. |

수정할 수 없는 Critical/High 항목은 외부 학습 데이터·권리 증빙·실기기·도구가 필요하다. 이를 인터페이스나 합성 정확도로 대체하여 승인하지 않는다. 현재 실제 모델 등록 도구와 자동 matching 연결 UI는 의도적으로 만들지 않았다.

## 개발 관점과 제품 관점의 차이

개발 관점에서는 512 은닉층 학습과 일반화된 stage 계약이 다음 모델 개발을 위한 최소 근거다. 제품 관점에서는 이 층이 아직 사람을 구분하지 못하고 기존 사용자에게 보일 새 분석 결과도 없다. 따라서 개발용 probe는 고급 설정·개발 빌드에만 둔다. 사용자에게 실제 인식이 개선됐다고 안내하지 않고, 안정 브랜치의 대체 APK로 출시하지 않는다.

새 전역 큐, 자동 사진 전수 분석, 클라우드 학습, 대형 프레임워크, 자동 신원 연결, 학습 데이터 크롤링은 지금 추가하지 않는 것이 합리적이다. 앱에서 사진 등록은 학습 동의로 간주하지 않는다.

## 최종 판정

| 평가 항목 | 판정 | 판단 근거/한계 |
| --- | --- | --- |
| 독립 아키텍처 완성도 | CONDITIONAL PASS | Core·학습·runtime·저장·미학습 경계 구현. 실제 task 모델은 없음. |
| 자체 학습 시스템 | PASS | 직접 초기화/역전파/SGD/checkpoint/export를 합성 자료로 실행. 대규모 CV 학습 적합성 미확인. |
| 실제 추론 시스템 | CONDITIONAL PASS | Node와 실제 Worker 코드 thread 실행 확인. browser/Android는 미검증. |
| 기존 데이터 호환성 | CONDITIONAL PASS | SQL idempotence·기존 ID/수동확인 보존·모델/원본 분리 통과. Rust 전체 migration 통과. 일부 UI/실기기 장기 검증은 별도. |
| Android 적합성 | CONDITIONAL PASS | 기존 Worker/오프라인 구조 활용 가능한 CPU 기반. 실제 Android 동작/성능 통과 판정 아님. |
| 저작권 위험 관리 | CONDITIONAL PASS | 신규 경로에 외부 가중치 없음·로컬 권리 필드·출시 차단. 실제 데이터/최종 산출물 승인 없음. |
| 유지보수성 | CONDITIONAL PASS | 공유 수학/추론·기존 큐 재사용·버전 분리. 대규모 모델 runtime 확장은 다음 검증 필요. |
| 다음 개발 단계 진입 | CONDITIONAL PASS | 아래 우선순위 조건으로 task별 실제 학습 준비 가능. |
| 상업 출시/기존 안정판 대체 | FAIL | OPEN-01~03 해소 및 운영 회귀 검증 전 불가. |

우선순위: (1) 완료된 CI/Rust/선택 브라우저 검증을 유지 → (2) 권리·동의·원본/파생/세션 분리 dataset 증빙 구축 → (3) 자체 얼굴/동물 detector와 landmark/pose task 각각 학습 → (4) 실제 512 metric embedding 학습 및 미등록/좌우 독립 평가 → (5) ARM64 실기기/비파괴 재추출 UX → (6) 모델·APK/AAB 권리·성능 검토. 테스트의 실제 실행 상태와 수치는 `evidence/validation.json`을 기준으로 갱신한다.
