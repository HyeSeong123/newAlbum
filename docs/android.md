# 감자싹 Android 준비

PC와 Android는 같은 저장·앨범·일기·캐릭터 코드를 사용한다. Android 설정과 네이티브 문서 연결부만 `src-tauri/tauri.android.conf.json`, `src-tauri/android/`, `src-tauri/src/android_media.rs`로 분리했다. 별도 저장소나 웹 프로젝트 복제는 필요 없다.

## 구현 범위

- 모바일 진입점과 Tauri의 앱 내부 화면을 사용한다. Windows 단일 실행 플러그인과 127.0.0.1 고정 서버는 Android에 포함하지 않는다.
- Rust 런타임과 JavaScript API는 Tauri 2.12.1로 고정한다. [Android Activity 재생성 후 선택기·권한 연결 수정](https://github.com/tauri-apps/tauri/releases/tag/tauri-v2.12.0)을 포함한다. Android 프로젝트 생성은 SDK 36과 Gradle 8.14.3을 제공하는 잠금 파일의 CLI 2.11.4를 유지한다.
- Android 파일 선택기의 content URI를 문서 API로 읽고, 원본을 건드리지 않고 앱의 `imported-media-v1`에 스트리밍 복사한다. 현재 dialog 플러그인은 Android 폴더 선택을 지원하지 않으므로 폴더 가져오기와 내보내기 위치는 연결부의 `ACTION_OPEN_DOCUMENT_TREE`를 사용한다. 하위 폴더를 탐색하며 지원하는 미디어만 보관한다. 사진 위치정보 접근이 허용된 사진을 다시 선택하면 원본을 갱신하고, 다른 기존 보관본은 재사용한다.
- 복사 → 중복 해시·EXIF 분석 → SQLite → 지역·앨범 저장 중 전체 화면 진행 표시를 유지한다. 원본 파일 전체를 JS 메모리에 올리지 않는다.
- 사진 원본 저장과 앨범 내보내기는 사용자가 고른 Android 문서 위치에 복사한다. 일기 첨부도 같은 보관 방식을 사용한다.
- 뒤로가기는 열린 창을 닫고 일반 화면에서는 홈으로 이동한다. 홈에서는 루트 태스크를 백그라운드로 보내 기록 화면과 네이티브 연결을 유지한다. 가져오는 동안에는 작업을 계속 표시한다.
- Android 9/API 28 이상을 첫 대상으로 삼고 SDK 36을 타겟팅한다. 현재 Play 제출 기준은 Android 16/API 36 이상이다.
- 기록은 앱 내부 SQLite에 저장하며 서버 계정·PC 자동 동기화는 없다. 개인 기록을 자동 클라우드 백업에서 제외한다. **앱 삭제·저장소 초기화 때 앱 기록과 보관본은 삭제된다.** 갤러리 원본은 유지된다. 전체 기록 백업·복원 기능은 후속 검토가 필요하다.

## 0.6.4 가져오기와 달력

- 모바일 첫 안내와 가져오기 화면에서 카메라 위치 권한·위치 태그 설정을 안내한다. 이미 촬영한 파일에 GPS 정보가 없으면 직접 시·도와 시·군·구를 지정한다.
- 파일 선택과 폴더 선택 모두 새로 가져온 사진·영상에 동일한 지역을 지정할 수 있다. 기존 기록과 음성 파일은 변경하지 않는다.
- 가져오기 또는 앨범 만들기에서 `달력에 등록하기`를 선택하고 라벨과 날짜를 설정한다. 촬영일 기준은 연속 날짜별로 연결하며 빈 날은 분리한다. 날짜 직접 선택은 지정한 시작일부터 종료일까지 연결한다. 촬영 날짜가 없는 기록은 날짜 직접 선택이 필요하다.
- 달력 날짜 칸에는 사진·영상 개수를 표시한다. 썸네일은 날짜/라벨을 눌러 여는 상세 화면에서만 표시한다. 일정 등록·매년 반복·디데이 기능은 제거했다.
- 달력 라벨은 앱 내부 저장소에 보관하고 재실행해도 유지한다. 등록 해제는 라벨만 지우며 사진·영상과 앨범을 삭제하지 않는다. 저장 공간 부족 등으로 달력 등록만 실패한 경우에도 가져온 파일과 생성한 앨범은 유지하고 오류를 표시한다.

## Windows에서 개발 실행

Android Studio, JDK 17, SDK Platform 36, Build Tools 36.0.0, Platform Tools와 NDK `28.2.13676358`을 설치한다. Rust stable과 Node는 기존 개발 도구를 사용한다. 실제 설치 경로가 다르면 다음 PowerShell 경로를 수정한다.

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:NDK_HOME = "$env:ANDROID_HOME\ndk\28.2.13676358"
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"
rustup target add aarch64-linux-android
npm ci
npm run android:init
```

휴대폰 개발자 옵션에서 USB 디버깅을 켜고 연결을 승인한다. `adb devices`에 표시되면 실행한다.

```powershell
npm run android:dev
```

Tauri가 제공하는 `TAURI_DEV_HOST`를 Vite가 사용한다. PC 방화벽과 개발 서버 연결은 실기기에서 확인한다. `src-tauri/gen/android`는 개인 SDK 경로와 서명 설정이 들어가는 재생성 가능 디렉터리이므로 커밋하지 않는다. `android:init` 후 `android:prepare`가 Kotlin 연결부와 Gradle 설정을 적용한다.

## 테스트 APK

```powershell
npm run android:apk
```

ARM64 휴대폰용 **debug 서명 APK**가 `src-tauri/gen/android/app/build/outputs/apk`에 생성된다. Play 제출용 서명과 다르다. `Android preview APK` Actions는 휴대폰용 ARM64 APK 한 개만 다운로드로 제공하고, x86_64 빌드는 내부 검사에 사용한다. 에뮬레이터 설치, 실제 폴더 선택·URI 복사·진행률·재실행 후 SQLite 보존을 검사한 뒤 휴대폰용 APK를 제공한다. 삼성 실기기의 선택기·HEIC/HDR·영상 코덱·메모리 사용도 별도 확인해야 한다.

CI 미리보기는 개발용 키를 별도로 캐시하고 APK를 같은 키로 서명한다. 키 캐시를 삭제하거나 잃으면 기존 테스트 APK에 덮어 설치할 수 없으므로 테스트용 키와 Play 업로드 키를 구분한다. 실제 배포 키는 아래 안내에 따라 사용자가 보관한다.

재실행 검증은 홈 뒤로가기 후 복귀(동일 Activity·프로세스)와 완전 종료 후 시작을 다룬다. Activity를 강제로 삭제하고 프로세스만 유지하는 재실행은 [엔진의 열린 문제](https://github.com/tauri-apps/tauri/issues/15671)가 있으므로, 전경 서비스나 프로세스 유지 기능을 추가할 때 별도 해결이 필요하다.

## Play용 AAB

업로드 키는 사용자가 소유·보관한다. 기존 Android 앱을 등록한 적이 있다면 기존 서명과 패키지 이름을 확인한다. 현재 앱 ID는 `com.oraedameun.album`이며 새 Play 등록 전에 최종 확정한다.

[공식 서명 안내](https://v2.tauri.app/distribute/sign/android/)에 따라 키를 만들고 `src-tauri/gen/android/keystore.properties`를 로컬에 작성한다. 키 파일과 비밀번호는 Git에 올리지 않는다.

```properties
keyAlias=upload
keyPassword=업로드키비밀번호
storePassword=키저장소비밀번호
storeFile=C:/Users/사용자/upload-keystore.jks
```

```powershell
npm run android:aab
```

서명 설정이 없으면 빌드를 시작하지 않는다. 공통 버전 스크립트를 사용하고 Android versionCode는 Tauri 기본 `major*1000000 + minor*1000 + patch`를 따른다. AAB는 `src-tauri/gen/android/app/build/outputs/bundle`에 생성된다.

Play Console 개발자 계정, 실기기 검증, 개인정보처리방침의 공개 주소·연락처, 스토어 이미지·설명과 실제 동작에 맞는 데이터 보안 양식을 준비한 뒤 내부 테스트 트랙부터 올린다. 현재 작업은 스토어 게시를 수행하지 않는다.

사진·GPS EXIF·일기와 얼굴/반려동물 분석은 로컬에서 처리한다. 웹 글꼴의 외부 CDN 요청이 있으므로 무통신 앱이라고 표기하지 않는다. 광고나 원격 분석 SDK는 이번 준비에 추가하지 않았다. HEIC 표시·모든 영상 코덱 재생, 전체 기록 백업·복원, 장시간 가져오기 도중 앱을 종료한 후 재개는 실기기 확인과 후속 작업이 필요하다.

## 검증과 공식 근거

- 로컬: 프런트 빌드·단위 검사·Android 준비 스크립트 검사.
- CI: Linux Rust 저장·스트리밍 복사 검사, 기존 Windows 설치/업데이트, Android APK·에뮬레이터 검사. SDK/NDK·JDK·Rust가 없는 작업 환경에서는 Actions 결과가 실제 APK 빌드 상태의 기준이다.
- [Tauri 모바일 준비](https://v2.tauri.app/start/prerequisites/)
- [파일 선택기와 Android content URI](https://v2.tauri.app/plugin/dialog/)
- [Tauri Play 배포](https://v2.tauri.app/distribute/google-play/)
- [2026 Play API 수준 기준](https://developer.android.com/google/play/requirements/target-sdk?hl=ko)
## 0.6.5 모바일 화면과 터치 수정

- Android의 상태바·내비게이션 바·화면 잘림 영역을 네이티브 컨테이너에서 제외합니다. 처리한 인셋은 WebView에 0으로 전달하여 중복 여백을 방지하고, 키보드 인셋 업데이트는 유지합니다.
- 가져오기 창은 제목·닫기와 하단 선택 버튼을 항상 보이고 옵션 영역만 스크롤합니다. 키보드가 나타나면 실제 보이는 뷰포트 높이에 맞춥니다.
- 사진 선택 모드에서는 터치로 탭한 사진만 선택하고 위아래 드래그는 스크롤합니다. 마우스 드래그의 여러 줄 선택과 키보드 선택은 유지합니다.
- 휴대폰에서도 책 배경·제본과 좌우 펼침을 유지합니다. 앨범을 보는 동안 앱 메뉴 대신 앨범의 뒤로 가기를 사용하고, 가로 화면은 도구 높이를 줄여 책 공간을 확보합니다.
- 회귀 검사는 실제 터치 스와이프, 탭, 마우스·키보드 선택, 짧은 가져오기 창, 세로·가로 앨범을 포함합니다. Android 설치 검사에서는 시스템 바를 포함한 전체 화면 캡처와 WebView 경계를 확인합니다.

## 0.6.20 사진 원본 GPS와 재가져오기

- Android 10 이상에서 `ACCESS_MEDIA_LOCATION`을 선언하고 사진 가져오기당 한 번 권한을 확인한다. 선택한 사진의 촬영 위치를 읽는 권한이며 현재 기기의 위치를 수집하지 않는다. 거부해도 가져오기를 계속하고 완료 안내에 위치정보 제한을 표시한다.
- MediaStore 사진과 로컬 SAF 문서는 `MediaStore.getMediaUri`로 선택한 문서의 읽기 권한을 전달하고, 허용 시 `setRequireOriginal`로 GPS가 제거되지 않은 원본을 읽는다. 원본 요청을 지원하지 않는 저장소는 안내를 표시하며 기존 보관본을 손상시키지 않는다. 별도의 전체 갤러리 읽기 권한을 요청하지 않는다.
- 같은 원본을 다시 선택하면 기존 보관 경로를 유지한 채 복사하고 내용 해시가 바뀐 경우 EXIF를 재검사한다. 사진 ID, 앨범 순서·표지, 메모·별점·즐겨찾기를 보존한다. 직접 지정한 지역은 유지하고, 실제 원본의 GPS는 별도로 갱신하여 캐릭터 조건에서 수동 지역과 혼동하지 않는다.
- 첨부·공유 과정에서 GPS가 없는 파일은 좌표를 추측하지 않는다. 휴대폰 원본에 위치가 있다면 권한 허용 후 원본을 다시 가져오도록 안내한다.
- Android 설치 검사는 공개 좌표(서울시청 근처)를 넣은 합성 JPEG와 GPS 없는 합성 JPEG를 사용한다. 실제 문서 선택 → 위치정보 거부 → 재허용·같은 사진 재가져오기 → 좌표·지역·기존 편집 보존을 검사한다. 사용자 사진은 테스트 저장소에 넣지 않는다.
- 공식 근거: [사진의 위치정보 접근](https://developer.android.com/training/data-storage/shared/media#media-location-permission), [MediaStore 원본 요청과 SAF 연결](https://developer.android.com/reference/android/provider/MediaStore).
