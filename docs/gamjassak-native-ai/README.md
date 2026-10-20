# GamjaSsak AI Engine — 독립 학습·추론 기반

기준: `feature/gamjassak-native-ai`, 기존 안정 브랜치 수정 없음. 설계 입력은 `docs/gamjassak-ai-analysis/` 전체 6개 문서. REA 및 제3자 가중치/교사 모델/데이터 다운로드는 수행하지 않았다.

**이번 결과는 실제 신경망을 처음부터 학습하고 내보낸 파일을 다시 추론하는 기본 시스템이다. 사람·반려동물 인식 모델 개발/정확도 달성/상업 출시 승인은 아니다.** 탐지·랜드마크·자세·실제 식별은 `not-trained`를 반환하고, 사용자 연결을 변경하지 않는다.

- [개발 결과·검증 요약](results.md)
- [아키텍처·데이터·권리 경계](architecture.md)
- [재현·학습·앱 실행 안내](reproduce.md)
- [PM 검토 및 최종 판정](pm-review.md)
- `evidence/`: 실제 실행 결과와 로그. 수치는 합성 RGB 3종 분류에만 적용.

2026-10-20 변경: 이 디렉터리의 자체 AI는 연구용으로 보관한다. 기본 앱은 기존 얼굴·반려동물 엔진으로 복구했고 `VITE_AI_ENGINE` 전환·합성 모델 점검 화면은 제거했다. 연구 Worker는 테스트에서만 직접 호출하며 제품 번들에 포함하지 않는다. [복구 보고서](../recognition-restoration-2026-10-20.md)를 참조한다.

```bash
npm ci
npm run ai:train:synthetic -- --epochs 12 --install-probe
npm run test:unit
python3 -m unittest discover -s tests -p 'test_*.py'
npm run build
npm run dev
```

개발 화면: 설정 → 인식 검증 열기 · 고급 → 합성 모델 실행 점검. 버튼을 누를 때만 Worker를 시작한다. 이 진단 버튼은 Vite 개발 빌드에서만 표시된다.

`npm run ai:native:release:check`는 현재 **실패해야 정상**이다. 미학습 자체 모델을 출시하지 못하게 하는 연구용 검사다. 일반 앱의 `npm run ai:release:check`는 별도로 기록된 기존 모델의 해시·고지·출시 결정을 검사한다. 이 분리는 외부 가중치를 자체 모델로 바꾸거나 미확인 권리를 승인 완료로 표시하지 않는다.
