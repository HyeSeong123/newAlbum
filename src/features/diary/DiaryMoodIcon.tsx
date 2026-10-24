/** Small expression drawings follow the existing outlined control icons. */
export function DiaryMoodIcon({ value, size = 18 }: { value: string; size?: number }) {
  return <svg className="diaryMoodIcon" data-mood={value} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    {value === '사랑함' ? <>
      <path d="M5.8 8.7C5.8 6.8 8 6.5 8.5 8c.5-1.5 2.7-1.2 2.7.7 0 1.5-2.7 3.1-2.7 3.1S5.8 10.2 5.8 8.7ZM12.8 8.7C12.8 6.8 15 6.5 15.5 8c.5-1.5 2.7-1.2 2.7.7 0 1.5-2.7 3.1-2.7 3.1s-2.7-1.6-2.7-3.1Z" fill="currentColor" strokeWidth=".6" />
      <path d="M8 15q4 4 8 0" />
    </> : value === '배고픔' ? <>
      <path d="M7 9q1.5-2 3 0M14 9q1.5-2 3 0M7 14q5 5 10 0M12 16v2a2 2 0 0 0 4 0v-3" />
    </> : value === '보고싶음' ? <>
      <path d="m7 7 3 1m4 0 3-1M8 10v1m8-1v1M9 16q3-2 6 0M17.5 12.5s-1.5 2-1.5 2.8a1.5 1.5 0 0 0 3 0c0-.8-1.5-2.8-1.5-2.8Z" />
    </> : value === '슬픔' ? <>
      <path d="m7 8 3-1m4 0 3 1M8 10v1m8-1v1M8 17q4-5 8 0" />
    </> : value === '그리움' ? <>
      <path d="M7 8h3m4 0h3M9 10v1m8-1v1M10 16h4" />
    </> : value === '설렘' ? <>
      <path d="m7 8 3 2-3 2m10-4-3 2 3 2M8 15q4 5 8 0" />
    </> : value === '기쁨' ? <>
      <path d="M7 9q1.5-2 3 0m4 0q1.5-2 3 0M7 14h10q-5 7-10 0Z" />
    </> : <path d="M7 10q1.5 2 3 0m4 0q1.5 2 3 0M9 15q3 2 6 0" />}
  </svg>;
}
