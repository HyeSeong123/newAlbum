# 개발 결과 및 검증 요약

검증 대상 코드: `2f6cd665e1314ce298ac1e9a024230beb6d2445c` (`feature/gamjassak-native-ai`). 이 보고서가 추가된 뒤에는 별도 문서 커밋이 이어진다. 안정 브랜치 `feature/warm-journal-v2`는 `cd3d1be70331d35d504c7081022b2cead8351498` 그대로다.

## 실제 구현 결과

- 독립 RGB/RGBA 전처리·EXIF 1–8·tensor 계약·벡터 수학 및 모델/가중치/전처리별 비교 규칙.
- Person/Pet 단계별 입출력 타입과 `not-trained` 상태. 아직 실제 검출·랜드마크·방향·개체 임베딩 모델은 없다.
- 자체 MLP 192→24→512→3, 18,971개 파라미터. seed 73 무작위 초기화, tanh/softmax, 교차 엔트로피, 전 층 역전파, SGD, epoch 로그, 해시 검증 checkpoint 재개, JSON export/실제 reload 추론.
- 동일 전처리/순전파를 사용하는 Node CLI와 CPU Worker. 사용자 실행 요청·기존 직렬화·취소·타임아웃·idle 정리·단일 모델 재사용. WASM 가속은 미구현.
- v18 additive SQLite sidecar. 기존 사용자·동물·사진·수동 확인·연결을 재작성하지 않는다. 모델 불변성·원본 지문·벡터 검증·모델별 조회·미검토 모델 저장 차단.
- native 기본 빌드는 사전학습 모델을 준비하지 않으며 Vite 해석 단계에서 legacy Worker를 분리한다. 빌드 후 legacy Worker 유출 검사도 수행한다. 비교용 legacy 코드/개발 의존성은 레포에 남아 상업 게이트에 걸린다.
- PM 검토 후 미학습 분석의 큐 변경, 로드 실패 시 이전 모델 잔존, orphan Worker 산출물, checkpoint 소스 불일치 및 빌드 의존성 High 취약점을 수정했다.

구조·전체 코드 경계는 [architecture.md](architecture.md), 실제 변경 파일 목록은 [evidence/changed-files.txt](evidence/changed-files.txt), 실행 방법은 [reproduce.md](reproduce.md) 참고.

## 합성 학습 결과

학습 72개 / 검증 18개, 생성 seed 501. 실제 사진·사전학습 가중치·teacher 출력·원격 API 사용 없음.

| 지표 | 학습 전 | 12 epoch 후 |
| --- | --- | --- |
| 합성 검증 cross-entropy | 1.0468635701970688 | 0.0010157662605436372 |
| 합성 색상 3종 분류 정답률 | 8/18 (44.44%) | 18/18 (100%) |
| SGD step | 0 | 864 |

내보낸 모델은 394,126 bytes이며 SHA-256은 `4864e9ffb594f3d47beec12409bf6fa929f5c746fe3bc8c106412fb0f6c0bac8`이다. 실제 재현의 코드/데이터/초기화/모델/체크포인트 해시는 [synthetic-training.json](evidence/synthetic-training.json), [synthetic-sha256sums.json](evidence/synthetic-sha256sums.json)에 기록했다. 모델 파일과 checkpoint는 `npm run ai:train:synthetic -- --epochs 12`로 재현한다. CI의 별도 6 epoch probe도 내보낸 자기 가중치를 Worker에 로드해 Node 출력과 비교한다.

**위 수치는 장난감 색상 분류 실험이다. 인물·강아지·고양이 식별률, 측면 60% 목표 달성, 실제 데이터 일반화의 근거가 아니다. 512 은닉층도 인물 식별 임베딩으로 제공하지 않는다.**

## 테스트 상태

최종 명령·개수·플랫폼과 CI 링크는 [validation.json](evidence/validation.json)에 기록한다. Node 전체 140개, Python 전체 22개, Linux Rust 전체 116개와 브라우저 47개가 통과했다 (화면 조건에 따른 1개 건너뜀). 브라우저는 데스크톱 Chromium 및 Pixel 7 viewport로 자체 Worker·가져오기·사람/동물 관리·다중선택·100장 가져오기 무분석·수동 등록 경로를 선택 검증한다. 전체 E2E나 Android 실기기 검증을 모두 수행했다는 뜻은 아니다.

로컬 Chromium 설치는 다운로드 ZIP 오류로 막혔으나, GitHub에서 실제 브라우저를 설치하여 검증했다. Rust도 로컬에는 없어 GitHub Linux에서 컴파일·테스트했다. 실제 사용자 DB 대신 migration/기존 연결 fixture를 검증했으며 해당 범위에서 데이터 손실은 발견되지 않았다.

미실행: 실제 얼굴·반려동물 모델 학습/독립 식별 평가, Android APK/AAB·ARM64 실기기·cold offline/장시간 메모리/발열/배터리, 전체 E2E 및 legacy 실제 모델 비교. 일부 legacy 분석 성공 테스트는 native 모드에서 의도적으로 미학습이므로 제외하고 신규 미학습 차단 테스트로 검증했다.

## PM 최종 결론

**다음 개발 단계 CONDITIONAL PASS / 상업 출시 및 안정판 대체 FAIL.** 세부 8개 판정과 Critical/High/Medium/Low 조치·미해결 조건은 [pm-review.md](pm-review.md)에 있다.

다음 단계는 권리·동의·세션 분리가 검토된 자료로 각 탐지/랜드마크/자세 모델과 실제 metric embedding을 학습하는 것이다. 실물 APK/AAB·라이브러리 고지·데이터/가중치 권리·개인정보 및 Android 성능 검토 전에는 출시 게이트를 열지 않는다. `npm run ai:release:check`의 현재 exit 1은 기대한 보호 동작이다. High 의존성 취약점은 패치했으며, legacy TensorFlow 계열 Moderate 3건은 남아 있다.
