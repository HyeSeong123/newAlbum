import { useState } from "react";
import { REGION_NAMES } from "./regions";
import type { MediaItem } from "../../types/media";
import { locationStatusText } from "./locationStatus";
import "./region-editor.css";

export function RegionEditor({ current, district: initialDistrict = "", country: initialCountry = "", city: initialCity = "", source, status, count = 1, initiallyEditing = false, onSave }: {
  current?: string; district?: string; country?: string; city?: string; source?: string; count?: number; initiallyEditing?: boolean;
  status?: MediaItem["locationStatus"];
  onSave: (code: string, district?: string, country?: string, city?: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(initiallyEditing);
  const [overseas, setOverseas] = useState(current === "overseas");
  const [code, setCode] = useState(current === "KR-29" ? "KR-46" : current ?? "");
  const [district, setDistrict] = useState(initialDistrict);
  const [country, setCountry] = useState(initialCountry);
  const [city, setCity] = useState(initialCity);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function save() {
    if (busy || !count || (overseas ? !country.trim() || !city.trim() : !code)) return;
    setBusy(true); setError(""); setNotice("");
    try { await onSave(overseas ? "overseas" : code, overseas ? "" : district.trim(), overseas ? country.trim() : "", overseas ? city.trim() : ""); setEditing(false); setNotice("지역을 변경했습니다."); }
    catch { setError("지역을 저장하지 못했습니다. 선택한 지역은 화면에 남아 있습니다. 다시 저장해 주세요."); }
    finally { setBusy(false); }
  }
  const place = current === "overseas" ? [initialCountry, initialCity].filter(Boolean).join(" · ") : [REGION_NAMES[current ?? ""], initialDistrict].filter(Boolean).join(" · ");
  return <section className="regionEditor" aria-label="위치">
    {!editing ? <><span>{count > 1 ? `선택한 ${count}개 기록` : place || "지역 미분류"}{source === "manual" && <small>직접 지정</small>}</span>
      <button disabled={!count} onClick={() => setEditing(true)}>{current ? "지역 변경" : "지역 지정"}</button></> : <>
      <label className="overseasCheck"><input type="checkbox" checked={overseas} disabled={busy} onChange={event => setOverseas(event.target.checked)} /> 해외 지역</label>
      {overseas ? <>
        <label>나라<input aria-label="나라" maxLength={80} placeholder="예: 일본" value={country} disabled={busy} onChange={event => setCountry(event.target.value)} /></label>
        <label>도시<input aria-label="도시" maxLength={80} placeholder="예: 교토" value={city} disabled={busy} onChange={event => setCity(event.target.value)} /></label>
      </> : <>
        <label>{count > 1 ? `선택한 ${count}개의 시·도` : "시·도"}<select aria-label="지정할 지역" disabled={busy} value={code} onChange={event => { setCode(event.target.value); setDistrict(""); }}>
          <option value="">지역을 선택해 주세요</option>{Object.entries(REGION_NAMES).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
        </select></label>
        <label>시·군·구<input aria-label="시군구" maxLength={60} placeholder="예: 서구, 담양군 (선택)" value={district} disabled={busy} onChange={event => setDistrict(event.target.value)} /></label>
      </>}
      <button disabled={busy || !count || (overseas ? !country.trim() || !city.trim() : !code)} onClick={() => void save()}>{busy ? "저장 중" : "지역 저장"}</button>
      <button disabled={busy} onClick={() => setEditing(false)}>취소</button>
    </>}
    {!current && locationStatusText(status) && <p className="regionLocationStatus" data-location-status={status}>{locationStatusText(status)}{status === "failed" ? " · 원본 사진은 유지됩니다. 추억 지도에서 다시 분석할 수 있습니다." : status === "no-gps" ? " · 촬영 위치가 저장되지 않은 사진입니다. 직접 지역을 지정할 수 있습니다." : ""}</p>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </section>;
}
