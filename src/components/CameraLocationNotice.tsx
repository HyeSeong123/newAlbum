import { MapPin } from "lucide-react";
import "./camera-location-notice.css";

export function CameraLocationNotice() {
  if (!/Android|iPhone|iPad/i.test(navigator.userAgent)) return null;
  return <aside className="cameraLocationNotice" aria-label="촬영 위치 자동 등록 안내">
    <MapPin size={19} aria-hidden="true" />
    <div><strong>촬영 위치 자동 등록을 위한 카메라 설정</strong>
      <p>사진·영상의 촬영 위치를 자동으로 등록하려면 휴대폰 카메라 앱의 <b>위치 권한</b>을 허용하고, 카메라 설정에서 <b>위치 태그(위치 저장)</b>를 켜주세요.</p>
      <small>이미 촬영한 파일에 위치 정보가 없으면 자동 등록할 수 없어요. 가져올 때 시·도와 시·군·구를 직접 선택할 수 있어요.</small>
    </div>
  </aside>;
}
