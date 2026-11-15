# 감자·고구마 새 원화와 모션 · 0.9.55

사용자가 선택한 기본 디자인 재설계 방향과 형제 콤비 설명을 반영했다. 내장 `imagegen`으로 고미의 실제 원화를 참조해 제작했으며 CLI/API 별도 이미지 생성이나 외부 캐릭터 복제는 사용하지 않았다. 새 이미지는 별도 경로에 추가했고 기존 원화·여섯 단계 성장 PNG·고미의 그림은 보존했다.

## 두 형제의 차이

| | 감자 | 고구마 |
| --- | --- | --- |
| 외형 | 낮고 둥근 연노랑 몸, 두 잎 | 길쭉하고 묵직한 보라색 몸, 작은 하트 잎 |
| 성격 | 먼저 제안하고 움직이는 장난꾸러기 동생 | 현실적인 태클을 걸면서 결국 같이하는 덤덤한 형 |
| 표정 | 신남·당황·억울함이 크게 드러남 | 곁눈질·눈썹·머쓱한 미소의 작은 변화 |
| 동작 | 큰 들썩임과 빠른 반응 | 작은 회전과 절제된 반응 |

캐릭터 소개, 상황·단계별 대사 자료, 함께하기의 기존 대사 자료와 `personality.behaviorRules`를 갱신했다. `personality.helpVoices`에는 호감도 다섯 구간별 안내 대사를 모아 실제 `?` 도움말에서도 새 성격을 사용한다. 이 자료는 사용자 설명에서 파생한 AI 작성 초안이며 사용자 원문 대사나 실존 인물에 대한 검증 사실로 표시하지 않는다.

현재 홈의 실제 AI 대사는 `ownAi/model.json`의 별도 학습 모델에서 생성된다. 이번 작업은 그 가중치·학습 원본·AI 런타임을 바꾸지 않는다. **설정 자료를 수정한 것과 실제 학습 모델의 말투 변경을 혼동하지 않는다.** 새 성격에 맞춘 모델 재학습은 후속 범위다.

## 자산과 프레임

- `public/characters/brothers-v2/potato-atlas.png`
- `public/characters/brothers-v2/sweet-potato-atlas.png`
- 두 파일 모두 1448 × 1086 RGBA PNG, 4열 × 3행, 셀당 362 × 362.
- 원본 PNG 픽셀을 그대로 보존하며 `brothersArt.ts`의 좌표와 SVG `viewBox`로 필요한 셀을 표시한다.
- 프레임: 기본 / 눈 감기 / 미소 / 환호 / 속상함 / 당황 / 억울함·곁눈질 / 머쓱함 / 낮은 손 인사 / 높은 손 인사 / 깨어 쉬기 / 수면.
- 기존 홈 자세와 터치 네 가지, 함께하기 다섯 가지에 연결했다. 손 인사는 두 그림을 번갈아 보여 준다. 놀이에서는 감자의 신남→당황→억울함과 고구마의 곁눈질→웃음을 다르게 사용한다.
- 움직임 줄이기와 백그라운드에서는 프레임 반복을 멈춘다. 이미지 디코딩 전 또는 실패 시 보존된 기존 원화를 보여 준다.
- 기존 ID, 사용자 이름, 대표 선택, 호감도 저장과 성장 조건·기록의 소유권은 기존 코드에 그대로 둔다. 그림과 미리보기는 저장 호출을 추가하지 않는다.

## 제작 프롬프트

스타일 참조는 `public/characters/gomi/idle.png`다. 고구마 제작에는 새 감자 시트를 형제 그림체 참조로 추가했다. 아래는 제작에 사용한 공통 제약과 캐릭터별 지시다.

```text
Use case: style-transfer. Asset type: production-ready transparent PNG game sprite atlas,
12 cells in an EXACT 4-column x 3-row regular grid, landscape 4:3 canvas.
Gomi, the apricot poodle, is a STYLE/MEDIUM REFERENCE ONLY.
Match warm rough colored-pencil and crayon grain, soft irregular gray-brown pencil
contours, pale warm low-saturation colors, small dark brown pencil eyes and simple
childlike anatomy. Same character identity, proportions, palette and scale in every cell.
Generous transparent padding, centered in each cell, consistent baseline, no crossing
cell boundaries. No grid lines, labels, text, scenery, clothing, gloss, 3D or thick black
sticker outlines. True alpha transparency outside the actual drawings.
```

```text
Potato younger brother: squat, softly irregular round pale buttery-yellow potato,
tiny two-leaf sage sprout, short rounded arms and feet, subtly rosy cheeks.
Energetic, curious and mischievous. Expressive face, confident enthusiasm, comic
surprise and pout rather than timid sweetness. Do not copy dog anatomy.
Row 1: neutral curious / same pose blinking / cheerful hands near cheeks / arms-up cheer.
Row 2: sad / wide-eyed surprise / feeling-wronged puffed-cheek pout / sheepish grin.
Row 3: low-arm greeting / same body with high-arm greeting / awake seated rest / asleep sideways.
```

```text
Sweet-potato older brother: long softly asymmetrical oval, muted dusty mauve/lavender,
a few soft pencil patches, tiny sage heart leaf on a curling sprout, short rounded limbs.
Visibly taller and more solid than the round potato. Half-lidded brown eyes and dry humor.
Watches the younger brother, raises an eyebrow and quietly helps. Not constantly smiling,
not a timid baby or mean villain. No bite/cut surfaces, hats, glasses or clothing.
Row 1: deadpan / same pose blinking / small warm smile / restrained dry chuckle.
Row 2: quiet concern / one-brow surprise / skeptical sideways glance / caught-being-kind blush.
Row 3: low-arm greeting / same body with high-arm greeting / awake resting / asleep sideways.
```

각 생성 결과에는 내장 도구로 다음 배경 추출 편집을 적용했다. PNG를 코드나 Python으로 재채색하거나 배경 제거하지 않았다.

```text
Use case: background-extraction. EDIT THIS EXACT 4 by 3 sprite atlas.
Preserve all twelve drawings, their expressions, palette, outlines, pencil grain,
placement, scale, canvas dimensions and cell arrangement. Change ONLY empty background
to absolutely transparent alpha 0. Remove all paper haze, cloudy stripes, noisy matte
and cast shadow outside the real silhouettes. Keep character bodies readable on any
colored surface with natural pencil-edge antialiasing. Do not redraw, shift, crop,
redesign or rearrange any pose. No new text or grid. Transparent empty gutters.
```

## 미리보기 재생

```text
npm run preview:brothers
```

`preview-results/brothers-v2.html`을 만든다. 저장 경로는 `node scripts/preview-brothers.mjs <경로>`로 지정할 수 있다. 실제 앱의 `CharacterVisual`과 모션 코드를 묶고 그림을 포함한 단일 HTML이므로 인터넷 없이 열 수 있다. 9개 동작 선택, 자동 보기, 일시정지를 제공한다. 앱 메뉴나 사용자 저장소에 미리보기 기능을 추가하지 않는다.

## 검증 기록

- 변경 전 관련 단위 45개와 기존 모바일 홈 동작 검사 1개 통과.
- 새 프레임 선택 검사와 형의 작은 회전 검사가 구현 전 실패하는 것을 확인한 뒤 구현했다.
- 변경 후 도움말을 포함한 관련 단위 67개 통과.
- 모바일 `tests/characters.spec.ts` 37개 통과. 그림 변경, 홈/도감/현재 성장 단계, 원화 로드 실패, 저장 횟수, 배경 정지·복귀, 실행 중 움직임 줄이기 전환을 확인했다.
- 기존 고미 관계 검사 4개는 폐기된 네이티브 채팅 명령을 가정했다. 원래 final에서도 실패를 재현하고 현재 own-AI Worker 요청 경계로 테스트만 갱신했다. 나머지 시각·저장 테스트의 AI 비가용 조건도 명시해 모델 준비 여부에 따라 결과가 달라지지 않게 했다. 고미 앱 코드와 모델은 수정하지 않았다.
- 독립 HTML: 2캐릭터 × 9동작, 페이지 오류 0, 정지된 프레임 유지, 393px 모바일 가로 넘침 없음.
- TypeScript, Vite 프로덕션 빌드, 기존 오프라인 모델·고지 패키지 검사, 버전 0.9.55 일치 검사 통과.
- 전체 Node 단위 명령은 285개 중 278 통과, 4 실패, 3 기존 생략. 실패는 로컬에 Java/Javac가 없는 세 검사(`companion-models` 2개, `gomi-action-model` 1개)와 Windows 파일 심볼릭 링크 권한이 없는 `native-ai` 데이터셋 경계 검사다. 해당 검사를 통과했다고 표시하거나 검사를 삭제하지 않았다.
- Android APK 빌드·설치·실기기 검증과 전체 제품 회귀 검사는 수행하지 않았다. SQLite·사진·일기·앨범·서명 설정과 AI 학습 원본은 수정하지 않았다.

## 최종 코드 검토

독립 검토에서 도움말의 옛 형제 말투가 새 성격보다 우선하는 P2 문제를 발견했다. 설정 자료를 실제 도움말에 전달하는 회귀 검사의 실패를 확인한 뒤 `helpVoices`로 단일화했고 67개 관련 검사와 모바일 도움말 흐름을 다시 확인했다. 그 밖의 차단 문제는 발견되지 않았다. 검토자가 별도로 실행한 형제·동작·함께하기 단위 24개도 통과했다.

검토 판단: own-AI 재학습은 이번 범위에서 제외했다. 따라서 실제 AI 발화가 새 성격과 완전히 일치한다고 주장하지 않으며 후속 재학습이 필요하다. 그림에 대한 최종 취향 판단은 코드 결함 판정과 별도로 사용자가 미리보기에서 확인할 수 있게 했다. 다음 수정에서 외형 선호를 더 조정할 가능성은 남아 있다.
