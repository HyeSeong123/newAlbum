# 버전 관리와 자동 패키징

**Source validation**은 Linux에서 버전·소스·브라우저와 Rust 저장소를 검증합니다. **Windows preview package**는 Windows에서 NSIS 설치 파일과 기존 사용자용 업데이트 파일을 만들고, 설치 후 WebView2·네이티브 저장소·재시작 및 단독 실행을 검증한 다음 Actions 아티팩트에 파일을 업로드합니다. `feature/warm-journal-v2`와 `master`에 푸시하면 소스 검사와 Windows 설치파일·업데이트 파일 생성을 모두 실행합니다. 연속 푸시는 이전 패키징을 취소하고 최신 커밋을 빌드합니다. 아티팩트는 90일간 보관됩니다.

## 코드 수정 반영

개발 중에는 `npm run tauri:dev`로 변경 사항을 확인합니다. 다른 PC에 전달할 설치파일과 업데이트 파일은 소스 업로드마다 자동으로 다시 만듭니다. 설치된 앱에는 소스 변경이 자동 반영되지 않습니다.

```powershell
git switch feature/warm-journal-v2
git pull --ff-only origin feature/warm-journal-v2
npm ci
npm run version:patch
git add .
git commit -m "Apply app changes"
git push origin feature/warm-journal-v2
```

처음 설치용 파일은 `src-tauri/target/release/bundle/nsis/`에 생성됩니다. 기존 사용자용 업데이트 파일은 같은 명령에 `--config src-tauri/tauri.update.conf.json`을 추가하면 WebView2 오프라인 설치 파일을 제외하고 생성됩니다. Node.js 24, Rust stable, Visual Studio Build Tools의 C++ 데스크톱 개발 환경이 필요합니다. 앱을 종료한 뒤 새 설치 파일을 실행해 업데이트합니다. 앱 식별자와 데이터 저장 경로는 유지됩니다. CI 미리보기는 코드 서명이 없는 테스트 빌드입니다.

## 다음 배포 버전 올리기

버그 수정은 `npm run version:patch`, 기능 추가는 `npm run version:minor`, 큰 호환성 변경은 `npm run version:major`를 사용합니다. 이 명령은 `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`의 앱 버전을 함께 수정합니다. 의존 라이브러리 버전은 바꾸지 않습니다.

버전 파일과 코드를 커밋한 뒤 작업 브랜치에 푸시하세요. **Windows preview package**가 두 파일을 자동 생성합니다. 필요하면 수동 재실행도 가능합니다. 버전 명령 자체는 커밋·태그·업로드를 실행하지 않습니다. 검증된 설치 파일과 실행 파일은 해당 워크플로 실행의 아티팩트에서 받습니다.

현재 버전은 `npm run version:check`로 확인합니다. 수정 내용을 배포할 때는 이전에 제공한 설치파일과 구분할 수 있도록 버전을 올립니다. 파일 이름은 `Gamjassak_<버전>_x64-setup.exe`와 `Gamjassak_<버전>_x64-update.exe`입니다.

검증에는 최근 보관된 이전 버전 설치파일을 자동 선택합니다. 보관된 이전 버전이 없으면 현재 설치파일로 데이터를 만든 뒤 덮어 설치와 재실행을 검사합니다. 사용자 DB와 WebView 저장소는 기존 앱 식별자와 주소를 유지합니다. 업데이트 파일은 수동으로 실행하는 덮어 설치 프로그램이며 앱 내부 자동 업데이트 서비스는 아닙니다.
