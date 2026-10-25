import { useEffect, useRef, useState } from "react";
import { Download, Sparkles, X } from "lucide-react";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import { CharacterVisual } from "./CharacterVisual";
import { characterName, type CharacterDefinition, type OwnedCharacter } from "./models";
import { chatModelStatus, downloadChatModel, stopChatModel, type ChatModelStatus } from "./companionChatService";
import "./companion-chat.css";

export function CompanionAiSetup({ definition, owned, onClose }: { definition: CharacterDefinition; owned: OwnedCharacter; onClose: () => void }) {
  const [status, setStatus] = useState<ChatModelStatus>();
  const [error, setError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [starting, setStarting] = useState(false);
  const panel = useRef<HTMLElement>(null), active = useRef(true);
  useModalBehavior(onClose);
  const focus = useDialogFocus(panel);
  useEffect(() => {
    active.current = true;
    let querying = false;
    const refresh = async () => {
      if (querying) return;
      querying = true;
      try { const next = await chatModelStatus(); if (active.current) { setStatus(next); setStatusError(""); } }
      catch { if (active.current) setStatusError("AI 준비 상태를 확인하지 못했어요. 창을 다시 열어 주세요."); }
      finally { querying = false; }
    };
    void refresh(); const timer = window.setInterval(() => void refresh(), 1000);
    return () => { active.current = false; window.clearInterval(timer); };
  }, []);
  async function download() {
    if (starting) return;
    setStarting(true); setError("");
    try { await downloadChatModel(); const next = await chatModelStatus(); if (active.current) setStatus(next); }
    catch (cause) { if (active.current) setError(typeof cause === "string" ? cause : "AI를 준비하지 못했어요. 다시 시도해 주세요."); }
    finally { if (active.current) setStarting(false); }
  }
  async function cancel() {
    try { await stopChatModel(); }
    catch { if (active.current) setError("중단 상태를 확인하지 못했어요. 잠시 후 다시 확인해 주세요."); }
  }
  const downloading = status?.phase === "downloading" || status?.phase === "verifying";
  const ready = status?.supported && status.installed;
  return <div className="companionChatBackdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="companionChat companionAiSetup" role="dialog" aria-modal="true" aria-labelledby="companion-ai-title" tabIndex={-1} ref={panel} onKeyDown={focus}>
      <header className="companionChatHeader"><div className="companionChatAvatar" aria-hidden="true"><CharacterVisual definition={definition} stage={owned.growthStage} affection={owned.affection} /></div>
        <div><h2 id="companion-ai-title">AI 반응 설정</h2><span>{characterName(definition, owned)}의 더 다양한 한마디</span></div>
        <button type="button" aria-label="AI 반응 설정 닫기" onClick={onClose}><X size={22} /></button>
      </header>
      <div className="companionChatSetup" role="status">
        <Sparkles size={28} aria-hidden="true" /><h3>{ready ? "터치하면 이야기가 달라져요" : downloading ? "다양한 반응을 준비하고 있어요" : "친구의 마음을 담은 한마디"}</h3>
        <p>캐릭터를 터치하면 기분·성격·친밀도와 함께한 행동에 맞춰 AI가 새로운 말을 만들어요.</p>
        {status?.supported && !ready && !downloading && <><p>처음 한 번 약 1.1GB를 받아요. Wi-Fi에서 준비하면 좋아요. 준비 후에는 인터넷 없이 반응해요.</p>
          <button type="button" className="primary" disabled={starting} onClick={() => void download()}><Download size={18} /> AI 준비하기</button></>}
        {!ready && <p>{status?.message || "준비 상태를 확인하고 있어요."}</p>}
        {downloading && <><progress max={Math.max(1, status.total)} value={status.downloaded} aria-label="AI 다운로드 진행률" /><span>{status.phase === "verifying" ? "파일 확인 중" : Math.floor(status.downloaded / Math.max(1, status.total) * 100) + "%"}</span>
          <button type="button" onClick={() => void cancel()}>다운로드 취소</button></>}
        <a href="/notices/companion-ai-NOTICE.txt" target="_blank" rel="noreferrer">AI 모델 · 오픈소스 안내</a>
      </div>
      {(error || statusError) && <p className="companionChatNotice" role="alert">{error || statusError}</p>}
      <footer className="companionAiFooter" data-help-dock><button type="button" className="primary" onClick={onClose}>{ready ? "친구 만나러 가기" : "닫기"}</button></footer>
    </section>
  </div>;
}
