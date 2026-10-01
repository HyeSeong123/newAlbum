# 감자싹 브랜드 적용

승인한 단일 가로 로고의 감자 캐릭터와 손글씨 `감자싹`을 사용한다. 앱 상단에는 로고 이미지 하나만 표시하며 별도 텍스트나 부제를 덧붙이지 않는다. 기존 아이보리 종이·갈색 글자·초록 포인트의 화면 스타일을 유지한다.

- `public/brand/gamjassak-logo.png`: 승인한 가로 로고에서 배경을 제거한 투명 PNG. 데스크톱과 모바일 상단에서 사용한다.
- `public/brand/gamjassak-symbol.png`: 같은 감자 캐릭터만 남긴 투명 PNG. 첫 실행 안내에서 사용한다.
- `public/favicon.png`, `src-tauri/icons/icon.ico`: 캐릭터 원본을 Tauri CLI의 `tauri icon`으로 변환한 웹·앱·설치·삭제 아이콘.
- `index.html`, `src/App.tsx`, `src/brand.css`, 첫 실행·일기·설정·사람 화면 및 네이티브 안내: 표시 이름을 `감자싹`으로 변경한다.

## 기존 설치와 데이터

앱 식별자 `com.oraedameun.album`, Rust crate 이름, DB·캐시 경로, IndexedDB·localStorage 키, 로컬 서버 주소를 유지한다. 창과 Windows의 앱 목록·바로가기는 `감자싹`, 실행 파일은 `gamjassak.exe`로 표시한다.

NSIS 기본 템플릿은 제품 이름을 설치 레지스트리 키에도 사용하므로 이름만 바꾸면 별도 설치로 인식한다. `src-tauri/windows/installer.nsi`는 사용 중인 CLI 버전 `tauri-cli-v2.11.4`의 [공식 템플릿](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.4/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi)을 보존하고 설치 식별자만 기존 값으로 고정한다. 표시 이름은 새 제품 이름을 사용하며 이전 설치 위치를 읽어 업데이트한다. 이전 실행 파일은 Tauri의 기존 바이너리 교체 동작으로 정리하고, 브랜드 교체 훅은 이 설치를 가리키는 이전 바로가기만 제거한다. CLI 업데이트 때 템플릿과 훅의 호환성을 함께 검토한다. 공식 템플릿의 MIT 라이선스는 같은 폴더에 보관한다.

패키징 검사는 이전 0.3.x 설치에 데이터를 저장한 뒤 `/D` 경로 지정 없이 새 설치·업데이트 파일을 실행해 이전 설치 위치, 이름·바로가기 변경, 중복 앱 없음, DB·WebView 데이터 유지와 재시작을 확인한다. `Oraedameun-Windows-*`와 `Gamjassak-Windows-*` 양쪽의 이전 아티팩트를 검색한다. 소스 수정 업로드마다 두 설치 파일을 자동 생성하는 정책을 유지한다.

## 원본 제작

내장 imagegen으로 승인한 로고를 편집했다. 이미지 제작은 배경 추출이며 새 캐릭터나 글꼴로 다시 디자인하지 않는다. 다음 프롬프트의 제약으로 가로 로고와 캐릭터를 각각 생성한 뒤 프로젝트 경로에 복사했다.

가로 로고: `Extract the approved single horizontal logo exactly: same cute tan potato with two sage-green leaves and exact walnut-brown Korean hand-drawn lettering 감자싹. Remove only the ivory paper background and unnecessary outer margins. Preserve shapes, eyes, smile, spots, colors and arrangement. One logo only. True transparent background including counters and leaf gaps. No redesign, captions, second logo, shadow or mockup.`

캐릭터: `Extract only the approved potato-sprout character, faithfully unchanged: tan silhouette, two sage leaves, brown eyes, smile and spots. Remove all Korean text and ivory paper. One centered character on a square canvas with clear padding and true transparency, including leaf gaps. No redesign, letters, frame, shadow, background or mockup.`
