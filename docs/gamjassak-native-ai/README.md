# GamjaSsak AI Engine — 독립 학습·추론 기반

기준: `feature/gamjassak-native-ai`, 기존 안정 브랜치 수정 없음. 설계 입력은 `docs/gamjassak-ai-analysis/` 전체 6개 문서. REA 및 제3자 가중치/교사 모델/데이터 다운로드는 수행하지 않았다.

**이번 결과는 실제 신경망을 처음부터 학습하고 내보낸 파일을 다시 추론하는 기본 시스템이다. 사람·반려동물 인식 모델 개발/정확도 달성/상업 출시 승인은 아니다.** 탐지·랜드마크·자세·실제 식별은 `not-trained`를 반환하고, 사용자 연결을 변경하지 않는다.

- [아키텍처·데이터·권리 경계](architecture.md)
- [재현·학습·앱 실행 안내](reproduce.md)
- [PM 검토 및 최종 판정](pm-review.md)
- `evidence/`: 실제 실행 결과와 로그. 수치는 합성 RGB 3종 분류에만 적용.

기본 앱은 자체 엔진 모드이다. 외부 모델 준비/다운로드가 실행되지 않는다. 기존 비교 경로는 `VITE_AI_ENGINE=legacy`로 개발자가 명시한 경우에만 허용한다. 새 모델이 없는 동안 사람/동물 분석은 미학습 안내로 중단한다. 사진 가져오기·수동 등록·기존 연결 보존은 기존 업무 경로를 유지한다. 이는 안정 브랜치를 대체할 출시 빌드가 아니다.

```bash
npm ci
npm run ai:train:synthetic -- --epochs 12 --install-probe
npm run test:unit
python3 -m unittest discover -s tests -p 'test_*.py'
npm run build
npm run dev
```

개발 화면: 설정 → 인식 검증 열기 · 고급 → 합성 모델 실행 점검. 버튼을 누를 때만 Worker를 시작한다. 이 진단 버튼은 Vite 개발 빌드에서만 표시된다.

`npm run ai:release:check`는 현재 **실패해야 정상**이다. 미학습·미평가 모델, 외부 모델 의존성 및 최종 APK/AAB 권리·내용 검토가 남았다. 이 게이트는 임시 승인 플래그만으로 우회하지 못하도록 출시를 닫아 두었다. 개발용 debug APK 경로는 유지한다.
