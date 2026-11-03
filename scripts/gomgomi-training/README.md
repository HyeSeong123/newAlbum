# 곰고미 학습 프로젝트

기존 newAlbum 안에서 시작하는 PC 학습 도구의 **1단계**입니다. 새 GitHub 저장소는 필요하지 않습니다. 완성된 학습 스튜디오나 새 모델이 아니라, 캐릭터 현황과 학습 자료를 준비하는 도구입니다.

## 실행

Node.js 24가 설치된 PC에서 저장소 루트로 이동합니다. 추가 npm 패키지, Python, GPU는 이번 명령에 필요하지 않습니다.

```powershell
cd D:\project\newAlbum
node scripts/gomgomi-training/cli.mjs status
node scripts/gomgomi-training/cli.mjs check
node scripts/gomgomi-training/cli.mjs export --out gomgomi-training-output/first-import

```

| 명령 | 결과 |
| --- | --- |
| status | 실제 캐릭터 목록과 목표 수의 차이, 기존 고미 자료 수 |
| check | 자료 해시·행 수·출처·캐릭터 ID·필수 값·분할 간 중복 검사 |
| export | 새 폴더에 train/validation, 캐릭터 목록, 완료 manifest 생성 |

실제 앱 정의는 **17종**, 목표는 **18종**이므로 나머지 1종은 미정으로 표시합니다. 캐릭터와 대사를 임의 생성하지 않습니다. 표시하는 이름·성격은 기존 앱 메타데이터입니다. 특히 고미의 최신 성격 기준과 차이가 있어 검토 없이 새 학습의 정답으로 사용하면 안 됩니다.

자료는 고미 v4의 **학습 465개·검증 64개**입니다. 검증 자료는 알려진 성격 주제의 별도 문답이며 독립 사용자 품질 평가가 아닙니다. 같은 캐릭터의 group/prompt/reply가 양쪽 분할에 나타나면 실패합니다. NFKC·공백·대소문자 차이도 정규화하지만 의미 전체의 유사성을 판별하지는 않습니다.

## 보존과 오류 복구

- 기존 scripts/gomi-training, models/gomi-lora-v4는 읽기만 합니다. 원문·출처·프롬프트·분할을 보존합니다.
- 내보낸 행에는 characterId를 추가합니다. 출력 파일의 바이트는 재직렬화 때문에 달라지지만 기존 필드 값은 유지합니다.
- 기존 출력 폴더는 거부합니다. 다시 실행할 때 새 이름을 지정하세요. 기본값은 gomgomi-training-output/first-import입니다.
- 저장소 안에서는 Git에서 제외한 gomgomi-training-output의 새 하위 폴더만 사용합니다. 저장소 밖의 새 폴더도 지정할 수 있습니다.
- 모든 파일 저장 후 manifest.json을 마지막에 씁니다. 오류로 남은 부분 폴더는 완료본이 아니며 자동 삭제/덮어쓰기하지 않습니다.
- 사진·일기·앨범·GPS·앱 DB를 읽지 않고 외부로 자료를 전송하지 않습니다.
- 새 가중치·체크포인트·캐시는 Git 밖에 둡니다. 기존 v4 보관 파일은 삭제·이동하지 않습니다.

## 실제 학습과의 차이

검사·내보내기 성공은 학습 실행, 말투 품질, 휴대폰 1초 응답의 검증이 아닙니다. 출력의 qualityApproved/trainingExecuted/deployedToApp는 모두 false입니다.

현재 프롬프트는 Qwen3-4B-Instruct-2507용 ChatML입니다. 새 모델 선정 후 해당 모델의 토크나이저·채팅 템플릿으로 다시 구성하고 길이와 런타임 일치를 검증해야 합니다. 기존 4B LoRA를 다른 크기/계열 모델에 바로 적용하지 않습니다.

기존 실험 재현은 [고미 4B 학습 도구](../gomi-training/README.md)를 참고하세요. 이번 도구는 앱 모델 다운로드, DB, 서명을 변경하지 않습니다.

## 다음 단계

1. 18번째 캐릭터와 기존 캐릭터의 이름·성격 확인.
2. 승인 대사와 학습에서 제외할 평가 상황 정리.
3. 공유 소형 모델 후보의 이용 조건·학습 도구·Android 엔진 호환성 확인.
4. RTX 5070 12GB / RAM 32GB 환경 점검 후 실제 추가 학습.
5. 양자화 후보의 휴대폰 첫 토큰/완성 응답, 모델 로딩 포함/제외, 메모리, 반복·성격 혼동 비교.
6. 성격 편집·학습 실행·평가·모바일용 내보내기를 묶는 PC 화면 구성.

완성 응답 1초와 작은 용량은 목표입니다. PC 학습 성능만으로 휴대폰 응답 속도를 보장하지 않습니다.

## 검증

```powershell
node --test tests/gomgomi-training-core.test.mjs tests/gomgomi-training-io.test.mjs

```

캐릭터 수·중복 ID·분할 누출·필수 값, 파일 해시·원문 보존·기존 폴더 거부·출력 경로·CLI 종료 코드를 검사합니다. Gomgomi training validation CI는 이 테스트와 실제 저장소 자료의 status/check만 실행합니다.

앱 UI 변경이 없어 모바일 전후 화면·버튼 검사는 해당 없음입니다. GPU 학습, Android 설치·추론·속도와 전체 앱 회귀는 이번 검증 범위가 아닙니다.
