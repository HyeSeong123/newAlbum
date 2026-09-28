import type { MediaItem } from "../../types/media";

export function locationStatusText(status: MediaItem["locationStatus"]): string {
  switch (status) {
    case "no-gps": return "GPS 정보 없음";
    case "failed": return "위치 정보 읽기 실패";
    case "queued": return "위치 분석 대기";
    case "outside-korea": return "국내 지도 영역 밖";
    default: return "";
  }
}
