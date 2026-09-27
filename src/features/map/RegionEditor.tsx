import { useState } from "react";
import { REGION_NAMES } from "./regions";
import "./region-editor.css";

export function RegionEditor({ current, source, count = 1, onSave }: {
  current?: string; source?: string; count?: number; onSave: (code: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (!code || busy) return;
    setBusy(true); setError("");
    try { await onSave(code); setEditing(false); }
    catch { setError("지역을 저장하지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  return <section className="regionEditor" aria-label="위치">
    {!editing ? <><span>{count > 1 ? `선택한 ${count}개 기록` : current ? REGION_NAMES[current] : "지역 미분류"}
      {source === "manual" && <small>직접 지정</small>}</span>
      <button disabled={!count} onClick={() => { setCode(current ?? ""); setEditing(true); }}>{current ? "지역 변경" : "지역 지정"}</button></> : <>
      <label>{count > 1 ? `선택한 ${count}개의 지역` : "지역"}<select aria-label="지정할 지역" disabled={busy} value={code} onChange={event => setCode(event.target.value)}>
        <option value="">지역을 선택해 주세요</option>{Object.entries(REGION_NAMES).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
      </select></label>
      <button disabled={busy || !code} onClick={() => void save()}>{busy ? "저장 중" : "지역 저장"}</button>
      <button disabled={busy} onClick={() => setEditing(false)}>취소</button>
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
