import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, MapPin, X } from "lucide-react";
import { checkAndroidLocationSetup, isAndroidRuntime, openAndroidLocationSettings, type AndroidLocationSetup } from "../services/tauriMediaService";
import "./location-setup-ribbon.css";

const CAMERA_KEY = "gamjassak:camera-location-confirmed:v1";
type Feedback = { kind: "info" | "error"; message: string };

export function LocationSetupRibbon() {
  const [android] = useState(isAndroidRuntime);
  const [status, setStatus] = useState<AndroidLocationSetup | null>(null);
  const [checkState, setCheckState] = useState<"checking" | "ready" | "failed">("checking");
  const [cameraChecked, setCameraChecked] = useState(() => {
    try { return localStorage.getItem(CAMERA_KEY) === "true"; }
    catch { return false; }
  });
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [opening, setOpening] = useState<"device" | "app" | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const lastCheck = useRef(0);

  const refresh = useCallback((manual = false) => {
    if (!android) return;
    const request = ++lastCheck.current;
    setCheckState("checking");
    if (manual) setFeedback({ kind: "info", message: "위치 설정을 다시 확인하고 있어요." });
    void checkAndroidLocationSetup().then(value => {
      if (request !== lastCheck.current) return;
      if (!value || typeof value.locationEnabled !== "boolean" || typeof value.photoLocationGranted !== "boolean") {
        throw new Error("위치 설정 결과가 올바르지 않습니다.");
      }
      setStatus(value);
      setCheckState("ready");
      if (manual) {
        const missing = [!value.locationEnabled && "휴대폰 위치 기능", !value.photoLocationGranted && "사진 위치정보 접근"].filter(Boolean);
        setFeedback({ kind: "info", message: missing.length ? `다시 확인했어요. ${missing.join("과(와) ")}을(를) 확인해 주세요.` : "휴대폰 위치 기능과 사진 위치정보 접근을 확인했어요." });
      } else setFeedback(null);
    }).catch(error => {
      if (request !== lastCheck.current) return;
      console.warn("위치 설정 상태 확인 실패:", error);
      setStatus(null);
      setCheckState("failed");
      setExpanded(true);
      setFeedback({ kind: "error", message: "설정 상태를 자동으로 읽지 못했어요. 아래 버튼으로 휴대폰 설정을 열거나 직접 확인해 주세요." });
    });
  }, [android]);

  useEffect(() => {
    if (!android) return;
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setDismissed(false);
        refresh();
      }
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      ++lastCheck.current;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [android, refresh]);

  if (!android || dismissed || (checkState === "checking" && !status && !feedback)) return null;
  if (checkState === "ready" && status?.locationEnabled && status.photoLocationGranted && cameraChecked) return null;

  const deviceOff = status?.locationEnabled === false;
  const photoOff = status?.photoLocationGranted === false;
  const unknown = checkState === "failed" || !status;
  const label = checkState === "failed" ? "위치 설정 상태를 확인하지 못했어요" :
    deviceOff ? "휴대폰 위치 기능이 꺼져 있어요" :
    photoOff ? "사진 위치정보 접근을 확인해 주세요" :
    "카메라 위치 태그를 확인해 주세요";

  async function open(kind: "device" | "app") {
    if (opening) return;
    setOpening(kind);
    setFeedback({ kind: "info", message: "휴대폰 설정 화면을 여는 중이에요." });
    try {
      await openAndroidLocationSettings(kind);
      setFeedback({ kind: "info", message: "설정을 변경한 후 감자싹으로 돌아오면 상태를 다시 확인해요." });
    } catch (error) {
      console.warn("위치 설정 화면 열기 실패:", error);
      setExpanded(true);
      setFeedback({
        kind: "error",
        message: kind === "device" ?
          "위치 설정을 열지 못했어요. 휴대폰 설정 앱에서 '위치'를 직접 열어 주세요." :
          "앱 권한 설정을 열지 못했어요. 휴대폰 설정 → 애플리케이션 → 감자싹 새버전 → 권한에서 직접 확인해 주세요.",
      });
    } finally {
      setOpening(null);
    }
  }

  return <aside className="locationSetupRibbon" aria-label="촬영 위치 설정 알림" data-check-state={checkState}>
    <div className="locationSetupRibbonBar">
      <MapPin size={18} aria-hidden="true" />
      <strong>{label}</strong>
      <button type="button" aria-expanded={expanded} aria-controls="locationSetupDetails" onClick={() => setExpanded(value => !value)}>
        설정 안내 {expanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
      </button>
      <button type="button" className="locationSetupDismiss" aria-label="이번에는 알림 닫기" onClick={() => setDismissed(true)}><X size={18} aria-hidden="true" /></button>
    </div>
    {expanded && <div id="locationSetupDetails" className="locationSetupDetails">
      <p>앞으로 촬영하는 사진에 위치를 기록하려면 휴대폰 위치 기능과 카메라의 위치 태그를 켜주세요. 가져온 사진에 위치가 없다면 지역을 직접 지정할 수도 있어요.</p>
      {(deviceOff || unknown) && <button type="button" disabled={Boolean(opening)} onClick={() => void open("device")}>휴대폰 위치 설정 열기</button>}
      {(photoOff || unknown) && <button type="button" disabled={Boolean(opening)} onClick={() => void open("app")}>감자싹 앱 권한 설정 열기</button>}
      {!cameraChecked && <div className="cameraSetupCheck">
        <p>카메라 앱 → 설정 → 위치 태그(위치 저장)를 켜주세요. 다른 앱의 이 설정은 감자싹이 자동으로 확인할 수 없어요.</p>
        <button type="button" onClick={() => {
          try { localStorage.setItem(CAMERA_KEY, "true"); } catch { /* storage unavailable */ }
          setCameraChecked(true);
        }}>카메라 위치 태그 확인했어요</button>
      </div>}
      <button type="button" disabled={checkState === "checking"} onClick={() => refresh(true)}>
        {checkState === "checking" ? "확인 중..." : "설정 다시 확인"}
      </button>
      {feedback && <p className={`locationSetupFeedback ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</p>}
    </div>}
  </aside>;
}
