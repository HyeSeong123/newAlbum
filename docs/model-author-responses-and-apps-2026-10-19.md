# 얼굴 모델 제작자 공개 응답과 사용 앱 조사 — 2026-10-19

범위: 감자싹의 기존 FaceAPI SSD·68점 랜드마크·128차원 인식 모델. 공개 GitHub 이슈의 관측 비율과 확인 가능한 실제 사용 사례를 조사했다. 이메일·이슈를 새로 발송하거나 사용자 학습 사진을 다운로드하지 않았다.

## 1. 공개 이슈 응답 관측

각 저장소에서 생성일 최신순 외부 사용자 이슈 30건을 선정했다. 열린 이슈와 닫힌 이슈를 모두 포함하고 PR·저장소 소유자 본인이 만든 이슈는 제외했다. 정확한 제작자 계정의 공개 댓글이 하나 이상 있으면 응답으로 계산했다. 커뮤니티 답변, 닫기 작업, 반응 이모지와 PR 리뷰는 제작자 응답으로 세지 않았다.

| 모델 제작자 / 저장소 | 표본 생성 기간 | 제작자 댓글 있는 이슈 | 관측 비율 | 2024년 이후 생성분의 제작자 응답 |
|---|---|---:|---:|---:|
| Vincent Mühler / `justadudewhohacks/face-api.js` | 2024-01-04 ~ 2026-04-28 | 0 / 30 | 0% | 0 / 30 |
| SSD 제작자 / `yeephycho/tensorflow-face-detection` | 2018-09-25 ~ 2025-11-10 | 9 / 30 | 30% | 0 / 2 |
| Davis King / `davisking/dlib-models` | 2019-07-28 ~ 2025-05-22 | 18 / 30 | 60% | 1 / 4 |

- 이는 **이 표본에서 관측한 비율**이다. 새 문의에 답할 확률, 라이선스 문의만의 응답률, 이메일 응답률이 아니다. 기간이 달라 제작자 간 현재 응답성을 단순 순위로 비교하지 않는다. 특히 2건·4건의 최근 표본은 매우 작다.
- FaceAPI에는 과거 2019년 모델 MIT 및 상업 이용 답변 #315·#338이 있으나, 최신 30건에는 제작자 댓글이 없었다. 과거 답변의 존재와 최근 활동을 구분한다.
- SSD에서 이번 표본 중 최근 생성된 제작자 응답 사례는 [#69](https://github.com/yeephycho/tensorflow-face-detection/issues/69#issuecomment-861104445)(이슈 생성 2020년) 등이다. 이는 2026년 현재 응답성이 높다는 근거가 아니다.
- dlib에는 [#56](https://github.com/davisking/dlib-models/issues/56#issuecomment-2105814956)(이슈 생성 2024년) 등 제작자 응답이 있었다. 모델 사용 허가나 현재의 응답 보장을 뜻하지 않는다.
- 감자싹이 사용하는 유지보수 포크 `vladmandic/face-api`는 GitHub API에서 archived=true였다. 이는 원본 `face-api.js` 저장소의 archive 상태와 다르다. 포크의 과거 응답률은 별도로 계산하지 않았다.
- **yeephycho는 SSD 제작자이고, WIDER FACE 문의 담당자 Shuo Yang과 다른 사람이다.** 위 30%를 WIDER FACE 담당자의 응답률로 사용하면 안 된다.

조사 방식: GitHub REST로 이슈를 선정했다. 비인증 댓글 조회가 HTTP 403으로 중단되어 그 배치 결과는 사용하지 않았다. 이후 GitHub 커넥터로 댓글이 있는 48개 이슈의 댓글 전체를 다시 읽어 작성자를 대조했다. 공개 댓글 수 0인 42건은 응답 없음으로 기록했다. 조회 사이에 생긴 변경, 삭제·비공개 댓글은 관측할 수 없다. 댓글 시간이 커넥터 결과에 없어 평균·중앙 응답 시간은 계산하지 않았다.

표본 90건의 URL, 생성일, 제작자 답변 여부와 해당 댓글 링크: [측정 기록 JSON](gamjassak-ai-analysis/evidence/model-author-responses-2026-10-19.json).

## 2. 이메일 응답률

**확인 불가.** 전체 받은 문의 수와 답변 수가 공개돼 있지 않아 수치를 계산할 수 없다. GitHub 활동이나 이메일 주소가 게시돼 있다는 사실로 이메일 응답률을 추정하지 않는다. 이번 조사에서 새 이메일이나 GitHub 문의를 발송하지 않았다.

## 3. 실제 사용 사례

### Nextcloud Recognize — 동일 세 모델과 패키지 버전 확인

- [공식 앱 배포 페이지](https://apps.nextcloud.com/apps/recognize), [공식 저장소](https://github.com/nextcloud/recognize).
- 검사한 커밋: `61cac761a9f1de59b0c9e528060e42540afc7347`.
- [얼굴 분석 코드](https://github.com/nextcloud/recognize/blob/61cac761a9f1de59b0c9e528060e42540afc7347/src/classifier_faces.js)는 `@vladmandic/face-api`의 `ssdMobilenetv1`, `faceLandmark68Net`, `faceRecognitionNet`을 패키지의 model 디렉터리에서 로딩하고 `withFaceLandmarks().withFaceDescriptors()`를 실행한다.
- [package-lock.json](https://github.com/nextcloud/recognize/blob/61cac761a9f1de59b0c9e528060e42540afc7347/package-lock.json)의 설치 버전은 감자싹과 같은 `@vladmandic/face-api@1.7.15`다. package.json의 선언 범위는 `^1.7.11`이지만 실제 잠금 버전을 따로 확인했다.
- 확인 수준: 라이브러리 이름만 같은 예제가 아니라 **동일 세 모델을 사용하는 배포 앱의 코드 사례**다. 서버에서 실행하는 Nextcloud 앱이며 Android 온디바이스 광고 앱과 동일한 배포 형태는 아니다.
- 미확인: 실제 배포 패키지의 바이트 검증, 별도 권리자 합의, 학습 데이터 권리 검토 결과, 광고 포함 상업 배포의 허가. Nextcloud의 이용 사실을 감자싹에 대한 허가로 대체하지 않는다.

### Photoview — dlib 128차원 인식 계보 사용 확인

- [공식 저장소](https://github.com/photoview/photoview)는 배포 가능한 자체 호스팅 사진 갤러리와 얼굴별 그룹 기능을 제공한다.
- 검사한 커밋: `0f2e3741e7b18ff3517d18b15d16494b93bb312b`.
- [모델 디렉터리](https://github.com/photoview/photoview/tree/0f2e3741e7b18ff3517d18b15d16494b93bb312b/api/data/models)에 `dlib_face_recognition_resnet_model_v1.dat`, `mmod_human_face_detector.dat`, `shape_predictor_5_face_landmarks.dat`가 있다.
- [실행 코드](https://github.com/photoview/photoview/blob/0f2e3741e7b18ff3517d18b15d16494b93bb312b/api/scanner/face_detection/face_detector_impl.go)는 `Kagami/go-face`와 모델 경로로 recognizer를 초기화한다.
- 확인 수준: 감자싹 FaceAPI 128 인식의 원본인 dlib 인식 모델 계보의 실제 사용 사례다. **FaceAPI SSD·68점 모델과 같은 구성은 아니다.** dlib 파일의 바이트를 이번에는 내려받아 비교하지 않았다.
- 미확인: 이 프로젝트가 받은 별도 권리 허가와 최종 상업 Android 패키지. 오픈소스 배포·설치 가능성과 광고 포함 앱의 권리 승인을 구분한다.

### LibrePhotos — 현재 사례와 과거 사례 구분

- [공식 2026년 4~6월 개발 기록](https://docs.librephotos.com/blog/2026w25/)은 이전 dlib 128차원 인식에서 InsightFace/ArcFace 512차원으로 전환했다고 설명한다.
- 따라서 dlib 128 사용은 과거 사례로만 다룬다. 현재도 동일 모델을 쓴다는 사례에 포함하지 않는다. 대체 모델의 상업 권리가 확인됐다는 뜻도 아니다.

## 4. 조사로 판단할 수 있는 것

1. FaceAPI 원 제작자의 새 공개 답변을 받을 수 있다고 전제해 출시 일정을 잡기는 어렵다는 관측 근거가 있다. 이메일 결과는 별개로 모른다.
2. 동일 세 얼굴 모델을 사용하는 실배포 프로젝트는 있다. Nextcloud Recognize가 구체적 사례다.
3. 이번 조사에서 **같은 모델 바이너리를 광고 포함 Android 앱에 배포하면서 관련 권리 승인까지 공개한 사례**는 확인하지 못했다. 존재하지 않는다는 뜻은 아니다.
4. 다른 앱의 사용·스토어 등록은 감자싹의 허가 증명이 아니다. 반대로 현재 확인된 모델 MIT·CC0·Apache 허가를 없는 것으로 취급하지 않는다.
5. 다음 권리 확인은 WIDER FACE 담당자에게 기존 가중치 배포 조건을 묻는 일과, FaceAPI의 학습 데이터 잔여 조건을 확인하는 일로 좁힐 수 있다. 명확한 공개 허가를 받은 부분까지 무조건 재승인을 요구하는 일은 피한다.

런타임·모델·사용자 데이터·상업 승인 플래그는 변경하지 않았다. 앱 테스트가 아니라 공개 이슈 표본 산출과 원문 코드·잠금 파일 확인을 수행했다.
