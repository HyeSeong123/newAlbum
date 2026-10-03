# 감자싹 Android 준비

PC와 Android는 같은 저장·앨범·일기·캐릭터 코드를 사용한다. Android 설정과 네이티브 문서 연결부만 `src-tauri/tauri.android.conf.json`, `src-tauri/android/`, `src-tauri/src/android_media.rs`로 분리했다. 별도 저장소나 웹 프로젝트 복제는 필요 없다.

## 구현 범위

- 모바일 진입점과 Tauri의 앱 내부 화면을 사용한다. Windows 단일 실행 플러그인과 127.0.0.1 고정 서버는 Android에 포함하지 않는다.
- Rust 런타임은 Tauri 2.12.1로 고정한다. [Android Activity 재생성 후 선택기·권한 연결 수정](https://github.com/tauri-apps/tauri/releases/tag/tauri-v2.12.0)을 포함한다. Android 프로젝트 생성은 SDK 36과 Gradle 8.14.3을 제공하는 잠금 파일의 CLI 2.11.4를 유지한다.
- Android 파일 선택기의 content URI를 문서 API로 읽고, 원본을 건드리지 않고 앱의 `imported-media-v1`에 스트리밍 복사한다. 현재 dialog 플러그인은 Android 폴더 선택을 지원하지 않으므로 폴더 가져오기와 내보내기 위치는 연결부의 `ACTION_OPEN_DOCUMENT_TREE`를 사용한다. 하위 폴더를 탐색하며 지원하는 미디어만 보관한다. 기존 보관본은 다시 복사하지 않는다.
- 복사 → 중복 해시·EXIF 분석 → SQLite → 지역·앨범 저장 중 전체 화면 진행 표시를 유지한다. 원본 파일 전체를 JS 메모리에 올리지 않는다.
- 사진 원본 저장과 앨범 내보내기는 사용자가 고른 Android 문서 위치에 복사한다. 일기 첨부도 같은 보관 방식을 사용한다.
- 뒤로가기는 열린 창을 닫고 일반 화면에서는 홈으로 이동한다. 홈에서는 시스템 동작을 따른다. 가져오는 동안에는 작업을 계속 표시한다.
- Android 9/API 28 이상을 첫 대상으로 삼고 SDK 36을 타겟팅한다. 현재 Play 제출 기준은 Android 16/API 36 이상이다.
- 기록은 앱 내부 SQLite에 저장하며 서버 계정·PC 자동 동기화는 없다. 개인 기록을 자동 클라우드 백업에서 제외한다. **앱 삭제·저장소 초기화 때 앱 기록과 보관본은 삭제된다.** 갤러리 원본은 유지된다. 전체 기록 백업·복원 기능은 후속 검토가 필요하다.

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

ARM64 휴대폰용 **debug 서명 APK**가 `src-tauri/gen/android/app/build/outputs/apk`에 생성된다. Play 제출용 서명과 다르다. `Android preview APK` Actions는 ARM64·x86_64 APK를 만들고 에뮬레이터 설치, 실제 폴더 선택·URI 복사·진행률·재실행 후 SQLite 보존을 검사한 뒤 APK와 화면 캡처를 제공한다. 삼성 실기기의 선택기·HEIC/HDR·영상 코덱·메모리 사용도 별도 확인해야 한다.

CI 미리보기는 개발용 키를 별도로 캐시하고 APK를 같은 키로 서명한다. 키 캐시를 삭제하거나 잃으면 기존 테스트 APK에 덮어 설치할 수 없으므로 테스트용 키와 Play 업로드 키를 구분한다. 실제 배포 키는 아래 안내에 따라 사용자가 보관한다.

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
