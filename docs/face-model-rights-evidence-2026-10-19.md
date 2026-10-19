# 얼굴 모델 상업 이용 근거 추가 조사 — 2026-10-19

대상: `HyeSeong123/newAlbum`, 안정 브랜치 `cd3d1be70331d35d504c7081022b2cead8351498`, 개발 브랜치 조사 시작점 `5b0d046d88fb60ec09971f358ae48a88c1627956`.

결론: **128차원 인식 및 FaceAPI 자체 랜드마크의 가중치 이용 허가는 공개 근거가 있다. SSD에도 제작자의 Apache-2.0 허가가 있다. 세 모델 모두 FaceAPI 원본 배포 파일과 설치 파일의 바이트 일치를 확인했다. 다만 학습 데이터 조건과 제3자 권리가 최종 앱 배포에 미치는 영향까지 해결됐다고 판단하지 않는다.** 상업 이용 금지 확인과 프로젝트의 보수적인 출시 보류는 다른 판단이다.

이 문서는 추가 공개 증거 조사이며 법률 의견서나 새로 받은 권리자 승인서가 아니다. 사용자 사진·학습 데이터는 다운로드하지 않았고 외부 문의도 발송하지 않았다. 엔진 기본값, 출시 게이트, 모델, SQLite 및 사용자 데이터는 변경하지 않았다.

## 1. 이번에 확보한 핵심 직접 근거

### E1. 코드뿐 아니라 모델 파일도 MIT라는 원 제작자의 답변

- 원문: [FaceAPI #315, Model Licenses](https://github.com/justadudewhohacks/face-api.js/issues/315#issuecomment-500822444)
- 답변자: `justadudewhohacks` / Vincent Mühler, GitHub API `author_association=OWNER`.
- 작성·최종 수정: `2019-06-11T12:38:32Z`.
- 짧은 원문: “All of the model files available in this repo are licensed under MIT yes.”
- 이어지는 설명: 자신이 직접 학습하지 않은 SSD MobileNet V1, MTCNN, 얼굴 인식 모델은 각각 원 제작자 조건을 확인하라고 안내한다. 나머지는 자신이 만든 모델이며 목적 제한 없이 사용할 수 있다고 설명한다.

**확인 사실:** 코드 LICENSE에서 추정한 것이 아니라 모델 파일을 명시한 작성자 답변이 있다.

**해석:** README에 별도로 설명된 FaceAPI 자체 68점 랜드마크는 위 자체 제작 모델 범주에 속한다고 읽을 근거가 있다. 다만 이 답변에는 약 35k 학습 이미지의 구성·개별 권리·동의 증빙 또는 제3자 권리 보증은 없다.

### E2. 상업 이용에 대한 별도 긍정 답변

- [FaceAPI #338](https://github.com/justadudewhohacks/face-api.js/issues/338#issuecomment-506833294), 같은 원 제작자, `2019-06-28T18:25:43Z`.
- MIT와 TFJS Apache-2.0을 근거로 상업 이용 가능하다고 답변했다.
- 범위: 라이브러리 이용에 관한 일반 답변이다. #315와 함께 읽되 특정 광고 포함 Android APK와 전체 학습 데이터 권리를 개별 승인한 답변으로 확대하지 않는다.

### E3. 랜드마크 데이터 문의는 공개 답변이 확인되지 않음

- [#269](https://github.com/justadudewhohacks/face-api.js/issues/269)는 68점 랜드마크의 학습 데이터 이름과 라이선스를 직접 질문한다. 조회 시 공개 댓글은 0개였다.
- [#496](https://github.com/justadudewhohacks/face-api.js/issues/496)에도 데이터 구성을 확정하는 제작자 답변이 없었다.
- [#139](https://github.com/justadudewhohacks/face-api.js/issues/139#issuecomment-439689852)에서 제작자는 이메일로 연락하면 데이터 폴더 접근을 제공하겠다고 했지만, 이는 상업 학습 또는 상업 앱 가중치 배포 권리 증빙이 아니다.
- 범위: 위 공개 페이지를 확인했다는 뜻이며 모든 비공개 합의나 과거 자료의 부재를 증명하지 않는다.

## 2. 모델별 현재 판단

| 구성 | 확인한 가중치 허가 | 학습 출처와 미해결 사항 | 프로젝트 판단 |
|---|---|---|---|
| 128차원 인식 | dlib 제작자 public domain 선언·저장소 CC0; FaceAPI #315의 변환 배포 설명 | dlib가 FaceScrub·VGG-Face·웹 수집 학습을 공개. 이미지 조건의 가중치 이용자에 대한 적용 범위는 미확정 | 유지 검토 근거 충분. 전체 상업 출시 승인과 구분 |
| FaceAPI 68점 랜드마크 | #315의 모델 MIT·자체 제작 모델 목적 제한 없는 허가 | README는 약 35k 얼굴만 설명. #269에 데이터 이름·권리 답변 없음 | 가중치 허가 근거 강화. 데이터 계보 확인 남음 |
| SSD MobileNet V1 검출 | 원 제작자 yeephycho가 코드와 모델 모두 Apache-2.0으로 명시 | 같은 README가 WIDER FACE 조건도 확인하라고 안내. 공식 데이터 사이트는 CC BY-NC-ND 표시 | Apache 허가 확인. 데이터 조건과 배포 가중치의 관계 우선 확인 |

직접 출처:

- [FaceAPI 원본 README](https://github.com/justadudewhohacks/face-api.js/blob/a86f011d72124e5fb93e59d5c4ab98f699dd5c9c/README.md): SSD 출처, 35k 랜드마크, dlib 인식 설명.
- [SSD 원 제작자 README](https://github.com/yeephycho/tensorflow-face-detection/blob/1be9e93150118943036afdc3ed086563a0449888/README.md#license): 모델 Apache-2.0 및 WIDER FACE 별도 안내.
- [WIDER FACE 공식 페이지](https://shuoyang1213.me/WIDERFACE/): 데이터 라이선스와 연락처. CUHK 기존 주소도 이 주소를 안내한다. 원 사이트 직접 HTTP 조회는 503, 웹 검색의 공식 페이지 색인에서는 조건과 연락처가 확인됐다. 색인 내용을 새 원본 HTTP 스냅샷으로 표시하지 않는다.
- [dlib README](https://github.com/davisking/dlib-models/blob/fd81b6308a6a73d4ce08859eb2f4b628a21e27a2/README.md), [CC0](https://github.com/davisking/dlib-models/blob/fd81b6308a6a73d4ce08859eb2f4b628a21e27a2/LICENSE).
- [VGG-Face 데이터 licence.txt](https://www.robots.ox.ac.uk/~vgg/data/vgg_face/licence.txt): 비상업 조건. 다른 모델인 VGG-Face 신경망의 라이선스를 dlib 가중치에 직접 적용하지 않는다.
- [FaceScrub 배포자](https://malea.winkler.site/facescrub.html): 사진을 소유하지 않아 URL·주석만 제공한다고 설명. 이 URL과 논문 인용만으로 모든 사진 권리를 확보했다고 판단하지 않는다.

중요한 구분:

1. dlib의 `shape_predictor_68_face_landmarks.dat`에 붙은 iBUG/300-W 상업 제한 경고는 그 파일에 대한 것이다. 감자싹의 FaceAPI 68점 모델이나 128차원 인식 모델에 그대로 전용하지 않는다.
2. CC0·MIT·Apache 허가는 허가자가 보유한 권리에 관한 근거다. 제3자 이미지 권리까지 보증받았다는 뜻은 아니다.
3. 학습 데이터 NC 조건이 모든 학습 가중치에 자동 전이된다고 단정하지 않는다. 반대로 데이터와 가중치는 무관하다고 단정하지 않는다. [Creative Commons AI 안내](https://creativecommons.org/using-cc-licensed-works-for-ai-training-2/)도 보수적 준수 지침과 실제 법적 적용 분석을 구분한다. 현재 웹 문구만으로 과거 데이터 취득 계약·예외·관할법까지 결정할 수 없다.

## 3. 실제 파일 계보 검증

원본 커밋 `a86f011d72124e5fb93e59d5c4ab98f699dd5c9c`의 `weights/*-weights_manifest.json`에 나열된 shard를 순서대로 내려받아 합쳤다. 이 바이트를 설치된 `@vladmandic/face-api@1.7.15/model/*.bin` 및 감자싹 `scripts/face-models.lock.json`과 비교했다. manifest는 경로·공백이 달라 파일 해시 자체가 다를 수 있으므로 텐서 배열의 이름·순서·shape·dtype·양자화 정보를 구조적으로 비교했다.

| 모델 | 바이트 수 | 텐서 수 | 원본 ↔ npm 바이트 | 텐서 명세 | 감자싹 잠금 해시 |
|---|---:|---:|---|---|---|
| SSD | 5,616,957 | 151 | 일치 | 일치 | 일치 |
| Landmark 68 | 356,840 | 49 | 일치 | 일치 | 일치 |
| Recognition 128 | 6,444,032 | 117 | 일치 | 일치 | 일치 |

전체 SHA-256, 원본 shard URL, 댓글 작성자·시간·본문 지문은 [검증 기록 JSON](gamjassak-ai-analysis/evidence/face-model-rights-2026-10-19.json)에 기록했다. 댓글 전문과 모델 바이너리는 저장소에 새로 복제하지 않았다. 댓글 본문 지문은 GitHub API `body` 문자열을 UTF-8로 해시한 값이다. 그 지문은 불변 시점 인증이나 제3자 권리 보증을 대신하지 않는다.

확인한 범위는 FaceAPI 공개 배포물 → 설치 npm 파일 → 프로젝트 잠금 값이다. **dlib `.dat` 또는 yeephycho TensorFlow 원본 → FaceAPI 변환을 직접 재현하지 않았고, 최종 APK/AAB 자산·실기기 추론·식별 정확도도 이번 조사에서 검사하지 않았다.** 해시 일치는 출처 동일성 근거이며 권리 증명이 아니다.

재현 예시(저장소 루트, 의존성 설치 후, 모델 가중치만 다운로드):

```python
import hashlib, json, pathlib, urllib.request
base = ('https://raw.githubusercontent.com/justadudewhohacks/face-api.js/'
        'a86f011d72124e5fb93e59d5c4ab98f699dd5c9c/weights/')
def fetch(url):
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read()
lock = json.loads(pathlib.Path('scripts/face-models.lock.json').read_text())
root = pathlib.Path('node_modules/@vladmandic/face-api/model')
for name in ('ssd_mobilenetv1_model', 'face_landmark_68_model', 'face_recognition_model'):
    manifest = json.loads(fetch(base + name + '-weights_manifest.json'))
    upstream = b''.join(fetch(base + path) for group in manifest for path in group['paths'])
    installed = (root / (name + '.bin')).read_bytes()
    packaged = json.loads((root / (name + '-weights_manifest.json')).read_text())
    assert upstream == installed
    assert hashlib.sha256(installed).hexdigest() == lock['models'][name + '.bin']
    assert [w for g in manifest for w in g['weights']] == [w for g in packaged for w in g['weights']]
    print(name, 'PASS', hashlib.sha256(installed).hexdigest())
```

## 4. 남은 확인 사항과 문의 범위

### 우선 1: WIDER FACE로 학습한 SSD 가중치의 배포 조건

공식 연락처: [WIDER FACE Contact](https://shuoyang1213.me/WIDERFACE/), `shuoyang.1213@gmail.com`. 연구 문의 창구이며, 모든 사진 권리자를 대표해 허가할 수 있다고 가정하지 않는다.

미발송 문의안. 기존 가중치의 상업 이용 조건을 묻는 내용이며 원본 데이터 신청이 아니다.

> Subject: Clarification: commercial redistribution of WIDER FACE-trained SSD weights
>
> We are reviewing an offline Android photo-album application that may contain advertising. It uses the FaceAPI SSD MobileNet V1 detector derived from yeephycho/tensorflow-face-detection. The detector author licenses the code and model under Apache-2.0 and separately refers users to the WIDER FACE terms.
>
> The packaged detector SHA-256 is 2835640602d53718aa6ae9a42896327eaa21beefed056c218d32ca7d79e1e2f8. We would redistribute these existing weights inside the application and run inference locally. We would not redistribute WIDER FACE images or annotations.
>
> Do the WIDER FACE dataset terms restrict commercial inference and redistribution of these trained weights? If permission is required, which rights holder can grant it, what scope can that permission cover, and which notices or conditions apply? Please distinguish your dataset/annotation rights from rights in third-party photographs. A public clarification or a written reply would help us record the applicable terms.

### 우선 2: FaceAPI 랜드마크 학습 자료의 조건

공개 창구: [Vincent Mühler의 GitHub profile](https://github.com/justadudewhohacks), 기존 [#269](https://github.com/justadudewhohacks/face-api.js/issues/269). 현재 GitHub 공개 API에 email이 없어 주소를 추측하지 않는다. #139의 과거 프로필 이메일 안내는 현재 주소의 검증 근거가 아니다.

미발송 문의안:

> Subject: Training-data terms for the MIT-licensed FaceAPI 68-point landmark model
>
> Thank you for your clarification in issue #315 that model files are MIT-licensed and that your own models may be used for any purpose. We are reviewing the standard face_landmark_68_model for an offline Android photo-album application that may contain advertising.
>
> Its SHA-256 is 4611ef65c87d836d03d684b30eec4d195d8b219fa1dd58fc58945831c6b9299b. Could you identify the datasets behind the approximately 35k training images and confirm whether any additional terms affect commercial inference or redistribution of these weights? In particular, do any iBUG/300-W or other noncommercial dataset terms apply to this specific model? Please identify any remaining third-party limitations and required notices. Dataset names and applicable terms would be sufficient; we do not need the images.

### 우선 3: 128차원 가중치의 잔여 쟁점

가중치 자체의 public domain 허가를 다시 받는 것이 첫 과제는 아니다. dlib가 밝힌 VGG-Face·FaceScrub·웹 이미지의 조건이 기존 가중치를 APK에 넣는 이용자에게 어떻게 적용되는지가 남는다. 필요하면 기존 허가와 계보 자료를 근거로 해당 범위에 한정한 전문 검토를 받는다. 모든 촬영자에게 일률적으로 개별 연락해야 한다고 단정하지 않는다.

## 5. 제품·출시 판단

- **가중치 공개 허가:** 세 모델 모두 긍정적인 직접 근거가 있다. 특히 랜드마크는 이번 #315 발견으로 이전 조사보다 근거가 강화됐다.
- **동일 파일 사용:** 세 모델 모두 FaceAPI 원본 배포물과 일치 확인.
- **학습 데이터·제3자 권리:** 공개 답변만으로 최종 해결되지 않음. SSD와 랜드마크에 대한 문의를 구체적으로 좁힐 수 있다.
- **상업 출시:** 아직 승인하지 않음. 이를 세 모델의 불법 또는 일괄 상업 금지 판정으로 표현하지 않는다. 개발용 비교 보존과 상업 패키지 승인도 구분한다.
- **완전 자체 AI 목표:** 외부 가중치 이용 허가가 확인돼도 이 모델들이 감자싹 자체 학습 모델이 되는 것은 아니다. 신규 자체 엔진에 외부 사전학습 가중치를 유입하지 않는다.
- **현재 코드 주의:** FaceX 파일만 빼도 기존 DB의 512 특징을 후보 비교에서 우선 사용할 수 있다(`src-tauri/src/faces.rs`). 향후 128 전용 모드 구현 시 파일·다운로더·번들뿐 아니라 비교 경로도 128로 제한해야 한다. 사용자 확인 연결과 등록 정보는 보존한다.

이번 변경은 증거 문서 추가다. 상업 승인 플래그를 켜거나 기존 안정 브랜치를 수정하지 않는다. 런타임 변경이 없어 앱 테스트는 재실행하지 않았으며, 바이트·manifest·잠금 값 검증을 수행했다.
