# 고미4B 추가 학습 저장본 v4

이 폴더는 실제 학습한 **HF/PEFT LoRA 가중치**와 정확한 학습/평가 스냅샷을 Git에 보관한다. 현재 Android 앱이 바로 읽는 GGUF 파일은 아니다. APK 연결은 아직 수행하지 않았다.

- 원본 계열: `Qwen/Qwen3-4B-Instruct-2507`, 학습 NF4 배포본 `unsloth/Qwen3-4B-Instruct-2507-bnb-4bit`.
- NF4 revision: `f12db89cd5156e090618dded9b4367f23f8f3b33`.
- 직전 v3 어댑터 `b398332d5b5fcfb4dd3ec26bc0b54efa28283d96143f1b0a981bae469f406a93`에서 이어 학습했다.
- 기존345개 + 추가120개 = 학습465개, 평가64개. rank8/alpha16, 누적4, 학습률0.0001,1epoch/117update.
- 최종 어댑터: `adapter_model.safetensors`,23,631,240바이트.
- SHA256: `cc84af4fc1370eb9833d54430164f56904c33c841a6498503d5f12bc83683dc7`.
- 저장본 재로딩·독립 평가·288개 tensor 유한값·LoRA B144개 nonzero·데이터/복사 해시 일치를 확인했다.
- `qualityApproved=false`, Android 미적용. 자연스럽지 않은 문장과 상황·주체 혼동이 남아 있다.

`training.json`은 개인 PC 절대 경로를 제외한 실행 기록이다. `data/`는 실제 사용한 동결 데이터이며 이후 앱 이름/프롬프트가 바뀌어도 이 스냅샷은 수정하지 않는다. `evaluation.json`은 동일64개에서 이전/새 모델을 비교한 loss와40개 실제 생성 결과다. 4B 본체와 변경하지 않은 토크나이저는 포함하지 않는다.

`.gitattributes`가 모델 보관본과 원문 입력의 줄바꿈 정규화를 막는다. Windows Git 설정과 무관하게 첨부 원문의 CRLF를 포함한 해시 대상 바이트를 보존한다.

원본 모델 라이선스는 동봉한 Apache2.0 `LICENSE`다. 원본: [Qwen 모델의 고정 버전 LICENSE](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507/blob/cdbee75f17c01a7cc42f958dc650907174af0554/LICENSE). 이 저장본은 프로젝트에서 고미 대사로 추가 학습한 변경 결과이며 원본 Qwen 모델을 그대로 배포하는 파일이 아니다. 라이선스/출처 기록은 `NOTICE`에도 보존한다.
