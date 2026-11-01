# 감자싹 0.9.50 — Android Vulkan 가속 (고미 4B/LoRA 보존)

## 기준/목표
- 기준 브랜치 `final`, 0.9.49. 2026-11-01 실제 Galaxy 모바일 이전 측정: CPU 4B + 고미 v4 LoRA, 총 12~34초(화면 예시 19.6초), 입력 428토큰 중 251 재사용, 177 새 처리, 입력 처리 17.1초.
- 목표: **준비된 대사를 사용하지 않고 실제 AI가 만든 문장만 홈 말풍선에 표시**한다. CPU-only 4B/LoRA를 유지하면서 ARM64 Vulkan GPU가 있을 때 일부 레이어를 오프로드하고 안전하게 CPU로 복귀한다. 1초 목표 달성을 주장하지 않는다.

## UX 2관점 / 변경 전후
- 기획자: AI 속도를 개선하면서 LoRA 적용과 4B 모델, 기존 다운로드·친밀도·오프라인 정책을 유지한다. GPU 사용 여부가 실제 기기 로그에서 확인돼야 한다. GPU 크래시·메모리 부족에 대비하고 강제로 앱 데이터를 지우거나 모델을 재다운로드하면 안 된다.
- 실제 사용자: Android AI 설정의 기존 **앱의 최근 실행 기록 보기**에서 연산 장치를 알 수 있어야 한다. 터치/함께하기는 이전과 동일하게 AI를 생성하며, GPU가 없어도 추가 설정 없이 CPU로 말한다. 오류나 모델 없음의 기존 메시지는 유지한다.
- 변경 전: GPU 0레이어 고정. 변경 후: ARM64에서 Vulkan 백엔드 포함, Vulkan 장치와 메모리 확인 후 4~8레이어 부분 GPU 처리. Android x86_64 에뮬레이터는 기존 CPU 코드 사용.
- 연산 상태: GPU/Vulkan (최대 요청 레이어 수), CPU(지원 GPU 없음/메모리 보호), CPU(GPU 실패 후 자동 전환)를 현재 모달의 상세 정보에 표시한다. 직접 누르는 추가 토글은 없다.

## 구현 및 위험 대응
1. `src-tauri/android/companion/CMakeLists.txt`: 기존 고정 llama.cpp SHA 유지. Android ARM64일 때만 `GGML_VULKAN=ON`, 외부 빌드 호스트의 `glslc`·Vulkan C++ 헤더 + **Android NDK** `libvulkan` 링크. `GAMJASSAK_ENABLE_VULKAN=OFF`로 긴급 CPU-only 재빌드 가능. x86/데스크톱 및 단위 테스트 빌드는 CPU-only.
2. `gpu_policy.h`: Vulkan 장치 없거나 RAM 여유 1.5GiB 미만이면 CPU-only. 1.5~2GiB이면 최대 4레이어, 2GiB 이상이면 8레이어. 통합 GPU는 CPU와 실제 메모리를 공유하므로 전체 4B를 무조건 GPU에 적재하지 않는다.
3. `companion.cpp`: 실제 Vulkan 장치 등록 확인, 요청한 레이어 수대로 모델 로딩. 동일 GGUF라도 CPU/GPU 오프로드 구성 변경 시 모델/KV/어댑터 재생성. nativeStats에 장치 감지/시도/사용/요청 레이어 수 기록.
4. `GamjassakCompanionPlugin.kt`: Android의 사용 가능한 시스템 메모리 전달. GPU 시도 실패 시 기존 GPU 리소스 해제 후 동일 모델·프롬프트·LoRA로 CPU 재생성을 한 번만 수행. 반복 GPU 실패를 막도록 실행 중 GPU를 다시 시도하지 않음. 취소/메모리 압력 상황에서는 GPU 재시도하지 않음.
5. `CompanionAiSetup.tsx`/상태 타입: 최근 연산 장치를 하단 상세 정보에 표시. 데이터베이스/사용자 사진/일기/앨범·사람/반려동물 데이터·모델 다운로드 SHA·고미 학습 파일·서명 정책 변경 없음.
6. Android APK 워크플로는 ARM64 Vulkan shader 도구를 설치하지만 기존 서명 시크릿은 변경하지 않는다.

## 검증 및 주의점
- C++ 정책 단위: Vulkan 미지원·메모리 부족·강제 CPU, 4/8 GPU 레이어 분기를 검사.
- CMake: 기존 x86_64·데스크톱 CPU-only 컴파일 경로 보존. ARM64 CPU-only 긴급 재빌드 선택 가능.
- 화면: Android 폭 393/320에서 AI 설정 → 실행 기록 보기 → GPU/CPU 자동 대체 표시, 닫기 → 홈 캐릭터 터치 → 실제 AI 생성 대사만 표시하는 Playwright mock 테스트.
- CI: Android ARM64 Vulkan native 컴파일/ABI, 앱 서명, 에뮬레이터 CPU 동작 및 앱 최신 업데이트 가능성을 확인한다.
- **실기기 미검증**: 삼성 기기의 Vulkan 드라이버 및 Qwen3 4B + 고미 v4 LoRA 실제 GPU 출력 정상성, GPU crash/발열/배터리/메모리, 반응 시간 개선폭, 1초 이내 AI 생성 달성은 별도 Galaxy A/B 측정 전까지 합격 처리하지 않는다.
- CPU로 정상 복귀했다고 **GPU가 빠르다는 뜻은 아니다**. GPU / CPU 각각 첫 응답 및 연속 응답 5회 평균·p95, `promptMs`, `firstTokenMs`, `totalMs`, `rssPeakKiB`, `gomiLoraApplied` 검증 후 offload 수치를 튜닝한다.
- 일부 Android Vulkan 드라이버는 네이티브 프로세스 크래시를 낼 수 있다. 그 경우 예외 기반 CPU 복귀가 불가능하므로 실기기 출시 전 검증이 필수다.
