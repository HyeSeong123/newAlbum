# 고미 학습 적용 APK 0.9.45 검증

2026-11-01 기준. 별도 재학습 없이 저장한 v4 LoRA를 앱 실행 형식으로 변환·연결했다. **학습 파일 적용·빌드 검증 성공과 대사 품질 합격은 구분한다.** `qualityApproved=false`를 유지한다.

## 설치 파일과 소스

- [서명·설치 검사 성공 CI](https://github.com/HyeSeong123/newAlbum/actions/runs/41253921789)
- [휴대폰용 APK ZIP](https://github.com/HyeSeong123/newAlbum/actions/runs/41253921789/artifacts/13062619888), `Gomgomi-Android-0.9.45` 아티팩트. 2026-12-01 만료 예정.
- 로컬 파일: `release-output/android/Gomgomi-0.9.45.apk`, 395,260,761바이트.
- APK SHA256: `d33e867681bf48b268793d18b1d01c8bd7eccd540d8936fc623903bd1b7e21c6`.
- ZIP 175,457,503바이트, SHA256 `bd48b92e430972fba23b277cef06d412071715eb3eddf2079374e661359daaa9`. GitHub 메타데이터와 실제 다운로드 해시가 일치한다.
- APK 빌드 소스: final의 `cdf50673e9d88a48f1144142eff069bf8bf56b5e`. 이후 커밋은 검증 기록과 비교 테스트 수정이며 앱 코드·학습 가중치는 동일하다.
- versionName `0.9.45`, versionCode `9045`, 휴대폰 ABI `arm64-v8a`. `x86_64` APK도 빌드·서명하고 에뮬레이터에서 검사했다.
- 앱 ID `com.oraedameun.album.next`, 등록 인증서 SHA256 `1e63dd9f0e9ee481875de0cabe4ba479720ceee6c4c0f088cc383a6685f67ba1`. 기존 영구 서명 설정을 사용했다. 개인키 생성·교체·추출은 수행하지 않았다.

## 적용 동작

고미를 선택하고 현재4B AI가 준비된 상태에서 터치·함께하기를 사용하면 v4 LoRA가 적용된다. 작은 학습 파일은 APK에 포함하며 2.5GB 본체는 기존 다운로드·검증 방식을 유지한다. 다른 캐릭터, 구형1.7B, 알 수 없는 모델 해시에는 적용하지 않는다. 손상된 자산을 성공으로 처리하지 않고 오류와 기존 기본 반응으로 복구한다.

GGUF는 F32/288 tensor/alpha16/scale1, 23,612,896바이트다. 정밀도를 보존해 APK에 약24MB를 추가했다. `runtime.json`의 파일 해시가 Java 정책·APK 실제 자산·로컬 다운로드 안에서 일치함을 확인했다. 원본 PEFT, 데이터465/64개와 원문240/120개도 Git에 보관된다. 사진·SQLite·일기·앨범 저장 코드와 앱 ID는 이 변경에서 수정하지 않았다.

## 통과한 검증

- CI 단위 검사242/242, Android 준비·서명 검사15/15, APK 정상/동일길이 변조/절단/NOTICE 손상 검사4/4. 미실행0.
- frontend 타입/빌드, 모바일 고미/다른 캐릭터 전달·취소2/2, 모바일 전체 화면 캡처1/1.
- pinned 엔진·실제 동일4B 본체에서 base→고미→base 세 요청. 고미 적용으로 logits 최대차11.8049, 해제 후 최대차0 및 생성문 완전 일치. [실행 조건과 결과](gomi-v4-runtime-verification.json).
- Android arm64/x86_64 컴파일, 등록 인증서 서명, 패키지/버전/ABI,16KB 정렬, 두 APK의 실제 GGUF 해시/라이선스 검사.
- Android36 x86_64 에뮬레이터 설치·기존 앱 동작 검사 성공. 화면/측정 자료는 위 CI의 Android-screens 아티팩트에 보관된다.
- 월 변경 회귀: 오늘 일기를 저장한 뒤10월 fixture를 찾던 테스트가 PC/모바일에서 실패했다. `전체 일기`를 거쳐 찾도록 수정하고 로컬 PC/모바일2/2를 통과했다. 이전 앱 이름 비교 실패도 캡처 테스트 수정 후 전용 UX CI에서 통과했다.

## 범위와 남은 항목

4B 실제 생성 검사는 WSL CPU에서 수행했고 Android JNI는 실제 빌드로 확인했다. Android 실기기에서4B 생성·속도·메모리와 사용자 설치본 위 업데이트는 미검증이다. 에뮬레이터 검사 성공을 실기기 AI 품질 합격으로 해석하지 않는다. 대사에 어색함·주체 혼동 가능성이 남아 있으므로 테스트 APK로 제공한다.

전체 브라우저 회귀의 월 변경 테스트 실패를 수정했으며, 최종 테스트 변경 후 전체 CI는 다시 실행된다. 위 기능별 검사·APK 검증과 전체 출시 검증을 구분한다. Java fixture의 동일길이 변조·leaf/.part symlink 추가 사례는 추후 보강 항목이다. 현재 구현은 SHA와 canonical 경로를 검사하며 APK 자체 동일길이 변조 검사는 통과했다.
