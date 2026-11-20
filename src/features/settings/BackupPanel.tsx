import { useEffect, useRef, useState } from "react";
import { backupCommand, readRecords, type BackupCounts, type BackupPreview } from "./backupStorage";

const labels: [keyof BackupCounts, string][] = [["media","사진·영상·음원"],["albums","앨범"],["diaries","일기"],["characters","캐릭터"]];
export function BackupPanel() {
  const [preview,setPreview] = useState<BackupPreview | null>(null);
  const [message,setMessage] = useState("");
  const [busy,setBusy] = useState(false);
  const locked = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (preview) dialog.current?.showModal(); }, [preview]);
  async function run(action: "export" | "preview" | "confirm" | "cancel") {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      if (action === "export") {
        setMessage("폴더를 선택하면 새 파일에 백업합니다.");
        const done = await backupCommand<boolean | null>("export",{storage:readRecords(localStorage)});
        setMessage(done ? "선택한 폴더에 백업 파일을 저장했어요." : "백업을 취소했어요.");
      } else if (action === "preview") {
        setMessage("백업 파일을 선택해 주세요. 파일이 크면 검사에 시간이 걸려요.");
        const result = await backupCommand<BackupPreview | null>("preview");
        setPreview(result);
        setMessage(result ? "" : "파일 선택을 취소했어요.");
      } else if (action === "confirm" && preview) {
        setMessage("앱을 다시 열면 복원을 마칩니다.");
        await backupCommand("confirm",{token:preview.token});
        return;
      } else {
        await backupCommand("cancel");
        setMessage("복원을 취소했어요. 현재 기록을 유지합니다.");
        setPreview(null);
      }
    } catch (e) {
      setMessage(String(e));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return <section className="settingsAppInfo backupPanel" aria-label="기록 백업과 복원">
    <h2>기록 백업과 복원</h2>
    <p>앱에 보관한 사진·영상, 앨범, 일기, 인물·반려동물 정보와 캐릭터 기록을 한 파일에 담아요. 개인 기록이 담긴 파일은 안전한 폴더에 보관해 주세요.</p>
    <button disabled={busy} onClick={()=>void run("export")}>백업 파일 만들기</button>
    <button disabled={busy} onClick={()=>void run("preview")}>백업에서 복원</button>
    {!preview && <p role="status">{message}</p>}
    {preview && <dialog ref={dialog} aria-labelledby="restore-heading" onCancel={e=>{e.preventDefault(); void run("cancel");}}>
      <h2 id="restore-heading">백업으로 기록을 바꿀까요?</h2>
      <table><thead><tr><th>기록</th><th>현재</th><th>복원 후</th></tr></thead>
      <tbody>{labels.map(([key,label])=><tr key={key}><th>{label}</th><td>{preview.current[key]}</td><td>{preview.restored[key]}</td></tr>)}</tbody></table>
      <p>백업 이후에 추가한 기록도 교체됩니다. 갤러리 원본은 유지됩니다. 앱을 다시 열면 복원을 마칩니다.</p>
      <button autoFocus disabled={busy} onClick={()=>void run("cancel")}>현재 기록 유지</button>
      <button disabled={busy} onClick={()=>void run("confirm")}>앱 닫고 복원</button>
      <p role="status">{message}</p>
    </dialog>}
  </section>;
}
