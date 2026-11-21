import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useReducedMotion } from "motion/react";
import { CharacterVisual } from "../src/features/characters/CharacterVisual";
import { characterDefinitions } from "../src/features/characters/models";
import type { CompanionMotion } from "../src/features/characters/companionBehavior";
import "../src/features/characters/characters.css";
import gomi from "../public/characters/gomi/idle.png";
import potatoSheet from "../public/characters/brothers-v2/potato-atlas.png";
import sweetSheet from "../public/characters/brothers-v2/sweet-potato-atlas.png";

const choices: { label: string; motion: CompanionMotion; expression?: "sad" }[] = [
  {label:"가만히 보기",motion:"idle"}, {label:"궁금해하기",motion:"look-around"},
  {label:"신나 하기",motion:"bounce"}, {label:"손 인사",motion:"walk"},
  {label:"장난치기",motion:"play"}, {label:"쓰다듬기",motion:"pet"},
  {label:"쉬어 가기",motion:"nod"}, {label:"잠들기",motion:"rest"},
  {label:"속상할 때",motion:"idle",expression:"sad"},
];
function Preview() {
  const [selected,setSelected]=useState(3);
  const [sequence,setSequence]=useState(0);
  const [paused,setPaused]=useState(false);
  const [automatic,setAutomatic]=useState(false);
  const reduced=useReducedMotion();
  const choice=choices[selected];
  useEffect(()=>{
    if(!automatic||paused||reduced)return;
    const timer=window.setInterval(()=>{setSelected(value=>(value+1)%choices.length);setSequence(value=>value+1);},5_000);
    return ()=>window.clearInterval(timer);
  },[automatic,paused,reduced]);
  return <main>
    <header><div><p className="eyebrow">곰고미 · 감자와 고구마</p><h1>같은 그림체, 서로 다른 템포.</h1>
      <p className="intro">감자는 먼저 움직이고, 고구마는 한 박자 뒤에 반응해요.</p></div>
      <div className="gomiReference"><img src={gomi} alt="그림체 기준인 고미"/><span>그림체 기준 · 고미</span></div></header>
    <section className="previewPair" aria-label="두 형제의 움직임">
      {([['potato','먼저 해 보는 동생','이거 해 보자! 내가 먼저 할게.'],['sweet-potato','한마디 얹는 형','…옆으로 와. 같이 보게.']] as const).map(([id,role,line])=>{
        const definition=characterDefinitions.find(item=>item.id===id)!;
        return <article className={"previewCard "+id} key={id}><div className="cardHeading"><h2>{definition.defaultName}</h2><span>{role}</span></div>
          <div className="previewArt"><CharacterVisual definition={definition} stage={6} expression={choice.expression||"idle"}
            companionMotion={choice.motion} reactionKey={sequence} paused={paused}/></div>
          <p className="sampleLine">{line}</p><span className="currentPose">{choice.label}</span></article>;
      })}
    </section>
    <section className="controls" aria-label="움직임 선택"><div className="controlHeading"><h2>움직임 골라 보기</h2><div>
      <button className="textButton" onClick={()=>setAutomatic(value=>!value)} aria-pressed={automatic}>{automatic?"자동 보기 끄기":"모든 움직임 자동 보기"}</button>
      <button className="pauseButton" onClick={()=>setPaused(value=>!value)} aria-pressed={paused}>{paused?"다시 움직이기":"잠깐 멈추기"}</button></div></div>
      <div className="poseChoices">{choices.map((item,index)=><button key={item.label} aria-pressed={selected===index}
        onClick={()=>{setSelected(index);setSequence(value=>value+1);setAutomatic(false);}}>{item.label}</button>)}</div>
      {reduced&&<p>기기의 움직임 줄이기 설정에 따라 정지된 자세로 보여드려요.</p>}
    </section>
    <section className="expressions"><h2>각자의 표정과 자세 12종</h2><p>감자의 큰 감정 변화와 고구마의 작은 눈매 변화를 비교해 보세요.</p>
      <div className="sheetPair"><figure><img src={potatoSheet} alt="감자의 기본·눈 감기·웃음·환호·속상함·당황·억울함·머쓱함·손 인사·휴식·수면"/><figcaption>감자 · 호기심과 장난기</figcaption></figure>
        <figure><img src={sweetSheet} alt="고구마의 기본·눈 감기·미소·웃음·걱정·당황·곁눈질·머쓱함·손 인사·휴식·수면"/><figcaption>고구마 · 덤덤한 다정함</figcaption></figure></div>
    </section>
    <footer>새 디자인 시안 · 기존 이름, 호감도와 성장 기록은 그대로 이어집니다.</footer>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Preview/>);
