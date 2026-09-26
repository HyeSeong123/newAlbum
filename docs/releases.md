# 버전별 설치 파일과 업데이트 배포

현재 앱은 React + Tauri 2 + SQLite이며 Windows NSIS 설치 프로그램으로 배포합니다. 이번 사진 제목 기능의 버전은 **0.2.0**입니다. 앱 식별자 `com.oraedameun.album`과 데이터 저장 경로는 유지합니다.

## 자동으로 처리하는 일

| 작업 | 결과 |
| --- | --- |
| 앱 변경을 `feature/warm-journal-v2` 또는 `master`에 push | 테스트·Windows 빌드·설치 후 재시작 검사, Actions artifact에 30일 보관 |
| 해당 브랜치로 PR 생성·갱신 | 같은 검증과 검토용 설치 파일 생성 |
| `v0.2.0` 같은 버전 태그 push | 태그와 앱 버전 일치 검사 후 빌드, GitHub Releases **초안**에 설치 파일 첨부 |
| 초안을 확인하고 Publish release 클릭 | 해당 버전을 배포용 릴리스로 공개 |

Artifact 이름에는 앱 버전·실행 번호·재실행 번호가 들어갑니다. 함께 제공하는 `build-info.json`에는 버전, 정확한 커밋, ref, 빌드 URL을 기록합니다. 릴리스 첨부 파일에는 Actions artifact의 30일 만료 정책이 적용되지 않습니다. 저장소나 릴리스를 삭제하면 파일도 사라집니다.

## 이번 0.2.0 배포

변경 PR을 검토하고 `feature/warm-journal-v2`에 병합한 뒤 실행합니다. **이미 0.2.0으로 올렸으므로 이번에는 버전을 다시 올리지 않습니다.**

```powershell
git switch feature/warm-journal-v2
git pull --ff-only origin feature/warm-journal-v2
npm run version:check
git tag v0.2.0
git push origin v0.2.0
```

Actions의 **Windows installer**가 성공하면 Releases에 **오래담은 0.2.0** 초안이 생깁니다. 설치 파일을 확인하고 변경 설명을 작성한 뒤 Publish release를 누릅니다. 이번 코드 변경 작업에서는 배포 태그 생성과 릴리스 게시는 실행하지 않습니다.

초안은 저장소 쓰기 권한이 있는 사람이 확인할 수 있습니다. 일반 사용자에게는 게시된 릴리스 링크 또는 설치 파일을 전달하세요. 비공개 저장소의 릴리스 링크는 저장소 접근 권한이 없는 사람에게 공개되지 않습니다.

## 다음 버전부터

다음 중 변경 규모에 맞는 명령 하나를 실행합니다.

```powershell
# 버그 수정: 0.2.0 → 0.2.1
npm run version:patch

# 기능 추가 때는 대신: npm run version:minor  (0.2.0 → 0.3.0)
# 큰 호환성 변경 때는 대신: npm run version:major  (0.2.0 → 1.0.0)
```

앱 버전이 들어 있는 `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`을 함께 변경합니다. 의존 라이브러리 버전은 바꾸지 않으며 커밋·태그·push는 자동 실행하지 않습니다. 다섯 파일의 버전이 서로 다르면 중단합니다.

코드 변경과 버전 파일을 검토·커밋·push한 뒤 그 커밋에 태그를 붙입니다. 아래는 변경 코드가 이미 커밋된 경우입니다.

```powershell
git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: prepare next release"
git push origin feature/warm-journal-v2
$version = node scripts/version.mjs --check
git tag "v$version"
git push origin "v$version"
```

배포할 때마다 버전을 올립니다. 작업 중 모든 커밋에 새 배포 번호를 붙일 필요는 없습니다. 중간 빌드는 실행 번호와 커밋으로 구분됩니다. 같은 태그의 실패한 실행은 재실행할 수 있으며 초안의 첨부 파일은 갱신합니다. 이미 게시된 릴리스는 덮어쓰지 않습니다. 게시 후 수정은 새 버전으로 배포합니다.

## 받는 사람이 업데이트하는 방법

1. 오래담은을 종료합니다.
2. 새 `오래담은_버전_x64-setup.exe`를 실행합니다.
3. 기존과 같은 Windows 사용자로 설치한 후 앱을 실행합니다.

등록 목록·앨범·제목은 기존 사용자 데이터 폴더의 SQLite에서 읽습니다. 이번 변경은 media 테이블에 빈 제목 컬럼을 추가하는 비파괴 마이그레이션을 사용하며 원본 파일명은 변경하지 않습니다. 제목이 없는 사진은 책장에서 날짜만 표시합니다. 기존 댓글은 사진 상세의 댓글 영역에 남습니다. 사진 목록에서는 제목이 없으면 파일명을 표시합니다.

업데이트 전 백업에는 앱을 종료한 상태의 DB, WebView 저장소, 원본 파일을 포함하세요. 앞으로 DB 구조가 달라지면 예전 설치 파일을 다시 설치하는 것만으로 데이터 호환성이 보장되지는 않습니다.

## 앱 안에서 자동 업데이트까지 하려면

현재 구성은 **설치 파일 자동 제작·버전별 보관**입니다. 사용자 PC에서 새 버전을 찾아 설치하는 기능은 아직 연결하지 않았습니다. Tauri updater로 업데이트 확인 → 다운로드 → 설치 → 재시작을 제공하려면 다음 설정이 필요합니다.

- updater 플러그인과 업데이트 확인 UI, 필요한 capability
- 업데이트 서명용 개인키·공개키 생성과 개인키의 안전한 보관
- GitHub Actions Secrets에 `TAURI_SIGNING_PRIVATE_KEY`, 필요한 경우 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 등록
- 앱 설정에 공개키·업데이트 엔드포인트 설정 및 `createUpdaterArtifacts` 활성화
- 서명된 설치 파일·서명 파일·`latest.json`을 사용자 PC가 접근할 수 있는 위치에 게시

업데이트 서명키와 Windows 게시자 코드 서명 인증서는 별개입니다. 설치 파일은 현재 코드 서명이 없는 개발 배포판입니다. 비공개 저장소를 유지한다면 공개 업데이트 전용 저장소나 다운로드 서버를 사용할 수 있습니다. 개인 GitHub 토큰을 앱에 포함해서는 안 됩니다.

공식 문서:
- https://v2.tauri.app/distribute/pipelines/github/
- https://v2.tauri.app/plugin/updater/
- https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository
