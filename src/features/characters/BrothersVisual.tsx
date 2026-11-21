import { useEffect, useState } from "react";
import { brotherArtAssets, brotherArtFrame, brotherArtPoses, brotherArtViewBox, type BrotherArtId } from "./brothersArt";
import type { CompanionMotion } from "./companionBehavior";

// Only changes the visible drawing. Interaction, affection and growth remain with their existing owners.
export function BrothersVisual({ id, stage, motion, expression, reactionKey, paused, reduced, poster, subject }: {
  id: BrotherArtId; stage: number; motion: CompanionMotion; expression: "idle" | "happy" | "sad" | "grow";
  reactionKey: number; paused: boolean; reduced: boolean; poster: string; subject: string;
}) {
  const src = brotherArtAssets[id];
  const [loaded, setLoaded] = useState<{ src: string; width: number; height: number }>();
  const [hidden, setHidden] = useState(() => document.hidden);
  const ready = loaded?.src === src;
  const key = id + ":" + motion + ":" + expression + ":" + reactionKey;
  const initialFrame = brotherArtFrame(id, motion, expression, 0, reduced);
  const [drawing, setDrawing] = useState({ key, frame: initialFrame });
  // Home can clear its temporary happy flag while hidden. Freeze the displayed
  // drawing through that prop change, then restart the chosen pose on resume.
  const frozen = (paused || hidden) && drawing.key.startsWith(id + ":");
  const frame = reduced ? initialFrame : frozen || drawing.key === key ? drawing.frame : initialFrame;

  useEffect(() => {
    let active = true;
    const image = new Image();
    image.src = src;
    void image.decode().then(() => {
      if (active) setLoaded({ src, width: image.naturalWidth, height: image.naturalHeight });
    }).catch(() => { if (active) setLoaded(undefined); });
    return () => { active = false; };
  }, [src]);
  useEffect(() => {
    const visibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);
  useEffect(() => {
    if (paused || hidden) return;
    setDrawing({ key, frame: initialFrame });
    if (!ready || reduced) return;
    const start = performance.now();
    const timer = window.setInterval(() => {
      const next = brotherArtFrame(id, motion, expression, performance.now() - start, false);
      setDrawing(previous => previous.key === key && previous.frame === next ? previous : { key, frame: next });
    }, 140);
    return () => window.clearInterval(timer);
  }, [id, motion, expression, reactionKey, key, initialFrame, ready, paused, hidden, reduced]);

  return <svg className="characterIllustration characterPortrait brotherPencilArt"
    viewBox={ready ? brotherArtViewBox(frame, loaded.width, loaded.height) : "0 0 384 384"}
    data-portrait={subject} data-stage={stage} data-expression={expression}
    data-art="pencil-v2" data-art-ready={ready} data-frame={frame} data-pose={brotherArtPoses[frame]}
    aria-hidden="true" width={220} height={220} overflow="hidden">
    <image href={ready ? src : poster} width={ready ? loaded.width : 384}
      height={ready ? loaded.height : 384} onError={() => setLoaded(undefined)} />
  </svg>;
}
