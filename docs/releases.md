# 버전 관리와 직접 패키징

**Source validation**은 Linux에서 버전·소스·브라우저와 Rust 저장소를 검증합니다. **Windows preview package**는 Windows에서 NSIS 설치 파일과 단독 실행 파일을 만들고, 설치 후 WebView2·네이티브 저장소·재시작을 검증한 다음 미리보기 Release와 Actions 아티팩트에 파일을 게시합니다. 워크플로 파일이 변경되어 브랜치에 푸시될 때 또는 GitHub Actions에서 수동 실행할 때 동작합니다.

## 코드 수정 반영

개발 중에는 `npm run tauri:dev`로 변경 사항을 확인합니다. 다른 PC에 전달할 설치 파일은 사용자가 필요할 때 직접 만듭니다. 설치된 앱에는 소스 변경이 자동 반영되지 않습니다.

```powershell
git switch feature/warm-journal-v2
git pull --ff-only origin feature/warm-journal-v2
npm ci
npm run version:check
npm run package:windows -- --ci -- --locked
```

설치 파일은 `src-tauri/target/release/bundle/nsis/`에 생성됩니다. Node.js 24, Rust stable, Visual Studio Build Tools의 C++ 데스크톱 개발 환경이 필요합니다. 앱을 종료한 뒤 새 설치 파일을 실행해 업데이트합니다. 앱 식별자와 데이터 저장 경로는 유지됩니다. CI 미리보기는 코드 서명이 없는 테스트 빌드이며, `preview-<커밋 SHA>` 태그를 사용합니다.

## 다음 배포 버전 올리기

버그 수정은 `npm run version:patch`, 기능 추가는 `npm run version:minor`, 큰 호환성 변경은 `npm run version:major`를 사용합니다. 이 명령은 `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`의 앱 버전을 함께 수정합니다. 의존 라이브러리 버전은 바꾸지 않습니다.

버전 파일과 코드를 커밋한 뒤 직접 패키징하거나 **Windows preview package** 워크플로를 수동 실행하세요. 버전 명령 자체는 커밋·태그·업로드를 실행하지 않습니다. 미리보기 Release는 검증이 통과한 해당 커밋에 생성됩니다.

현재 버전은 `npm run version:check`로 확인합니다. 배포하지 않는 중간 커밋마다 버전을 올릴 필요는 없습니다.
