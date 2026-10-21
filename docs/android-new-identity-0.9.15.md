# 0.9.15 새 Android 설치·고정 서명 검증

0.9.9 원래 개인키를 복구하지 못해 사용자가 새 키로 계속 진행하도록 결정했다. Android 설치 ID를 분리하고 새 영구 키를 실제 등록했다. 기존 앱 위에 업데이트한다고 표시하지 않는다.

## 설치와 데이터

| 구분 | 기존 앱 | 새 Android 앱 |
| --- | --- | --- |
| 설치 ID | `com.oraedameun.album` | `com.oraedameun.album.next` |
| 표시 이름 | 감자싹 | 감자싹 새버전 |
| 기록 | 기존 앱에 유지 | 빈 상태로 시작 |
| 서명 | 복구하지 못한 기존 키 | Secrets에 등록한 고정 RSA-3072 키 |

두 앱을 함께 설치하도록 구성했다. 기존 앱 삭제·데이터 초기화·자동 기록 이동은 수행하지 않는다. Windows ID·사용자 DB·사진·마이그레이션은 변경하지 않았다. FaceX512·QuadPose·전용 ONNX 삭제와128차원/기본 반려동물 기능을 유지한다. Android 갤러리 Kotlin 클래스 패키지는 보존하고 manifest에 완전한 클래스 이름을 지정해 새 설치 ID에서도 기존 브리지를 연결한다.

## 서명 등록 완료

사용자의 명시적 승인과 직접 수행한 보안 로그인 후 저장소 `HyeSeong123/newAlbum`의 Actions Secrets4개와 공개 인증서 변수1개를 실제 등록했다. 공개 SHA-256은 다음과 같다.

```
1e63dd9f0e9ee481875de0cabe4ba479720ceee6c4c0f088cc383a6685f67ba1
```

- Secrets: `GAMJASSAK_ANDROID_KEYSTORE_BASE64`, `GAMJASSAK_ANDROID_STORE_PASSWORD`, `GAMJASSAK_ANDROID_KEY_PASSWORD`, `GAMJASSAK_ANDROID_KEY_ALIAS`.
- 공개 variable: `GAMJASSAK_ANDROID_CERTIFICATE_SHA256`.
- 같은 지문을 `scripts/android-signing-policy.json`에도 고정했다. 변수가 잘못 바뀌어도 다른 키로 배포하지 않는다.
- CI는 해당 키만 사용하며 자동 키 생성·개인키 캐시를 사용하지 않는다. 키가 없거나 인증서가 다르면 APK 게시 전에 중단한다.
- 개인키·비밀번호를 Git·채팅·로그·아티팩트에 공개하지 않았다. CI 임시 키는0600 권한으로 생성하고 작업 종료 시 제거한다. 임시 평문 전달 파일도 제거했다.

현재 등록을 다시 할 필요는 없다. 향후 키를 분실해도 다른 키를 자동 생성해 교체하지 않는다. `scripts/setup-android-signing.ps1`은 소유자 PC의 명시적 설정을 위한 대안으로 유지한다. 등록된 지문이 있는데 PC 키가 없으면 중단하고, 기존 키가 있으면 재사용한다. 비밀번호는 숨김 입력·표준입력·환경 참조로 전달하고 Windows 폴더 ACL을 현재 사용자로 제한한 뒤 다시 읽어 확인한다. 키와 비밀번호는 별도로 안전하게 보관해야 한다.

## 수정과 회귀 검사

Android 검사 스크립트는 공통 설정에서 설치 ID를 읽는다. 첫 실제 서명 실행에서는 앱 설치·사진 가져오기가 성공했지만 GPS 회귀 검사에 구형 설치 경로가 남아 중단됐다. `isAndroidManagedMediaPath`로 현재 앱의 관리 복사본만 허용하도록 고쳤다. 기존 패키지·외부 원본·DB 폴더·다른 사용자·경로 이탈·쉘 문자를 거부한다. 앱 데이터나 원본을 수정하는 우회가 아니다.

Windows에서는 POSIX 권한 비트·CRLF 가정과 PowerShell 모듈 자동 로드 실패를 수정했다. .NET Framework ACL API를 직접 사용하고 실제 사용자 전용 ACL을 재확인한다. 새 의존성을 추가하지 않았다.

실행 코드 `a42ff166b0f8f4a17e6fc78da27aa71d397bd6d5`의 최종 검증은 다음과 같다. 이후 이 보고서의 변경은 문서만 해당한다.

| 검증 | 결과·방법 |
| --- | --- |
| [Android39686445131](https://github.com/HyeSeong123/newAlbum/actions/runs/39686445131) | **PASS**: API36 x86_64에 실제 설치; 서명·갤러리·GPS·앨범·일기·인식·뒤로가기·복귀·재실행·SQLite/달력 보존 |
| [Source push39686445191](https://github.com/HyeSeong123/newAlbum/actions/runs/39686445191), [PR39686453266](https://github.com/HyeSeong123/newAlbum/actions/runs/39686453266) | **PASS**: Node142, 추가 Android13, Rust115, Python22, 브라우저412 통과/44 건너뜀, TypeScript/Vite 및 배포 자산 검사 |
| [Windows39686445116](https://github.com/HyeSeong123/newAlbum/actions/runs/39686445116) | **PASS**: 전체·업데이트 설치 후 시험 기록 유지, 실제 JDK 키·사용자 ACL 검증, 다운로드 준비 |
| 내려받은 휴대폰 APK | **PASS**: GitHub ZIP 해시 일치, 실제 인증서·RSA v2 서명·보호 콘텐츠 해시 확인, ARM64 단일 ABI, minSdk28/targetSdk36, ELF/ZIP16KB 정렬, 갤러리 Activity 연결, 제외 모델 자산 없음 |

[휴대폰용 APK 아티팩트](https://github.com/HyeSeong123/newAlbum/actions/runs/39686445131/artifacts/12388025326)는 `Gamjassak-0.9.15.apk` 한 개다. 설치 전 압축을 푼다. APK 크기는326,652,462바이트이며 SHA-256은 `f5f1191f9a919cc2e9b1170ef7bb2969a135bd03f64ea687e42d65272e8be1da`다. debug 빌드의 대형 네이티브 라이브러리를 포함한 시험용 파일이며 Play 제출 산출물이 아니다.

[실제 Android 화면·JSON](https://github.com/HyeSeong123/newAlbum/actions/runs/39686445131/artifacts/12387695756)45개 파일을 보관했다. `mobile-photo-favorite.png`, `diary-anchored-menu.png`, `pet-anchored-menu.png`를 직접 열어 빨간 하트와 메뉴 위치를 확인했다. `initial-home.png`는 캐릭터 로딩 중의 초기 캡처이며 완성 화면 증빙으로 쓰지 않는다. 이후 캐릭터 그림·대사와 조작은 설치 검사에서 별도로 확인했다.

GPS 권한 거부·재허용·재가져오기는 같은 ID와 별점·댓글·즐겨찾기를 보존했다. 네이티브 갤러리의 길게 누른 드래그 선택/해제와 일반 스와이프 스크롤, 사진·영상 정렬·선택·취소·권한 거부를 검증했다. Android 기술 정보/전체화면 비노출, 일기 저장 영역·더보기 메뉴, 앨범 편집·화면 경계, 사람/반려동물 등록·수정·수동 연결·재분석을 확인했다. 가져오기나 프로필 저장만으로 추론이 시작되지 않는 검사도 유지했다.

128차원 얼굴 분석과 개·고양이/고양이 얼굴 보조 탐지는 오프라인으로 실행됐다. 사람·반려동물 Worker를100회 번갈아 실행해 텐서 수와 확인된 연결의 보존을 검사했다. 한 개 시험 사진을 반복한 결과이며100개 독립 사진·실기기 최고 메모리·인식 정확도 검사로 해석하지 않는다. 반려동물3회 측정의 CPU 중앙값4576.9ms, WASM326.8ms는 같은 에뮬레이터의 실행 경로 비교다. 이번 서명 수정의 성능 개선 전후 비교나 휴대폰 성능으로 표시하지 않는다. `automaticPoseSupported=false`, `removedPoseOutputsAbsent=true`, `excluded512=true`를 실제 JSON에서 확인했다.

전체 측정값·키 공개 지문·APK 해시·남은 미검증 항목은 [증빙 JSON](android-new-identity-0.9.15-evidence.json)에 기록했다.

로컬 기존 Node142개·Python22개, Android 준비·서명·설정13개 검사가 통과했다. 설정 검사는 폐기하는 JDK 시험 키로 생성·재사용·잘못된 암호·원격 지문 불일치·분실한 등록 키 차단을 검증했다. 이 단위 검사의 GitHub 쓰기는 가짜 실행기이고, 실제 Secrets 등록 성공은 별도의 UI와 CI 검증에 근거한다.

원래 작업 폴더의 빌드는 기존 미등록 임시 모델 파일을 발견해 정상 차단됐다. 해당 파일과 다른 작업자의 파일은 수정·삭제하지 않았다. 커밋된 코드의 별도 worktree에서 승인된 모델 자산만 사용한 `npm run build`와 `npm run ai:release:check`는 통과했다. 자산 검사를 약화하지 않았다.

## PM 평가와 한계

하나의 Android ID 읽기 모듈과 작은 서명 도구로 책임을 분리했다. Kotlin 브리지·Rust 저장소·DB 계약은 보존한다. 실제 유지 기능의 검사를 삭제하지 않았으며, 실패한 경로 검사는 소유 범위 검증을 강화해 수정했다.

새 앱은 빈 상태로 시작한다. 기존 사용자 기록의 완전 이동, 실제 휴대폰의 두 앱 동시 설치, ARM64 코덱·발열·메모리·접근성은 별도 검사가 필요하다. 에뮬레이터 결과를 실기기 결과로 표시하지 않는다. Play 스토어 게시나 모든 모델의 상업적 권리 해결을 승인한 것이 아니다.

최종 판단: 기능 안정성·코드 품질·공통화 적절성·데이터 계약 보존은 시험 범위에서 **PASS**다. 이번 서명 수정은 UI 공통화·CSS·DB 변경을 추가하지 않는다. Android 실기기 사용성과 전체 출시 준비는 **CONDITIONAL PASS**이며, 기존 기록 자동 이전·실제 사용자 DB·전체 접근성·대표 인식 정확도를 검증 완료로 표시하지 않는다. 다음 우선순위는 기존 앱을 유지한 실제 ARM64 설치/재실행 검사와 전체 기록 백업·이전 경로 검토다. 기존 브랜치에 자동 병합하지 않는다.
