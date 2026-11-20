import { useEffect, useState, type ReactNode } from "react";
import { backupCommand, readRecords, replaceRecords, type Recovery } from "./backupStorage";

export function BackupStartup({children}: {children: ReactNode}) {
  const [ready,setReady] = useState(false);
  const [message,setMessage] = useState("");
  const [busy,setBusy] = useState(true);
  const [canUndo,setCanUndo] = useState(false);
  const [finished,setFinished] = useState("");
  async function resume(undo: boolean) {
    setBusy(true);
    try {
      const state = undo
        ? await backupCommand<Recovery | null>("rollback", {storage:readRecords(localStorage)})
        : await backupCommand<Recovery | {mode:"capture"} | null>("startup");
      const pending = state?.mode === "capture"
        ? await backupCommand<Recovery>("startup",{storage:readRecords(localStorage)})
        : state;
      if (pending) {
        setCanUndo(pending.mode === "restore");
        replaceRecords(localStorage, pending.storage);
        await backupCommand("ack");
        setFinished(pending.mode === "restore" ? "백업 기록을 복원했어요." : "복원 전 기록으로 돌아왔어요.");
      } else { setReady(true); }
    } catch (e) {
      setMessage(String(e)); setCanUndo(true);
    } finally { setBusy(false); }
  }
  useEffect(()=>{ void resume(false); },[]);
  if (ready) return <>{children}</>;
  return <main className="backupStartup">
    <h1>{finished || "곰고미 기록 확인"}</h1>
    {finished ? <button onClick={()=>setReady(true)}>곰고미 열기</button> : <>
      <p role="status">{busy ? "저장된 기록을 확인하고 있어요." : message}</p>
      {!busy && <button onClick={()=>void resume(false)}>다시 시도</button>}
      {!busy && canUndo && <button onClick={()=>void resume(true)}>복원 전 기록으로 돌아가기</button>}
    </>}
  </main>;
}
