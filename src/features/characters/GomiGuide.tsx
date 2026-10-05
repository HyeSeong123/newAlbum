import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import { CharacterVisual } from "./CharacterVisual";
import { characterDefinitions } from "./models";
import { guideTopics, type GuideTopic } from "./guideTopics";
import "./gomi-guide.css";

export function GomiGuide({ initialTopic = "photos", onClose, onAction }: {
  initialTopic?: GuideTopic; onClose: () => void; onAction: (topic: GuideTopic) => void;
}) {
  const [topicIndex, setTopicIndex] = useState(() => Math.max(0, guideTopics.findIndex(topic => topic.id === initialTopic)));
  const [stepIndex, setStepIndex] = useState(0);
  const panel = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const gomi = characterDefinitions.find(def => def.id === "gomi")!;
  const topic = guideTopics[topicIndex];
  const step = topic.steps[stepIndex];
  useModalBehavior(onClose);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { if (opener?.isConnected) opener.focus(); };
  }, []);
  useEffect(() => { body.current?.scrollTo(0, 0); }, [topicIndex, stepIndex]);
  function previous() {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
    else if (topicIndex > 0) { setTopicIndex(topicIndex - 1); setStepIndex(guideTopics[topicIndex - 1].steps.length - 1); }
  }
  function next() {
    if (stepIndex < topic.steps.length - 1) setStepIndex(stepIndex + 1);
    else if (topicIndex < guideTopics.length - 1) { setTopicIndex(topicIndex + 1); setStepIndex(0); }
    else onClose();
  }
  return <div className="modalBackdrop gomiGuideBackdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panel} className="gomiGuide" role="dialog" aria-modal="true" aria-labelledby="gomiGuideTitle"
      onKeyDown={event => {
        if (event.key !== "Tab") return;
        const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || []);
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <header className="gomiGuideHeader"><div><small>궁금한 건 고미에게</small><h2 id="gomiGuideTitle">고미 도움말</h2></div><button type="button" className="closeButton" aria-label="도움말 닫기" onClick={onClose}><X size={20} /></button></header>
      <nav className="gomiGuideTopics" aria-label="도움말 주제">{guideTopics.map((item, index) => <button key={item.id} type="button" aria-pressed={index === topicIndex} onClick={() => { setTopicIndex(index); setStepIndex(0); }}>{item.label}</button>)}</nav>
      <div className="gomiGuideBody" ref={body}>
        <div className="gomiGuideCompanion"><CharacterVisual definition={gomi} stage={6} /><p className="gomiGuideSpeech" role="status" aria-live="polite" aria-atomic="true">{step.line}</p></div>
        <article className="gomiGuideStep" aria-labelledby="gomiStepTitle"><small>{topic.label} · {stepIndex + 1} / {topic.steps.length}</small><h3 id="gomiStepTitle">{step.title}</h3><p>{step.detail}</p></article>
        <button className="gomiGuideAction" type="button" onClick={() => onAction(topic.id)}>{topic.actionLabel}<ArrowUpRight size={17} aria-hidden="true" /></button>
      </div>
      <footer className="gomiGuideFooter"><button type="button" disabled={topicIndex === 0 && stepIndex === 0} onClick={previous}><ChevronLeft size={16} aria-hidden="true" />이전</button><button type="button" className="primary" onClick={next}>{topicIndex === guideTopics.length - 1 && stepIndex === topic.steps.length - 1 ? "설명 마치기" : "다음"}<ChevronRight size={16} aria-hidden="true" /></button></footer>
    </section>
  </div>;
}
