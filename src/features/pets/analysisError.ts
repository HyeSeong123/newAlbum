/** Only actionable app copy reaches the status UI; native errors may contain paths. */
export function petAnalysisError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/heic|heif/i.test(message)) return '이 HEIC 사진은 현재 읽을 수 없어요. JPG 또는 PNG로 변환한 사진을 다시 가져와 주세요.';
  if (/사진 내용 또는 사진 지문이 변경|사진이 변경되었거나/.test(message)) return '사진이 변경되었어요. 연결을 유지하고 다시 분석해 주세요.';
  if (/비교할 얼굴 영역/.test(message)) return '비교할 얼굴 영역을 지정해 주세요.';
  if (/영역이 너무 작|영역을 조금 더 크게/.test(message)) return '반려동물 영역을 조금 더 크게 지정해 주세요.';
  if (/not found|no such file|존재하지|찾을 수 없/i.test(message)) return '원본 사진을 찾지 못했어요. 사진이 기기에 있는지 확인해 주세요.';
  if (/extension.*not.*recognized|unsupported.*(image|format)|decode|decoding|사진을 읽|이미지.*형식/i.test(message)) return '사진을 읽지 못했어요. JPG 또는 PNG로 변환한 사진을 다시 가져와 주세요.';
  if (/model|모델|가중치/i.test(message)) return '분석에 필요한 파일을 불러오지 못했어요. 앱을 다시 실행한 뒤 시도해 주세요.';
  return '사진을 분석하지 못했어요. 잠시 후 다시 시도해 주세요.';
}
