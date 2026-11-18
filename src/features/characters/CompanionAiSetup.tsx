import {useEffect,useRef,useState,useSyncExternalStore} from "react";
import {Sparkles,X} from "lucide-react";
import {useModalBehavior} from "../../hooks/useModalBehavior";
import {useDialogFocus} from "../../hooks/useDialogFocus";
import {CharacterVisual} from "./CharacterVisual";
import {characterName,type CharacterDefinition,type OwnedCharacter} from "./models";
import {chatModelStatus,lastChatReaction,subscribeChatReaction,type ChatModelStatus} from "./companionChatService";
import "./companion-chat.css";

export function CompanionAiSetup({definition,owned,onClose}:{definition:CharacterDefinition;owned:OwnedCharacter;onClose:()=>void}) {
  const [status,setStatus]=useState<ChatModelStatus>();
  const [error,setError]=useState("");
  const panel=useRef<HTMLElement>(null);
  useModalBehavior(onClose);
  const focus=useDialogFocus(panel);
  const reaction=useSyncExternalStore(subscribeChatReaction,()=>lastChatReaction(owned.id));
  useEffect(()=>{
    let active=true;
    const refresh=()=>void chatModelStatus(definition.id,"home-actions").then(value=>{
      if(active){setStatus(value);setError("");}
    }).catch(()=>{if(active)setError("AI 준비 상태를 확인하지 못했어요. 창을 다시 열어 주세요.");});
    refresh();const timer=window.setInterval(refresh,1000);
    return()=>{active=false;window.clearInterval(timer);};
  },[definition.id]);
  const ready=status?.supported&&status.installed;
  const runtime=status?.runtime;
  const milliseconds=(value:number|undefined)=>value==null?"측정 전":`${Math.round(value)}ms`;
  return <div className="companionChatBackdrop" onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section className="companionChat companionAiSetup" role="dialog" aria-modal="true" aria-labelledby="companion-ai-title" tabIndex={-1} ref={panel} onKeyDown={focus}>
      <header className="companionChatHeader"><div className="companionChatAvatar" aria-hidden="true"><CharacterVisual definition={definition} stage={owned.growthStage} affection={owned.affection}/></div>
        <div><h2 id="companion-ai-title">AI 반응 설정</h2><span>{characterName(definition,owned)}의 새로운 한마디</span></div>
        <button type="button" aria-label="AI 반응 설정 닫기" onClick={onClose}><X size={22}/></button>
      </header>
      <div className="companionChatSetup" role="status">
        <Sparkles size={28} aria-hidden="true"/><h3>{status?.phase === "error" ? "AI를 준비하지 못했어요" : ready ? "곰고미 전용 AI가 준비됐어요" : "AI를 준비하고 있어요"}</h3>
        <p className="companionResponseDescription">친구를 터치하거나 함께하기를 누르면 행동과 관계에 맞는 짧은 새 대사를 만들어요. 앱에 포함되어 인터넷 없이 사용할 수 있어요.</p>
        {ready&&<div className="companionAiOutcome">
          <strong>AI 모델</strong><p>곰고미 전용 AI · 앱에 포함됨{status.total>0?` · ${Math.round(status.total/1024)}KB`:""}</p>
          <strong>최근 AI 반응</strong><p role={reaction?.phase==="complete"&&reaction.source!=="on-device"?"alert":"status"}>{reaction?.message||"홈에서 친구를 터치해 주세요."}</p>
          {runtime?.ownModelApplied&&<p data-gomi-training-status>최근 반응에 곰고미 전용 학습 모델이 사용됐어요.</p>}
          <details><summary>최근 실행 시간 보기</summary><dl className="companionAiMetrics">
            <dt>모델 준비</dt><dd>{milliseconds(runtime?.loadMs)}</dd>
            <dt>대사 생성</dt><dd>{milliseconds(runtime?.generationMs)}</dd>
            <dt>최근 생성 요청 전체</dt><dd>{milliseconds(runtime?.totalMs)}</dd>
          </dl><p>이 기기에서 측정한 최근 요청이에요. 화면 조작과 저장에 걸린 시간은 별도예요.</p></details>
        </div>}
        {!ready&&<p role={status?.phase === "error" ? "alert" : "status"}>{status?.phase === "error"
          ? reaction?.message || "홈에서 대사를 다시 요청해 주세요."
          : status?.message || "준비 상태를 확인하고 있어요."}</p>}
        <p>아직 말투를 다듬고 있어요. 생성에 실패하면 준비된 대사로 바꾸지 않아요.</p>
        <a href="/notices/companion-ai-NOTICE.txt" target="_blank" rel="noreferrer">AI 모듈 안내</a>
      </div>
      {error&&<p className="companionChatNotice" role="alert">{error}</p>}
      <footer className="companionAiFooter" data-help-dock><button type="button" className="primary" onClick={onClose}>친구 만나러 가기</button></footer>
    </section>
  </div>;
}
