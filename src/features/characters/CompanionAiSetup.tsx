import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Download, Sparkles, X } from "lucide-react";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import { CharacterVisual } from "./CharacterVisual";
import { characterName, type CharacterDefinition, type OwnedCharacter } from "./models";
import { chatModelStatus, downloadChatModel, lastChatReaction, stopChatModel, subscribeChatReaction, type ChatModelStatus } from "./companionChatService";
import { companionExecutionError } from "./companionLlm";
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
  const reaction = useSyncExternalStore(subscribeChatReaction, () => lastChatReaction(owned.id));
  const runtime = status?.runtime;
  const outcome = reaction?.message || "아직 AI 반응 결과가 없어요. 홈에서 친구를 터치해 주세요.";
  const nativeOutcome = status?.lastOutcome === "error" ? companionExecutionError(status.lastError) : status?.lastOutcome === "running" ? "대사를 생성하고 있어요." : status?.lastOutcome === "success" ? "생성이 끝났어요. 친구별 말풍선 반영 결과는 최근 AI 반응에서 확인해 주세요." : status?.lastOutcome === "cancelled" ? "실행을 중단했어요." : "아직 실행 기록이 없어요.";
  const seconds = (value: number | undefined) => value == null || value < 0 ? "측정 전" : (value / 1000).toFixed(1) + "초";
  const memory = (value: number | undefined) => value ? Math.round(value / 1024) + "MB" : "측정 전";
  const canDownload = status?.supported && !downloading && (!ready || status.upgradeAvailable);
  const notice = error || statusError || (status?.phase === "error" ? status.message : "");
  return <div className="companionChatBackdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="companionChat companionAiSetup" role="dialog" aria-modal="true" aria-labelledby="companion-ai-title" tabIndex={-1} ref={panel} onKeyDown={focus}>
      <header className="companionChatHeader"><div className="companionChatAvatar" aria-hidden="true"><CharacterVisual definition={definition} stage={owned.growthStage} affection={owned.affection} /></div>
        <div><h2 id="companion-ai-title">AI 반응 설정</h2><span>{characterName(definition, owned)}의 더 다양한 한마디</span></div>
        <button type="button" aria-label="AI 반응 설정 닫기" onClick={onClose}><X size={22} /></button>
      </header>
      <div className="companionChatSetup" role="status">
        <Sparkles size={28} aria-hidden="true" /><h3>{downloading ? "다양한 반응을 준비하고 있어요" : ready ? "AI 모델이 설치되어 있어요" : "친구의 마음을 담은 한마디"}</h3>
        <p>캐릭터를 터치하면 기분·성격·친밀도와 함께한 행동에 맞춰 AI가 새로운 말을 만들어요.</p>
        {ready && <div className="companionAiOutcome">
          <strong>AI 모델</strong><p>{status.model === "dialogue" ? "Qwen3 4B" : "Qwen3 1.7B"} · 설치됨</p>
          <strong>최근 AI 반응</strong><p role={reaction?.phase === "complete" && reaction.source !== "on-device" ? "alert" : "status"}>{outcome}</p>
          {runtime && <details><summary>앱의 최근 실행 기록 보기</summary>
            <p>{nativeOutcome}</p>
            <dl className="companionAiMetrics">
              <dt>홈에서 모델 유지</dt><dd>{runtime.resident ? "유지 중" : "해제됨"}</dd>
              <dt>최근 실행</dt><dd>{runtime.stage === "idle" ? "실행 전" : runtime.reused ? "모델 재사용" : "모델 로딩 요청"}</dd>
              <dt>모델 로딩</dt><dd>{seconds(runtime.loadMs)}</dd>
              <dt>대화 메모리 준비</dt><dd>{seconds(runtime.contextMs)}</dd>
              <dt>첫 글자까지</dt><dd>{seconds(runtime.firstTokenMs)}</dd>
              <dt>전체 반응</dt><dd>{seconds(runtime.totalMs)}</dd>
              <dt>앱 메모리 · 로딩 전</dt><dd>{memory(runtime.rssBeforeKiB)}</dd>
              <dt>모델 로딩 후</dt><dd>{memory(runtime.rssLoadedKiB)}</dd>
              <dt>생성 중 관측 최대</dt><dd>{memory(runtime.rssPeakKiB)}</dd>
              <dt>모델 해제 후</dt><dd>{memory(runtime.rssAfterReleaseKiB)}</dd>
            </dl><p>앱에서 마지막으로 실행한 기록이에요. 첫 글자 시간은 모델 로딩 후부터 측정하며, 메모리는 앱 전체 사용량이에요.</p>
          </details>}
        </div>}
        {canDownload && <><p>{ready ? "지금 받은 기본 AI도 사용할 수 있어요. 더 자연스러운 한국어 대화를 원하면 약 2.5GB를 추가로 받아 주세요. 다운로드는 직접 시작할 때만 진행해요." : "처음 한 번 약 2.5GB를 받아요. Wi-Fi에서 준비하면 좋아요. 준비 후에는 인터넷 없이 반응해요."}</p>
          <button type="button" className="primary" disabled={starting} onClick={() => void download()}><Download size={18} />{ready ? "더 자연스러운 AI 받기" : "AI 준비하기"}</button></>}
        {!ready && <p>{status?.message || "준비 상태를 확인하고 있어요."}</p>}
        {downloading && <><progress max={Math.max(1, status.total)} value={status.downloaded} aria-label="AI 다운로드 진행률" /><span>{status.phase === "verifying" ? "파일 확인 중" : Math.floor(status.downloaded / Math.max(1, status.total) * 100) + "%"}</span>
          <button type="button" onClick={() => void cancel()}>다운로드 취소</button></>}
        <a href="/notices/companion-ai-NOTICE.txt" target="_blank" rel="noreferrer">AI 모델 · 오픈소스 안내</a>
      </div>
      {notice && <p className="companionChatNotice" role="alert">{notice}</p>}
      <footer className="companionAiFooter" data-help-dock><button type="button" className="primary" onClick={onClose}>{ready && !downloading ? "친구 만나러 가기" : "닫기"}</button></footer>
    </section>
  </div>;
}
