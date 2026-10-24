export function entityCounter(unit: string): string {
  return unit === '사진' ? '장' : unit === '인물' ? '명' : unit === '반려동물' ? '마리' : '개';
}
