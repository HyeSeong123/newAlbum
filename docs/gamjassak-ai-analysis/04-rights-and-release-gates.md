# 04. 권리·상업 출시·빌드 안전성 감사

현재 모델 권리 보고서: [2026-10-14 감사](../commercial-ai-model-rights-audit-2026-10-14.md).

## 기존 모델의 상태

| 모델 | 코드/가중치의 표면상 허가 | 남은 권리 문제 |
|---|---|---|
| FaceAPI SSD | 패키지 MIT, 관련 모델 Apache 계보 | WIDER FACE 사진의 CC BY-NC-ND, 학습/배포 영향 검토 |
| FaceAPI 68 랜드마크 | face-api MIT 코드 | 학습 얼굴 사진 권리 출처 부족 |
| FaceAPI 128 | dlib/FaceAPI 가중치 계보 | 파생 가중치 동일성 및 원본 학습 자료 권리 |
| FaceX Tiny512 | Apache-2.0 고지 | MS1M-RefineV2 / MS-Celeb-1M 학습 이미지 권리 불확실 |
| QuadPose f2 | Apache-2.0 고지 | AP-10K 제3자 사진, non-commercial 문서 불일치, ViTPose/ImageNet 계보 |
| Pet SSDLite/ MobileNet | Apache-2.0 고지 | COCO/ILSVRC 이미지 권리 및 특정 가중치 계보 |
| Cat Cascade | BSD 유형 고지 | 원저작권 고지와 바이너리 포함 재확인 |

이 문제들이 곧바로 '불법 사용 확인'을 뜻하지는 않는다. 다만 감자싹 **완전 자체 가중치**라는 목표를 만족하지 않는다.

## 출시 차단 결함

- `scripts/recognition-models.lock.json`: `commercialClearanceConfirmed=false`.
- `scripts/verify-recognition-models.mjs`: `--commercial`을 명시해야 false에서 오류가 난다.
- `package.json` 기본 `prebuild`: `verify-recognition-models.mjs`만 호출한다. 상업용 차단 플래그 누락.
- FaceAPI/Pet 모델·Cat Cascade의 개별 증빙까지 일괄 검증하는 포괄적 릴리스 게이트가 없다.
- 원본 빌드 산출물 APK/AAB를 재압축 풀어서 모델 해시·원격 다운로드 불포함·고지 여부를 독립 검사하지 않았다.

## 자체 모델에 필요한 출시 요건

1. `model-provenance.json`: 모델별 owner, architecture hash, random initialization/seed, training script commit, dataset manifest digest, weights SHA256, license, 검증 보고서.
2. `training-data-manifest.json`: 사진별 권리·동의·사용범위·출처·주석·생성물/파생 사진 계보·보존 정책. **허가가 불명확한 인터넷 이미지 크롤링 금지.**
3. 모델/데이터 검증 실패 시 Android 릴리스 빌드 및 배포 파이프라인을 **fail closed**.
4. 배포 자산 허용 목록 및 실제 APK/AAB ZIP 안의 모델 파일·외부 URL·가중치 차단 검증.
5. 상업적 동작은 전화기 내부 오프라인; 사진이나 얼굴 특징 벡터를 외부 AI 서비스로 전송하지 않음.
6. 얼굴 특징·사진과 관련된 생체정보/개인정보 수집, 처리, 보존, 동의 철회·삭제 정책을 별도 검토. DB `secure_delete`만으로 저장 자료 암호화/백업 삭제가 되지 않음.
7. 소프트웨어 저작권과 별개로 특허·상표·오픈소스 런타임 고지·모델 구조 라이선스를 검토한다.
8. 외부 인식 라이브러리 코드가 최종 런타임에 포함되지 않도록 의존성 및 실제 번들을 검사한다. 일반적인 수학/영상 처리·추론 라이브러리까지 금지하는 경우 별도 구현/검증 비용을 명시한다.

## 현 단계 결론

현재는 신규 코드와 모델 학습·변경을 진행한 상태가 아니다. 라이선스 위험 0%를 보증할 수 없다. 권리 자료와 실제 상업 배포 APK 검사 없이는 상업 릴리스 적합 판정을 내리지 않는다.
