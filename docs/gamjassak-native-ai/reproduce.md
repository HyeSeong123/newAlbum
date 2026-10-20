# 학습과 검증 재현

## 환경 및 명령

Node 24, npm lockfile 기반 설치. 학습 CLI는 기존 TypeScript 패키지를 개발 도구로 사용하며 추가 AI 패키지는 설치하지 않는다.

```bash
npm ci
npm run ai:train:synthetic -- --epochs 12 --seed 73
# 동일 폴더 체크포인트에서 추가 2 epoch
npm run ai:train:synthetic -- --epochs 2 --resume native-ai-output/checkpoint.json
# 개발 앱 실행 점검용 로컬 자산을 명시적으로 복사
npm run ai:train:synthetic -- --epochs 12 --install-probe
npm run dev
```

체크포인트에는 모델·epoch·전체 지표·SGD 설정·데이터 및 학습 소스 해시가 있다. 복원 시 포맷/소스/데이터/모델 해시/optimizer를 검사한다. SGD는 momentum이 없어 별도 optimizer state가 없다. epoch 단위 원자적 rename 저장이며 SIGINT는 현재 epoch 완료 후 종료한다. 앱 분석 취소는 이 CLI 학습 취소와 별개이며 Worker terminate/AbortSignal을 사용한다.

출력: `model.json`, `checkpoint.json`, `provenance.json`, `sha256sums.json`. 가중치는 외부 체크포인트를 받지 않는 seeded Xavier uniform에서 출발한다. 학습 전후 loss/평가, 실제 재로드 출력, 코드별 SHA와 당시 Git commit을 기록한다. 소스 변경 후 기존 checkpoint 복원은 거부한다. 생성물은 기본적으로 Git/배포 자산에서 제외하며, 최종 실행 보고서는 docs evidence에 보관한다.

```bash
npm run test:unit
python3 -m unittest discover -s tests -p 'test_*.py'
npx tsc --noEmit
npm run build
npx playwright install --with-deps chromium
npx playwright test tests/native-ai.spec.ts tests/media-import.spec.ts --workers=2
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm run ai:native:release:check  # 미학습 자체 모델: 현 단계 exit 1이 정상
```

브라우저 테스트는 데스크톱 Chromium 및 Pixel 7 viewport에서 같은 JSON 가중치로 Worker/Node 출력 parity, 로딩 재사용 후 네트워크 차단 상태의 warm 추론과 취소를 검사한다. 일반 앱의 기존 인식 경로는 복구됐다. 모바일 viewport는 Android WebView나 ARM64 실기기 테스트가 아니다. 연구 회귀도 `source-validation.yml`에 통합했고 Android preview는 별도 워크플로로 검사한다.

## 권리 검토된 로컬 데이터 확장

현재 loader의 task는 의도적으로 RGB 분류 증명에 한정된다. 실제 얼굴·동물 학습 task, 라벨·손실, 증빙 검토는 다음 단계에서 추가한다. 이 CLI에 얼굴 사진을 넣어도 사람 식별 모델이 되지 않는다.

`--dataset <manifest.json>`을 지정하면 manifest 폴더 안의 로컬 RGB JSON을 읽는다. 각 이미지 파일은 `{width,height,channels:3,data:[0..255],orientation:1}` 형태다. 경로 이탈 및 symlink 이탈을 거부한다. train/validation은 id, captureGroup, sourceId 및 중복 파일 SHA로 분리한다. 원본/파생 이미지에는 동일 sourceId를 지정해야 하며, 서로 다른 파일이 동일 사진의 변형인지 loader가 의미적으로 판별하지는 못한다.

manifest 형식:

```json
{
  "schemaVersion": 1,
  "task": "synthetic-rgb-classification",
  "records": [
    {
      "id": "sample-01",
      "captureGroup": "session-01",
      "sourceId": "original-01",
      "path": "rgb/sample-01.json",
      "sha256": "실제 파일 SHA-256 64자리",
      "label": 0,
      "split": "train",
      "rights": {
        "commercialTraining": true,
        "consentConfirmed": true,
        "reviewed": true,
        "source": "직접 생성 또는 권리 확보 자료",
        "evidence": "검토된 허가·동의 증빙 위치",
        "reviewer": "검토자",
        "reviewedAt": "검토일"
      }
    }
  ]
}
```

실제 실행에는 train/validation 각각 최소 한 개 이상의 별도 기록과 0~2 라벨이 필요하다. 허가 미확인 사진을 내려받지 않는다. 사진·RGB·임베딩·체크포인트는 민감 자료일 수 있으므로 소스 저장소나 CI 공개 artifact에 실제 사용자 자료를 업로드하지 않는다. CI 업로드는 스크립트가 생성한 합성 모델만 대상으로 한다.
