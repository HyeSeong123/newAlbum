import { useState, type FormEvent } from "react";
import { FolderOpen, Images, LoaderCircle, Plus, X } from "lucide-react";
import { AlbumColorPicker, DEFAULT_ALBUM_COLOR } from "../albums/AlbumCover";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import type { MediaImportOptions } from "./useMediaLibrary";
import { REGION_NAMES } from "../map/regions";
import { KOREAN_DISTRICTS } from "../map/koreanDistricts";
import "./media-import.css";
import { isAndroidRuntime } from "../../services/tauriMediaService";
import { CameraLocationNotice } from "../../components/CameraLocationNotice";
import { CalendarRegistrationFields } from "../calendar/CalendarRegistrationFields";
import { calendarRegistrationError, type CalendarRegistrationOptions } from "../calendar/calendarModel";

export function MediaImportModal({ onClose, onImport }: { onClose: () => void; onImport: (options: MediaImportOptions) => Promise<void> }) {
  const [kind, setKind] = useState<"files" | "folder">("files");
  const [makeAlbum, setMakeAlbum] = useState(false);
  const [title, setTitle] = useState("");
  const [color, setColor] = useState(DEFAULT_ALBUM_COLOR);
  const [regionCode, setRegionCode] = useState("");
  const [district, setDistrict] = useState("");
  const [calendar, setCalendar] = useState<CalendarRegistrationOptions>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useModalBehavior(() => { if (!busy) onClose(); });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || (makeAlbum && !title.trim()) || (calendar && calendarRegistrationError(calendar))) return;
    setBusy(true); setError("");
    try {
      await onImport({ kind, album: makeAlbum ? { title: title.trim(), color } : undefined,
        region: regionCode ? { code: regionCode, district } : undefined, calendar });
      onClose();
    } catch { setError("가져오기를 시작하지 못했습니다. 다시 선택해 주세요."); setBusy(false); }
  }

  return <div className="modalBackdrop">
    <section className="mediaImportDialog" role="dialog" aria-modal="true" aria-labelledby="mediaImportTitle">
      <header className="mediaImportHeader"><div><h2 id="mediaImportTitle">사진·영상 가져오기</h2><p>간직하고 싶은 순간을 기록에 담아보세요.</p></div><button type="button" className="closeButton" aria-label="닫기" disabled={busy} onClick={onClose}><X size={18} /></button></header>
      <form onSubmit={event => void submit(event)}>
        <div className="mediaImportBody">
        <CameraLocationNotice />
        {isAndroidRuntime() && <p className="mediaImportStorageHint">선택한 사진과 영상은 앱에 복사해 보관해요. 원본은 그대로 두며, 선택한 파일 크기만큼 휴대폰 저장 공간을 사용해요. 사진 위치정보 접근을 허용하면 원본에 저장된 촬영 위치를 읽어요.</p>}
        <fieldset disabled={busy} className="mediaImportFields">
          <fieldset className="mediaImportMethods"><legend>가져오기 방식</legend>
            {([{ value: "files", label: "사진·영상 가져오기", description: isAndroidRuntime() ? "갤러리에서 최근 수정 순으로 골라요" : "원하는 파일을 골라 담아요", Icon: Images }, { value: "folder", label: "폴더 가져오기", description: "폴더 안의 기록을 함께 담아요", Icon: FolderOpen }] as const).map(method => <label key={method.value} className={kind === method.value ? "selected" : ""}>
              <input type="radio" name="importMethod" value={method.value} checked={kind === method.value} onChange={() => setKind(method.value)} /><method.Icon size={21} aria-hidden="true" /><span><strong>{method.label}</strong><small>{method.description}</small></span>
            </label>)}
          </fieldset>
          <fieldset className="mediaImportRegion"><legend>촬영 지역 <span>선택 사항</span></legend>
            <p>새로 가져오는 기록에 같은 지역을 지정해요. 선택하지 않으면 사진의 촬영 위치를 사용해요.</p>
            <div className="mediaImportRegionFields">
              <label>시·도<select aria-label="가져올 기록의 시도" value={regionCode} onChange={event => { setRegionCode(event.target.value); setDistrict(""); }}>
                <option value="">시·도 선택 (선택)</option>{Object.entries(REGION_NAMES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select></label>
              <label>시·군·구<select aria-label="가져올 기록의 시군구" value={district} disabled={!regionCode || !KOREAN_DISTRICTS[regionCode]?.length} onChange={event => setDistrict(event.target.value)}>
                <option value="">{!regionCode ? "시·도를 먼저 선택하세요" : KOREAN_DISTRICTS[regionCode]?.length ? "시·군·구 선택 (선택)" : "시·군·구 없음"}</option>
                {(KOREAN_DISTRICTS[regionCode] ?? []).map(name => <option key={name} value={name}>{name}</option>)}
              </select></label>
            </div>
          </fieldset>
          <label className="mediaImportAlbumToggle"><input type="checkbox" checked={makeAlbum} onChange={event => setMakeAlbum(event.target.checked)} /><span><strong>가져오면서 앨범 만들기</strong><small>새로 가져온 사진과 영상을 한 권에 담아요.</small></span></label>
          {makeAlbum && <div className="mediaImportAlbumFields"><label className="albumTitleField">앨범 제목<input required maxLength={80} value={title} placeholder="예: 우리가 함께한 봄" onChange={event => setTitle(event.target.value)} /></label><AlbumColorPicker value={color} onChange={setColor} items={[]} title={title.trim() || "나의 추억"} /></div>}
          <CalendarRegistrationFields value={calendar} onChange={setCalendar} title={makeAlbum ? title : "사진·영상 기록"} />
          {error && <p role="alert">{error}</p>}
        </fieldset>
        </div>
        <footer className="mediaImportActions"><button type="button" disabled={busy} onClick={onClose}>취소</button><button className="primary" type="submit" disabled={busy || (makeAlbum && !title.trim()) || Boolean(calendar && calendarRegistrationError(calendar))}>{busy ? <LoaderCircle className="spinIcon" size={17} /> : <Plus size={17} />}{busy ? "가져오는 중" : kind === "folder" ? "폴더 선택" : isAndroidRuntime() ? "갤러리 열기" : "파일 선택"}</button></footer>
      </form>
    </section>
  </div>;
}
