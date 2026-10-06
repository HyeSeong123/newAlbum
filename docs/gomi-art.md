# 고미 손그림과 모션 제작 기록

2026-10-06 사용자가 승인한 고미 초안을 기준으로 이미지 생성 스킬의 내장 도구로 제작했습니다. 참고 그림의 거친 색연필 선, 밝은 살구색 머리, 갈색 몸, 위로 살짝 올라간 앞머리를 유지합니다. 생성된 RGBA PNG의 픽셀과 투명 배경을 그대로 사용하며, 포즈 전환·숨쉬기·기지개·두 프레임 교감은 앱에서 재생합니다.

## 입력과 공통 프롬프트

입력: 승인된 색연필 고미 초안. 후속 포즈에는 같은 고미의 배경 제거본을 참조했습니다. 앞발 두 번째 프레임은 첫 번째 프레임을, 최종 말고 자는 자세는 초기 수면 그림을 참조했습니다.

공통 지시: 같은 다 자란 여자 살구색 푸들의 정체성·비율·색·색연필 질감·회갈색 스케치 윤곽을 유지한다. 하나의 전신 캐릭터를 정사각 캔버스에 실제 투명 배경으로 그린다. 흰 사각 배경·문자·사람·옷·장신구·사실적인 털 묘사·3D·광택 눈을 넣지 않는다. 얼굴과 살짝 올라간 곱슬 앞머리의 귀여운 인상을 유지한다.

## 포즈별 프롬프트와 저장 파일

| 파일 | 포즈 지시 |
| --- | --- |
| `public/characters/gomi/idle.png` | 승인된 앉은 모습은 그대로 유지하고 흰 종이 배경과 바닥 낙서만 제거한다. 밝은 털과 부드러운 스케치 가장자리는 보존한다. |
| `public/characters/gomi/happy.png` | 앉은 몸·머리 기울임·귀·앞발·크기·위치를 유지한다. 눈을 행복하게 감은 곡선과 작고 따뜻한 미소로 얼굴만 바꾼다. |
| `public/characters/gomi/sad.png` | 앉은 몸과 위치를 유지한다. 작은 걱정스러운 눈썹 곡선과 조용히 실망한 작은 입으로 얼굴만 바꾼다. |
| `public/characters/gomi/sleep-curled.png` | 몸을 둥글게 말고 눈을 감은 채 자는 자세. 긴 뒷다리 하나가 엉덩이에서 몸의 앞쪽 가장자리를 따라 돌아와, 발끝이 주둥이 앞을 조금 지난다. 나머지 다리는 접고 꼬리는 몸을 감싼다. 다리가 추가되지 않도록 네 다리 구조를 유지한다. |
| `public/characters/gomi/sleep-stretched.png` | 옆으로 완전히 누워 몸과 다리를 가로로 길게 뻗고 잔다. 왼쪽에 옆으로 놓인 머리, 오른쪽으로 이어진 몸과 쉬는 꼬리. 둥글게 말린 자세와 분명히 다른 긴 실루엣. |
| `public/characters/gomi/stretch.png` | 왼쪽을 향한 옆모습. 양 앞발을 바닥 앞으로 길게 뻗고 머리와 가슴을 낮추며, 엉덩이를 높이고 뒷다리 두 개는 세워 딛는다. 고양이 같은 기지개이지만 네 다리의 자연스러운 푸들 체형을 유지한다. |
| `public/characters/gomi/paw-wave-up.png` | 뒷발 두 개로 일어서서 양 앞발을 가슴 앞에 들고 친한 사람에게 관심을 조르는 모습. 앞발은 높게, 왼쪽이 약간 더 높다. 사람 손가락을 만들지 않는다. |
| `public/characters/gomi/paw-wave-down.png` | 첫 앞발 프레임의 머리·몸·뒷발·꼬리·위치·크기를 유지한다. 들린 앞발만 낮추고 앞으로 살짝 뻗어, 두 프레임을 번갈아 재생하면 앞발이 움직이게 한다. |
| `public/characters/gomi/lick.png` | 앉은 몸·머리·귀·앞발·위치를 유지한다. 행복하게 감은 눈과 주둥이 옆으로 조금 올라간 작은 분홍 혀로 얼굴만 바꾼다. 웃는 닫힌 입 그림과 번갈아 재생한다. |

친밀도·타이머 규칙과 재생 시점은 [characters-growth.md](characters-growth.md)에 정리했습니다.


## 0.6.14 계절 수면과 잠 방해 표정

사용 도구: 내장 이미지 생성(image_gen), 실제 투명 배경 RGBA PNG. 기존 그림을 편집 대상으로 사용하고 결과 픽셀을 그대로 복사했습니다.

공통 프롬프트:

```text
Use case: precise-object-edit. Asset type: transparent PNG animation pose for the Korean diary app Gomi. Edit target: the supplied local Gomi drawing. Preserve her identity, pale apricot curly forehead tufts raised slightly upward, brown/apricot poodle ears, soft warm crayon grain, irregular gray-brown pencil outline and tiny dark nose. Keep the simple adorable children's-book look, no realistic fur, no 3D, no glossy eyes, no clothing, no text. ONE isolated character pose on a square genuinely transparent canvas with generous margins. Preserve original canvas and baseline scale.
```

### `public/characters/gomi/sleep-cool.png`

입력: `public/characters/gomi/sleep-curled.png`

```text
Change only the bedding: add a thin pale icy-blue cooling quilt spread UNDER this curled sleeping poodle at the bottom. Quilt forms a low rounded slightly wider pad, soft tiny quilting lines, still simple colored pencil grain. Keep the dog curled and fully visible, sleeping with both eyes closed, her long rear paw passes slightly in front of her muzzle. Preserve dog pose, face position and original scale. Canvas transparent outside dog and quilt.
```

### `public/characters/gomi/sleep-warm.png`

입력: `public/characters/gomi/sleep-curled.png`

```text
Wrap this curled sleeping poodle in a thick warm muted oatmeal / dusty rose blanket pulled up OVER her head like a loose hood. ONLY HER FACE is visible in a small opening: sleepy closed eyes, tiny muzzle and little apricot forehead curls. All body, ears, legs and tail are concealed under the soft rounded blanket mound. Face remains centered a little left at the same position as original sleeping face; blanket follows rounded curled body footprint. Heavy soft blanket folds, sparse crayon texture. Cozy adorable sleeping face. Keep square canvas and bottom baseline identical; transparent outside blanket and face.
```

### `public/characters/gomi/angry.png`

입력: `public/characters/gomi/idle.png`

```text
Change ONLY the eyes, eyebrows and small mouth; keep seated body, ears, raised forehead curls, head angle, paws, scale, canvas and position identical. Both eyes become small sharply slanted TRIANGULAR eyes, inner corners angled downward with a fierce haughty glare. Small dark pupils and short slanted eyebrows. Closed tiny displeased mouth. She looks irritable and sharp because her sleep was interrupted, but still charming and adorable, not monstrous. No teeth, no symbols or red marks.
```

### `public/characters/gomi/sleep-curled-peek.png`

입력: `public/characters/gomi/sleep-curled.png`

```text
Change ONLY ONE eye on the viewer's left to a narrow half-open sleepy slit with tiny dark pupil peeking suspiciously. Other eye stays completely closed. Keep muzzle, mouth, forehead, curled body, long rear leg passing in front of muzzle, all paws, ears, baseline and position EXACTLY identical. This is the first annoyed peek when her owner lightly touches her in sleep.
```

### `public/characters/gomi/sleep-curled-angry.png`

입력: `public/characters/gomi/sleep-curled.png`

```text
Change ONLY eyes, eyebrows and small mouth. Open both eyes into tiny sharply slanted triangular eyes with dark pupils, inner corners steeply down, haughty fierce irritated glare, small displeased mouth. Keep whole curled sleeping body and long hind paw in front of muzzle, forehead, ears, all paws, baseline and position EXACTLY identical. Cute but noticeably angry about repeated sleep interruption; no teeth, no angry red marks.
```

### `public/characters/gomi/sleep-stretched-peek.png`

입력: `public/characters/gomi/sleep-stretched.png`

```text
Change ONLY ONE eye on viewer's left into a narrow half-open sleepy slit with tiny dark pupil. Other eye stays completely closed. Keep head angle, muzzle, mouth and entire stretched sideways sleeping body, paws, ears, tail, baseline, canvas, size and position EXACTLY identical.
```

### `public/characters/gomi/sleep-stretched-angry.png`

입력: `public/characters/gomi/sleep-stretched.png`

```text
Change ONLY eyes, eyebrows and tiny mouth: small sharply slanted TRIANGULAR eyes with dark pupils, angry inner corners down and haughty fierce glare, small displeased mouth. Keep head angle and entire stretched sideways lying sleeping body, paws, ears, tail, baseline, canvas, size and position EXACTLY identical. Cute poodle with irritated eyes; no teeth, no red angry marks.
```

### `public/characters/gomi/sleep-cool-peek.png`

입력: `public/characters/gomi/sleep-cool.png`

```text
Edit ONLY ONE eye on viewer's left into a tiny narrow half-open sleepy slit with small dark pupil peeking suspiciously. Other eye remains completely closed. Keep every blanket/quilt fold, bedding outline, color, texture, visible face, all forehead curls, muzzle, mouth, whole pose, baseline, canvas size and position EXACTLY unchanged. No change outside the eye.
```

### `public/characters/gomi/sleep-cool-angry.png`

입력: `public/characters/gomi/sleep-cool.png`

```text
Edit ONLY the eyes, eyebrows and tiny mouth. Both eyes small sharply slanted TRIANGULAR narrowed eyes with tiny dark pupils; inner corners down, haughty fierce irritated glare, short steep eyebrows and a small displeased closed mouth. She is cute but clearly irritable after repeated touches during sleep. Keep every blanket/quilt fold, bedding silhouette, body and face position, forehead curls, muzzle, baseline, canvas size and scale EXACTLY unchanged. No red marks, no teeth.
```

### `public/characters/gomi/sleep-warm-peek.png`

입력: `public/characters/gomi/sleep-warm.png`

```text
Edit ONLY ONE eye on viewer's left into a tiny narrow half-open sleepy slit with small dark pupil peeking suspiciously. Other eye remains completely closed. Keep every blanket/quilt fold, bedding outline, color, texture, visible face, all forehead curls, muzzle, mouth, whole pose, baseline, canvas size and position EXACTLY unchanged. No change outside the eye.
```

### `public/characters/gomi/sleep-warm-angry.png`

입력: `public/characters/gomi/sleep-warm.png`

```text
Edit ONLY the eyes, eyebrows and tiny mouth. Both eyes small sharply slanted TRIANGULAR narrowed eyes with tiny dark pupils; inner corners down, haughty fierce irritated glare, short steep eyebrows and a small displeased closed mouth. She is cute but clearly irritable after repeated touches during sleep. Keep every blanket/quilt fold, bedding silhouette, body and face position, forehead curls, muzzle, baseline, canvas size and scale EXACTLY unchanged. No red marks, no teeth.
```
