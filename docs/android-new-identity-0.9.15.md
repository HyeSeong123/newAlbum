# 0.9.15 새 Android 설치·영구 서명 준비

사용자는0.9.9 원래 서명키의 복구 가능성을 확인한 후 새 키로 계속 진행하도록 결정했다. 원래 키를 다시 만들 수 없으므로0.9.9 위에 업데이트한다고 표시하지 않는다.

## 설치와 데이터

| 구분 | 기존 앱 | 새 Android 앱 |
| --- | --- | --- |
| 설치 ID | com.oraedameun.album | com.oraedameun.album.next |
| 표시 이름 | 감자싹 | 감자싹 새버전 |
| 기록 | 기존 앱에 유지 | 빈 상태로 시작 |
| 서명 | 복구하지 못한 기존 키 | 개발 PC에서 생성·보관하고 Secrets에 등록하는 영구 키 |

두 앱은 함께 설치하도록 구성했다. 기존 앱 삭제·데이터 초기화·자동 기록 이동은 수행하지 않는다. Windows ID·사용자 DB·사진·마이그레이션은 변경하지 않았다. FaceX512·QuadPose·전용 ONNX 삭제와128차원/기본 반려동물 기능을 유지한다. Android 갤러리 Kotlin 클래스 패키지는 그대로 보존하고 manifest에서 완전한 클래스 이름을 지정해 새 설치 ID의 상대 경로로 잘못 해석되지 않게 했다. 설치 검사는 실제 Android 설정에서 ID를 읽는다.

## 개발 PC에서 한 번 실행

현재 GitHub 연결 도구는 repository secrets/variables 등록을 지원하지 않는다. 여기의 임시 실행 환경에서 키를 만들면 다시 분실할 수 있으므로 **실제 배포 키는 아직 생성하지 않았다.** 소유자 PC에서 아래 설정을 한 번 실행해야 APK 빌드가 가능하다. Node.js, GitHub CLI(`gh`), JDK17의 `keytool`, 저장소 관리 권한이 필요하다.

저장소의 `feature/gamjassak-audit-refactor` 최신 코드를 받은 뒤 PowerShell에서 실행한다.

```powershell
gh auth login
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-android-signing.ps1
```

`ExecutionPolicy Bypass`는 이 실행 프로세스에만 적용되며 시스템 정책을 변경하지 않는다. 비밀번호를 두 번 숨김 입력한다. 비밀번호를 명령행·채팅에 적지 않는다. 설정 도구는 다음을 수행한다.

1. GitHub의 공개 인증서 등록값을 먼저 읽는다. 등록된 키가 있는데 PC의 키가 없으면 새로 생성하지 않고 중단한다.
2. `%LOCALAPPDATA%\Gamjassak\Signing\gamjassak-android.keystore`를 현재 사용자 전용 폴더에 만든다. 기존 파일이 있으면 재사용한다. 개인키·비밀번호는 Git에 저장하지 않는다.
3. 원래 키 파일을 덮어쓰지 않고 실제 인증서 SHA-256을 확인한다. 로컬/원격 등록값과 다르면 secret을 변경하지 않는다.
4. 키와 비밀번호4개를 `gh secret set`의 표준입력으로 등록한다. 공개 인증서 지문은 repository variable `GAMJASSAK_ANDROID_CERTIFICATE_SHA256`에 마지막으로 등록한다. 비밀값을 화면에 출력하거나 프로세스 인수로 넘기지 않는다.
5. 감사 브랜치의 Android 빌드를 요청한다. 이후 CI도 같은 키와 지문을 요구하며 브랜치별 키 캐시를 사용하지 않는다.

키 파일과 비밀번호를 각각 안전하게 백업한다. `certificate.json`에는 공개 지문과 설치 ID만 있다. 설정을 다시 실행하면 같은 키를 재사용한다. GitHub 등록 중 실패해도 PC에 생성된 키를 지우거나 다른 키로 만들지 말고 원인을 해결한 뒤 다시 실행한다. 실제 키를 채팅·공개 저장소·Actions 아티팩트에 올리지 않는다.

## 검증 범위

로컬: 기존 Node142개/Python22개와 Android 준비·서명·설정11개 검사를 통과했다. 설정 검사는 **폐기하는 시험용 JDK 키**로 실제 생성·반복 재사용·잘못된 비밀번호·원격 지문 불일치·분실한 등록 키 차단을 확인했다. GitHub 쓰기는 가짜 실행기로 검증했으며 실제 키/secret 등록 성공으로 표시하지 않는다.

실제 배포 키 생성·Secrets 등록·서명 APK 생성·Android 동시 설치·실기기 데이터 보존은 설정 완료 전까지 **NOT TESTED / BLOCKED**다. APK가 아직 없으며 과거0.9.14 파일을 새 APK로 제공하지 않는다. PC에서 키 등록 후 Android 빌드·설치 검사 결과를 확인해야 한다.

공식 근거: [Tauri 플랫폼별 설정](https://v2.tauri.app/reference/config/), [GitHub CLI secrets 등록](https://cli.github.com/manual/gh_secret_set), [브랜치를 지정한 빌드 요청](https://cli.github.com/manual/gh_workflow_run).
