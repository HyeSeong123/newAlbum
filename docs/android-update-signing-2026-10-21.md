# 0.9.9 → 0.9.14 Android 업데이트 설치 실패

사용자는0.9.9가 설치된 휴대폰에0.9.14를 업데이트할 때 “앱이 설치되지 않음”을 보고했다. 원본·DB 보존을 위해 기존 앱 삭제/데이터 초기화는 안내하거나 실행하지 않는다.

## 실제 APK 비교

| 항목 | 기존0.9.9 | 제공한0.9.14 |
| --- | --- | --- |
| 출처 run/artifact | 38364197843 / 11796490920 | 39509115142 / 12305880607 |
| package | com.oraedameun.album | com.oraedameun.album |
| versionCode | 9009 | 9014 |
| minSdk / targetSdk | 28 / 36 | 28 / 36 |
| 인증서 SHA-256 | cd5e4bca08caff103273368e2ce11f89a30210332d397fbd6b179e2b844d41e5 | 30f70abc717bee4b829cf50a0d95ccb015a82685b4bac11bb7feb4c7fc275fff |

서명 주체 이름은 둘 다 `CN=Gamjassak Preview,O=Android,C=KR`이지만 실제 인증서는 다르다. 회전 계보 없이 다른 키로 서명한 동일 패키지는 기존 앱 위에 업데이트할 수 없다.0.9.11 APK도 eb17d7cb9d108c51e75d25481d91e01d9ed905a556c7dfcfaf193a52ec898e11로 달랐다.

0.9.14 APK는326,603,251 bytes이고 전체 SHA-256은 e9985e7973c8dac548a8360aaa6ec12dfe61f13530e90645b28eb669e4171d02다. ZIP CRC 오류가 없고 ARM64 native 라이브러리의 모든 LOAD 정렬은16384다. 비압축 so의 ZIP offset15007744도16384 정렬이다. 버전 감소·32비트 APK·명백한16KB 정렬 문제는 이 파일에서 확인되지 않았다. 휴대폰의 실제 INSTALL_FAILED 코드는 수집하지 않았지만, 실제 구버전/제공 파일의 서명 불일치만으로 업데이트를 막는 배포 결함이 성립한다.

## 원인과 수정

과거 워크플로는 브랜치별 접근 범위가 다른 Actions 캐시에서 키를 찾고, 못 찾으면 같은 이름의 새 개인키를 자동 생성했다. 같은 cache key/주체 이름이 같은 서명을 보장하지 않았다. 에뮬레이터 새 설치 성공을 기존 사용자 업데이트 성공으로 확장한 검증이 부족했다.

- 개인키 캐시 복원/저장과 자동 새 키 생성을 현재 배포 워크플로에서 제거했다.
- repository secrets의 원래 키만 임시0600 파일로 주입하며 종료 시 삭제한다. 키·비밀번호를 출력하거나 아티팩트로 게시하지 않는다.
-0.9.9 인증서 고정을 빌드 전에 검사한다. 비밀값 없음·키 불일치는 APK 배포를 중단하는 의도된 차단이다.
- 최종 APK의 실제 인증서·패키지·증가한 versionCode·지원 ABI·16KB ZIP 정렬을 확인한다. 에뮬레이터 설치 검사 이후에만 휴대폰 APK를 게시한다.
- React/Rust 앱 기능·사용자 DB·사진 ID·기존 미디어를 변경하지 않았다. FaceX512·QuadPose·전용 ONNX 삭제 상태와128차원/기본 반려동물 인식을 유지한다.

## 실제 검증과 현재 차단

Android 준비/서명 검사9 PASS, 기존 Node142 PASS, Python22 PASS. YAML 파싱과 diff check PASS. 누락/잘못된 키 차단, 기존 파일 덮어쓰기 방지, 실패 시 임시 키 삭제, 비밀번호 인수/결과 비노출, APK 서명/패키지/버전/ABI 판정을 검증했다.

현재 원래 개인키를 안전하게 확보하지 못했다.0.9.9 키 캐시를 읽어 재서명하려던 워크플로 등록은 자동 승인 검토가 공개 저장소 캐시에 개인 서명키를 복원하는 노출 위험을 이유로 거절했다. 해당 워크플로는 게시/실행하지 않고 폐기했다. 개인키 복구·다운로드·재서명·새 APK 발행·사용자 휴대폰 재설치는 수행하지 않았다. 이 상태에서 업데이트 문제가 해결됐거나 수정 APK가 검증됐다고 표시하지 않는다.

### 사용자 승인 후 실제 캐시 확인

사용자는 원래0.9.9 서명키를 공개하지 않는 일회성 복구·재서명을 명시적으로 승인했다. 이전에 거절된 개인키 복원 워크플로를 재실행하지 않고, 먼저 [별도 PR19](https://github.com/HyeSeong123/newAlbum/pull/19)에서 `lookup-only: true`로 캐시 존재 여부만 확인했다. 체크아웃·키 다운로드·압축 해제·캐시 저장·파일 업로드·새 키 생성은 없다.

[실제 조회39611297201](https://github.com/HyeSeong123/newAlbum/actions/runs/39611297201), job119260546120은 성공적으로 실행됐지만 결과는 `Cache not found for input keys: gamjassak-android-preview-key-v2`였다. 성공은 조회 실행 성공을 뜻하며 키 복구 성공을 뜻하지 않는다. 원래 배포 run38364197843의 브랜치가 `feature/warm-journal-v2`이고, 당시 동일 캐시에서 키를 복원했음을 실제 로그로 대조했다. 조회는 이 브랜치를 대상으로 한 같은 저장소 PR에서 수행했고 경로 `.preview-keys/android-debug.keystore`, cache action SHA `0057852bfaa89a56745cba8c7296529d2fc39830`, Ubuntu24.04도 당시와 같다. 접근 가능한 원래/기본 브랜치 범위에서 캐시가 발견되지 않았다. 만료·삭제 등 정확한 원인은 확인하지 못했으며 모든 별도 백업이 없다고 단정하지 않는다.

현재 차단 원인은 추가 승인 부족이 아니라 **원래 개인키 부재**다. 이번 조회는 자동 검토를 통과했고 키 복원은 시도하지 않았다. APK의 공개 인증서로 개인키를 재생성할 수 없으므로 올바르게 재서명한 APK는 아직 없다. 조회용 PR은 병합하지 않는다.

기존 원래 키가 개발 PC·안전한 백업에 있으면 [Android 설정](android.md)의 secrets로 등록할 수 있다. 키 파일·비밀번호를 채팅·저장소·아티팩트로 보내지 않는다. 별도 키가 없다면 기존 앱을 유지한 상태에서 PC/ADB를 이용한 사용자 데이터 백업·복원 가능성을 먼저 검증해야 하며, 이 작업과 실기기 데이터 보존은 아직 수행·검증하지 않았다. 새 키 생성이나 기존 앱 삭제는 데이터 보존 해법이 아니다.

최신 감사 head6257bae의 Source 검사39603479870/39603486607 및 Windows39603479827은 성공했다. Android39603479677은 원래 키 secret 부재로 배포를 중단했다. 사용자 승인 후 로컬 Android 준비/서명9개 검사를 다시 실행해 모두 통과했다.

공식 근거: [Android 앱 서명](https://developer.android.com/studio/publish/app-signing), [GitHub 캐시 접근 범위](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching#restrictions-for-accessing-a-cache), [Android16KB 검사](https://developer.android.com/guide/practices/page-sizes).
