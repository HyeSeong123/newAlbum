# 곰고미 이름과 웃는 고미 로고 적용

사용자가 요청한 앱 표시 이름 `곰고미`와 웃는 고미 얼굴 로고를 소스에 반영했다. 헤더·브라우저 title/favicon·Android/Windows 표시 설정·네이티브 사진 선택·일기장·첫 안내·권한/오류 안내의 앱 이름을 맞췄다. 새 APK나 Windows 설치본을 빌드·설치한 결과는 아니다.

## 로고와 아이콘

- [로고 PNG](../public/brand/gomgomi-logo.png): 1254×1254, RGBA 투명 배경. 기존 `public/characters/gomi/happy.png`를 참고해 연한 갈색 푸들의 웃는 눈·입, 긴 귀, 색연필 질감을 유지했다. 원래 캐릭터 이미지는 변경하지 않았다.
- [헤더](../src/components/BrandLogo.tsx): 웃는 얼굴과 실제 텍스트 `곰고미`를 함께 표시하고 접근성 이름은 하나로 유지한다. 클릭하면 기존처럼 홈으로 이동한다.
- [아이콘 설정](../public/brand/gomgomi-icon.json): Tauri CLI로 파비콘과 Windows ICO(6개 크기)를 생성했다. Android CI도 같은 설정을 사용해 adaptive/round/일반 아이콘을 생성한다. foreground scale은65다.
- 로고 SHA256: `ee6722c0b946333ec3b811efe052f1af928adfb10b2a36e08150f61fc6d713db`.
- PNG/파비콘이 프런트 빌드의 `dist` 복사본과 해시까지 일치함을 확인했다.

이미지 생성 스킬의 내장 `image_gen`을 사용했다. 참고 이미지는 기존 웃는 고미이고, 최종 프롬프트는 아래와 같다.

> Create one square app logo asset for the Korean photo journal app 곰고미, using the provided existing Gomi artwork as the strict character reference. This is an edit/extraction into a polished icon, not a new character. Preserve Gomi exactly: female light apricot/tan toy poodle, fluffy curly top of head, long droopy darker apricot curly ears, short cream muzzle, dark brown round nose, warm crayon/pastel hand-drawn texture with brown hand-drawn outlines. Use the same joyful smiling face as this reference: both eyes gently closed into upward smile arcs, small friendly smiling curved mouth. Composition: head and both ears only, front facing with the same slight endearing tilt, centered large, fully visible with generous equal padding on all sides, no body, no paws, no accessories. No potato, no leaves, no bear, no lettering, no text, no border, no app mockup, no decorative sparkles. Genuinely transparent background, preserve clean soft alpha around fur. Distinctive readable face at 48px and suitable for use as an Android/Windows app icon and an in-app header mark. Produce one final image.

## 보존과 검증

Android ID `com.oraedameun.album.next`, Windows ID `com.oraedameun.album`, 실행 파일명 `gamjassak`, NSIS 설치 식별자 `그루터기`와 저장 키·DB·서명 설정을 유지했다. 감자 캐릭터의 이름 `감자싹`도 그대로다. Windows 이전 감자싹 바로가기는 기존 대상 확인 매크로를 통과한 경우에만 정리하도록 연결했다. 실제 Windows 업데이트 설치는 미검증이다.

- `npm run build`: 타입 검사·Vite·패키지 자산 검증 통과. 기존 청크 크기/정적·동적 import 경고는 남아 있다.
- `tests/branding.spec.ts`: 최종4개 통과(데스크톱2/모바일2). 로고·글자·favicon 로딩,320/393/1080/1440px 폭, 헤더 가림·가로 넘침, 로고 클릭 후 홈 이동, 기존 일기 표시, 첫 안내 닫기/재시작 보존을 실제 브라우저로 확인했다.
- 수정 후 모바일320px 및 데스크톱 렌더링을 직접 확인했다. 수정 전 앱 화면 캡처는 확보하지 못했다.
- 영향 범위 단위 검사30개 통과: Android 준비5, 대화5, 터치20. Android 준비 검사는 임시 폴더 상위 경로 제한으로 처음 실패했고 같은 검사에 파일 권한을 부여해5개 통과했다.
- 기존 의존성 일부가 빠져 `npm ci`로 잠금 파일대로 복원했다. 새 의존성을 추가하지 않았다. 첫 데스크톱 검사는 개발 서버의 `src/main.tsx` 응답이 끝나지 않아30초 제한에 걸렸고, 서버 준비 후 최종4개 재실행은14.4초에 모두 통과했다.
- 내장 브라우저는 연결 시 `missing field sandboxPolicy` 오류가 발생해 저장소의 Playwright 검사를 사용했다. 별도 읽기 전용 검토에서 중요한 통합 문제는 없었으며 남은 표기·조사 오류를 수정했다.

실제 Android/Windows 앱 패키지 빌드·서명·설치·업데이트 검사는 수행하지 않았다. 버전은0.9.43이며 commit/push/배포도 하지 않았다. 최종 화면 캡처는 `test-results/branding-header-*.png`, `test-results/branding-guide-*.png`다. 빌드 로그는 `benchmark-results/gomgomi-build.log`다.

## 요청한 순서로 확인한 학습 상태

이름·로고 변경과 위 검증을 마친 뒤 WSL 학습 로그를 확인했다. 확인 시점은 **115/117 update(약98%)**였으며 학습 PID419가 계속 실행 중이었다. 이는 학습 계산의 진행량이며 평가·저장·재로딩·독립 비교·Windows 복사 검증이 모두 끝났다는 뜻은 아니다. 기존 runner가 후속 작업을 자동 실행한다. 이번 이름·로고 작업에서 동결된 학습 자료나 학습 프로세스를 변경하지 않았다.
