import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Square, X, Download } from "lucide-react";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import { CharacterVisual } from "./CharacterVisual";
import { characterName, type CharacterDefinition, type OwnedCharacter } from "./models";
import { companionActionLabel, companionMoodLabel, readCompanionMemory } from "./companionActivities";
import { buildChatPrompt, CHAT_INPUT_LIMIT, cleanChatReply, readChatHistory, saveChatHistory, type ChatTurn } from "./companionChatModel";
import { chatModelStatus, downloadChatModel, generateChatReply, stopChatModel, type ChatModelStatus } from "./companionChatService";
import "./companion-chat.css";

export function CompanionChat({ definition, owned, onClose }: { definition: CharacterDefinition; owned: OwnedCharacter; onClose: () => void }) {
  const [history, setHistory] = useState<ChatTurn[]>(() => readChatHistory(owned.id));
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ChatModelStatus>();
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [retry, setRetry] = useState("");
  const panel = useRef<HTMLElement>(null), end = useRef<HTMLDivElement>(null);
  const active = useRef(true), ticket = useRef(0), locked = useRef(false);
  const name = characterName(definition, owned);
  const close = () => { active.current = false; ++ticket.current; void stopChatModel().catch(() => {}); onClose(); };
  useModalBehavior(close);
  const focus = useDialogFocus(panel);
  useEffect(() => {
    active.current = true;
    let querying = false;
    const refresh = async () => {
      if (querying) return;
      querying = true;
      try { const value = await chatModelStatus(); if (active.current) setStatus(value); }
      catch { if (active.current) setError("AI 상태를 확인하지 못했어요. 창을 다시 열어 주세요."); }
      finally { querying = false; }
    };
    void refresh(); const timer = window.setInterval(() => void refresh(), 1000);
    const visibility = () => { if (document.hidden) close(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { active.current = false; ++ticket.current; window.clearInterval(timer); document.removeEventListener("visibilitychange", visibility); void stopChatModel().catch(() => {}); };
  }, [owned.id]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest", behavior: "instant" }); }, [history, busy, error]);
  function persist(turns: ChatTurn[]) {
    const bounded = turns.slice(-40);
    setHistory(bounded); setSaveError(!saveChatHistory(owned.id, bounded));
  }
  async function send(message = draft, retrying = false) {
    const text = message.trim();
    if (!text || text.length > CHAT_INPUT_LIMIT || locked.current || !status?.installed || !status.supported) return;
    locked.current = true; const request = ++ticket.current;
    setBusy(true); setError(""); setRetry(""); setDraft("");
    const before = retrying ? history.slice(0, -1) : history;
    const turns: ChatTurn[] = [...before, { role: "user", text }];
    persist(turns);
    const memory = readCompanionMemory(owned.id);
    try {
      const line = cleanChatReply(await generateChatReply(buildChatPrompt({ name,
        personality: definition.personality?.archetype || definition.description, tone: definition.personality?.speechTone || "친근한 한국어",
        affection: owned.affection, mood: companionMoodLabel(memory.mood),
        activities: memory.history.map(item => companionActionLabel(definition, item.action)) }, before, text)));
      if (!active.current || request !== ticket.current) return;
      if (!line) throw new Error("답변을 만들지 못했어요. 다시 시도해 주세요.");
      persist([...turns, { role: "assistant", text: line }]);
    } catch (cause) {
      if (active.current && request === ticket.current) { setRetry(text); setError(typeof cause === "string" ? cause : cause instanceof Error ? cause.message : "답변을 만들지 못했어요. 다시 시도해 주세요."); }
    } finally { if (active.current && request === ticket.current) { locked.current = false; setBusy(false); } }
  }
  async function stop() {
    ++ticket.current; locked.current = false; setBusy(false); setError("대답을 멈췄어요.");
    const last = history.at(-1); if (last?.role === "user") setRetry(last.text);
    await stopChatModel().catch(() => setError("중단 상태를 확인하지 못했어요. 창을 닫아 주세요."));
  }
  async function download() {
    setError("");
    try { await downloadChatModel(); if (active.current) setStatus(await chatModelStatus()); }
    catch (cause) { if (active.current) setError(typeof cause === "string" ? cause : "다운로드를 시작하지 못했어요. 다시 시도해 주세요."); }
  }
  const downloading = status?.phase === "downloading" || status?.phase === "verifying";
  return <div className="companionChatBackdrop" onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <section className="companionChat" role="dialog" aria-modal="true" aria-labelledby="companion-chat-title" tabIndex={-1} ref={panel} onKeyDown={focus}>
      <header className="companionChatHeader"><div className="companionChatAvatar" aria-hidden="true"><CharacterVisual definition={definition} stage={owned.growthStage} affection={owned.affection} /></div>
        <div><h2 id="companion-chat-title">{name}와 대화</h2><span>우리의 이야기는 이 기기에만</span></div>
        <button type="button" aria-label="대화 닫기" onClick={close}><X size={22} /></button>
      </header>
      {!status || !status.installed || !status.supported ? <div className="companionChatSetup" role="status">
        <MessageCircle size={28} aria-hidden="true" /><h3>{!status ? "대화를 준비하고 있어요" : downloading ? "AI를 준비하고 있어요" : "이 기기에서 나누는 대화"}</h3>
        <p>{status?.message || "잠시만 기다려 주세요."}</p>
        {status?.supported && !downloading && <><p>처음 한 번 약 1.1GB를 받아요. Wi-Fi에서 준비하면 좋아요. 준비 후에는 인터넷 없이 대화해요.</p>
          <button type="button" className="primary" onClick={() => void download()}><Download size={18} /> AI 다운로드</button></>}
        {downloading && <><progress max={Math.max(1, status.total)} value={status.downloaded} aria-label="AI 다운로드 진행률" /><span>{status.phase === "verifying" ? "파일 확인 중" : Math.floor(status.downloaded / Math.max(1, status.total) * 100) + "%"}</span>
          <button type="button" onClick={() => void stopChatModel()}>다운로드 취소</button></>}
        <a href="/notices/companion-ai-NOTICE.txt" target="_blank" rel="noreferrer">AI 모델 · 오픈소스 안내</a>
      </div> : null}
      <div className="companionChatMessages" role="log" aria-label="대화 기록" aria-live="polite" aria-relevant="additions text">
        {!history.length && status?.installed && <div className="companionChatEmpty"><MessageCircle size={30} aria-hidden="true" /><p>오늘 하루, 어떤 이야기를 들려줄래요?</p></div>}
        {history.map((turn, i) => <div key={i} className={"companionChatTurn " + turn.role}><small>{turn.role === "user" ? "나" : name}</small><p>{turn.text}</p></div>)}
        {busy && <p className="companionChatThinking">{name}가 생각하고 있어요…</p>}<div ref={end} />
      </div>
      {saveError && <p className="companionChatNotice" role="status">기기 저장 공간이 부족해 이번 대화를 저장하지 못했어요.</p>}
      {error && <div className="companionChatNotice" role="alert"><p>{error}</p>{retry && !busy && <button type="button" onClick={() => void send(retry, true)}>답변 다시 받기</button>}</div>}
      <form className="companionChatComposer" onSubmit={event => { event.preventDefault(); void send(); }}>
        <label className="srOnly" htmlFor="companion-chat-input">친구에게 할 말</label>
        <textarea id="companion-chat-input" value={draft} onChange={event => setDraft(event.target.value)} maxLength={CHAT_INPUT_LIMIT} rows={2}
          placeholder="친구에게 할 말을 적어 주세요" disabled={!status?.installed || !status.supported || busy} onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
          }} />
        {busy ? <button type="button" aria-label="대답 멈추기" onClick={() => void stop()}><Square size={20} /></button> :
          <button type="submit" className="primary" aria-label="메시지 보내기" disabled={!draft.trim() || !status?.installed || !status.supported || status.phase === "generating"}><Send size={20} /></button>}
      </form>
    </section>
  </div>;
}
