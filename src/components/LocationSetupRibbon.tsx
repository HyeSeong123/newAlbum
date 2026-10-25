import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, MapPin, X } from "lucide-react";
import { checkAndroidLocationSetup, isAndroidRuntime, openAndroidLocationSettings, type AndroidLocationSetup } from "../services/tauriMediaService";
import "./location-setup-ribbon.css";

const CAMERA_KEY = "gamjassak:camera-location-confirmed:v1";
export function LocationSetupRibbon() {
  const [android] = useState(isAndroidRuntime);
  const [status, setStatus] = useState<AndroidLocationSetup | null>(null);
  const [failed, setFailed] = useState(false);
  const [cameraChecked, setCameraChecked] = useState(() => { try { return localStorage.getItem(CAMERA_KEY) === "true"; } catch { return false; } });
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const refresh = useCallback(() => {
    if (!android) return;
    void checkAndroidLocationSetup().then(value => { setStatus(value); setFailed(false); }).catch(() => { setFailed(true); setStatus(null); });
  }, [android]);
  useEffect(() => {
    if (!android) return;
    refresh();
    const onVisible = () => { if (document.visibilityState === "visible") { setDismissed(false); refresh(); } };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", onVisible); };
  }, [android, refresh]);
  if (!android || dismissed || (!failed && status?.locationEnabled && status.photoLocationGranted && cameraChecked)) return null;
  const deviceOff = status?.locationEnabled === false;
  const photoOff = status?.photoLocationGranted === false;
  const unknown = failed || !status;
  const label = deviceOff ? "휴대폰 위치 기능이 꺼져 있어요" : photoOff ? "사진 위치정보 접근을 확인해 주세요" : unknown ? "촬영 위치 설정을 확인해 주세요" : "카메라 위치 태그를 확인해 주세요";
  async function open(kind: "device" | "app") {
    try { await openAndroidLocationSettings(kind); }
    catch { setFailed(true); setExpanded(true); }
  }
  return <aside className="locationSetupRibbon" aria-label="촬영 위치 설정 알림">
    <div className="locationSetupRibbonBar">
      <MapPin size={18} aria-hidden="true" />
      <strong>{label}</strong>
      <button type="button" aria-expanded={expanded} aria-controls="locationSetupDetails" onClick={() => setExpanded(v => !v)}>
        설정 안내 {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      <button type="button" className="locationSetupDismiss" aria-label="이번에는 알림 닫기" onClick={() => setDismissed(true)}><X size={18}/></button>
    </div>
    {expanded && <div id="locationSetupDetails" className="locationSetupDetails">
      <p>촬영한 사진에 지역을 남기려면 휴대폰 위치 기능과 카메라의 위치 태그를 켜주세요. 사진을 가져올 때 위치가 없으면 지역을 직접 지정할 수도 있어요.</p>
      {(deviceOff || unknown) && <button type="button" onClick={() => void open("device")}>휴대폰 위치 설정 열기</button>}
      {(photoOff || unknown) && <button type="button" onClick={() => void open("app")}>감자싹 앱 권한 설정 열기</button>}
      {!cameraChecked && <div className="cameraSetupCheck"><p>카메라 앱 → 설정 → 위치 태그(위치 저장)를 켜주세요. 다른 앱의 이 설정은 감자싹이 자동으로 확인할 수 없어요.</p><button type="button" onClick={() => { try { localStorage.setItem(CAMERA_KEY, "true"); } catch { /* storage unavailable */ } setCameraChecked(true); }}>카메라 위치 태그 확인했어요</button></div>}
      <button type="button" onClick={refresh}>설정 다시 확인</button>
    </div>}
  </aside>;
}
