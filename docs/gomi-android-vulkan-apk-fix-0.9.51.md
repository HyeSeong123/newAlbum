# 0.9.51 Android GPU APK 빌드 오류 복구

기준: `final` 0.9.50, Android preview APK run `41293958109`, 실패 시각 2026-11-01 09:45 UTC.

## 실측 실패 원인
- `Build installable preview APKs` → Gradle `:app:buildCMakeDebug[arm64-v8a]`에서 실패했다. 이는 설치/사용자 데이터 오류가 아니라 APK 생성 단계 문제다.
- 첫 번째 오류: `ggml-vulkan.cpp:11:10: fatal error: 'vulkan/vulkan.hpp' file not found`. 빌드 호스트의 Vulkan C++ 헤더는 설치됐지만 Android NDK 크로스 컴파일 대상 `ggml-vulkan`에 포함되지 않았다.
- 두 번째 오류: 셰이더 컴파일러가 `Failed to fork process`를 연쇄적으로 출력했다. 고정한 llama.cpp 버전의 `vulkan-shaders-gen.cpp`가 16개 동시 glslc와 다수 `std::async` 미래 객체를 유지했고, 생성 결과 일부가 빠져 `ggml-vulkan-shaders.cpp`에서 undeclared identifier 오류로 이어졌다.
- 이전 `0.9.49` APK CI는 성공했으며 현재 브랜치의 서명 설정, DB/모델 파일은 건드리지 않는다.

## 복구 내용
1. `src-tauri/android/companion/CMakeLists.txt`: `FetchContent_Populate` 후 고정 llama.cpp 소스의 **호스트 셰이더 생성기만** 빌드 시 수정한다(16→2 동시 glslc; 완료된 async future는 4개 단위로 회수). 모델 가중치·LoRA/추론 알고리즘 변경은 없다.
2. 빌드 호스트의 `/usr/include/vulkan`, 선택적 `vk_video` 헤더를 **빌드 폴더로만** 복사하고 Android 대상 `ggml-vulkan`에 이 폴더만 노출한다. Linux 호스트의 전체 `/usr/include`를 Android NDK 크로스 컴파일에 포함하지 않는다.
3. 수백만 줄짜리 생성 셰이더 배열 C++ 소스는 `-O0`로 빌드하고, 해당 라이브러리의 Ninja 컴파일 잡은 1개씩 처리한다. GPU 계산용 Vulkan 엔진의 다른 C++ 소스는 기존 `-O3` 최적화를 유지한다.
4. `tests/companion-native.test.mjs`에 헤더 노출/생성기 동시성 제한 회귀 검사 추가.
5. 버전 `0.9.51`로 증분하여 기존 사용자에게 실패한 APK를 성공본으로 혼동시키지 않는다.

## 검증 계획·한계
- 단위: `tests/companion-native.test.mjs`, `tests/companion-session.test.mjs`의 GPU 조건부 활성화·CPU 대체 테스트.
- 실제 Android CI: ARM64 Vulkan 네이티브 빌드, x86_64 CPU 경로, 기존 서명 인증서/업데이트 가능한 APK, 에뮬레이터 설치.
- 모바일 UI: AI 반응 설정 → 최근 실행 기록 → CPU/GPU 출처 표시와 홈에서 실제 AI 생성 대사만 표시하는 기존 흐름 유지. UI 레이아웃은 변경하지 않음.
- 실제 삼성 8GB 이상 Android 휴대폰에서 Vulkan 드라이버와 고미 v4 LoRA가 정상적으로 실행되는지, CPU와 GPU 응답 속도·발열·메모리 사용량은 **실기기 검증 전까지 미확인**. APK 빌드 성공을 GPU 성능 개선 완료로 표현하지 않는다.

## 사용자 요청/안전
오프라인, 기존 4B 모델·고미 LoRA 유지, 첫 대사 및 실패 시 기본 대사 사용 금지, 기존 사진·일기·앨범·인물/반려동물·친밀도·SQLite·기존 서명키 보존. 실패한 0.9.50을 재사용하거나 재서명하지 않는다.

## 2026-11-01 재검증 및 브라우저 회귀 보완

- Android preview run `41305641409` **성공**: ARM64 Vulkan 네이티브 컴파일, APK 서명, Android 에뮬레이터 설치 검사 통과. Artifact `Gomgomi-Android-0.9.51` 생성 확인.
- Source validation run `41305641451`: 네이티브 저장소 검사 통과. 일부 `tests/characters.spec.ts`는 0.9.49에서 승인한 AI-only 정책보다 오래된 '고정 환영 대사가 먼저 출력됨'이라는 기대값 때문에 실패.
- 사용자의 최신 정책에 따라 **앱 코드를 이전 고정 대사 방식으로 되돌리지 않고**, 캐릭터 테스트를 고쳤다: AI가 아직 생성되지 않으면 `.homeSpeech`는 0개이며 `#homeMessage`는 상태 안내로 표시한다. 사용자의 터치·친밀도 상승, 캐릭터 몸짓, 도움말 친밀도, 도감 설명에 대한 검증은 유지.
- 빌드 성공을 사용자 삼성 휴대폰에서 GPU 성능·LoRA 적용·속도가 검증됐다는 의미로 혼동하지 않는다. 이후 테스트-only 커밋의 CI 결과는 별도로 확인한다.
