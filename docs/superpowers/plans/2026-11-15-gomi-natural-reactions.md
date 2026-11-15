# 고미 자연스러운 반응 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. 사용자 요청으로 중간 테스트 반복은 생략하고 마지막에 묶어 실행한다.

**Goal:** PC에서 고미의 행동·피로·친밀도에 맞는 짧은 반응을 재학습해 앱에 적용한다.

**Architecture:** 자체 다음 단어 신경망의 문맥을 유지하고 상황·의도별 학습 단어 연결로 생성 범위를 한정한다. 피로0과1을 구분하고 간식 이전 상태를 홈에서 전달한다. 외부 가중치·모델 API는 추가하지 않는다.

**Tech Stack:** 기존 Python/NumPy 수학 계산, 자체 역전파, TypeScript Worker, React/Tauri.

**Spec:** docs/superpowers/specs/2026-11-15-gomi-natural-reactions-design.md

## Global Constraints

- 기존 final checkout 재사용, final/master 이외 브랜치 생성 금지. 기존 데이터·서명키 보존.
- 최대 두 문장·50자, 모델/학습 제약 합계2MB 이하, 생성 제한700ms와 요청 제한900ms 유지.
- 초안 저자 표시, 원문 보존, 새 데이터/학습 코드/모델 해시 기록.
- 기존 구축 위임·커밋/APK/완료 메일 권한을 유지한다. 휴대폰 실측과 전체 상업 권리 승인을 주장하지 않는다.

## Review Focus

- 졸림1과 극심한 피로0에서 간식/밥 반응이 다를 것: tests/own-character-ai.test.mjs.
- 앱에서 먹기 전 활력이 올라가거나 친밀도가 감소하지 않을 것: tests/companion-activities.test.mjs, tests/gomi-behavior.test.mjs.
- 다른 행동의 후반부가 문장에 섞이지 않을 것: 상황별 학습 연결 검증과 scripts/evaluate-own-character-ai.mjs.
- 친밀도19/20/29/30/59/60/89/90 경계의 성격을 유지할 것: own neural tests.
- 새 행동/새 사용자 자료에 문법 지원이 없으면 명시적으로 실패할 것: Python corpus/TypeScript scene tests.

### Task 1: 데이터와 자체 학습 계약

Files: local-ai/own/gomi-natural-drafts.json, train.py, tests/test_own_character_learning.py.

- [ ] 피로0/1 및 전체 문장 이력에 대한 실제 학습 예시 검사 작성.
- [ ] 고미 원문 보존·구판 초안 제외 사유 기록과 새 완성 발화/의도 자료 작성.
- [ ] v3 학습 계약: scenario feature, energy3단계, gomi tier5단계, full-history examples, scene/meaning grammar export.

### Task 2: 실제 단어 생성과 홈 상태

Files: src/features/characters/ownAi/engine.ts, companionActivities.ts, gomiBehavior.ts, useGomiBehavior.ts, features/home/HomeView.tsx, tests/own-character-ai.test.mjs.

- [ ] 보고된 잘못된 문장과 간식/밥 피로 차이·거절/수용 연속성을 검사하는 테스트 작성.
- [ ] v3 로딩·상황별 의도 연결·문맥 유지 생성. 신경망으로 다음 단어를 생성하고 최근12개 완성 대사는 반복하지 않음.
- [ ] 먹기 전 피로 전달, 졸림 때 peek 후 깨어남, 극심한 피로 때 계속 수면. 관계 변화에 불필요한 sleep penalty 제거.

### Task 3: PC 재학습과 배포

Files: local-ai/run.ps1, scripts/own-character-ai.mjs, prepare-own-character-ai.mjs, evaluate-own-character-ai.mjs, own/README.md, version files.

- [ ] 한국어 시험 명령·피로 선택·추가 JSONL 학습 지원. 학습 환경 확인 후 실제 학습 실행.
- [ ] 마지막에 수학/학습 데이터·실제 생성·영향 모듈 검사, 타입/빌드(중복은 CI에 맡김), 표본 대사 검토.
- [ ] 새 모델이 포함된 버전을 커밋/푸시하고 기존 서명 APK 생성. 설치 앱의 학습 모델 해시·오프라인 전체 반응 시간을 검사한다.
- [ ] PC 실행 안내·실제 학습/검증 보고서·완료 메일. 실기기/품질/상업 권리의 미검증 사항 기록.

## Rulings / 진행

- baseline HEAD acf1c1872e21de8f72270f72c993ec144919055c. clean final. PC Python3.12.16/NumPy2.4.2 확인.
- Ruling: 기존 사용자 위임과 계속 진행·검증 최소화 요청에 따라 설계 승인 질문, 새 worktree, 작업별 중간 테스트/리뷰를 생략하고 최종 검증과 한 번의 리뷰로 묶는다.
- Task1: 실제 PC에서180epoch·343.3초 학습 완료. 모델436,521바이트·181,318parameter. 기존16926개 학습 행은 상태별 반복을 포함하며16926개의 서로 다른 사람이 쓴 문장이라고 표시하지 않는다.
- Ruling: 표현이9개뿐인 기존 다른 캐릭터의 좁은 상황에서 최근12개를 모두 피하면 답을 만들 수 없었다. 우선12개를 피하고 소진 시 최근3개는 유지하며 같은 상황에서 다시 신경망 생성한다. 두 탐색 합계512회·700ms 제한이며 고정 대사/다른 상황으로 대체하지 않는다. 오래된 표현이 다시 나올 수 있는 비용을 자연스러움과 연속 사용 가능성을 위해 수용한다.
- Ruling: '천천히 해', '아직 못 일어나', '깬 다음에 먹을게', '밥은 옆에 놔둬'는 문맥상 유효한 한국어 생략 표현이다. 동작 이름을 반드시 반복하게 하는 검사 대신 실제 행동 충돌·즉시 식사/계속 수면 모순을 검사한다. 자동 검사를 자연스러움의 완전한 판정으로 부르지 않는다.
- 설치 시험:8회 수면 터치가 통과했으나 간식 버튼 클릭 후 생성된 말풍선이 sticky navigation 뒤에 가려져 실제 보임 검사에서 실패했다. 실제 대사는 올바르게 생성됐다. 홈에서 가려진 반응을 화면 중앙으로 이동하고, 화면 이동이 끝나 실제 전체 문장이 보이는 시점까지 측정한다. 생성 성공만으로1초 표시를 통과시키지 않는다.
- 위치 수정 APK에서8회 수면 터치와 졸린 간식의 전체 문장 표시가1초 미만으로 통과했다. 스크린샷 저장 후1초짜리 rest-front를 기다리는 QA 순서가 이미 끝난 동작을 놓쳤다. 실제 캡처는 이미 깨어난 상태였으므로 클릭 전부터 data-motion 변화를 연속 기록해 순서를 검증하도록 QA만 보완한다. 제품 모델/앱 코드는 유지한다.
