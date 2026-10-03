import type { Expression } from "./CharacterVisual";

// Keep the approved mascot pixels intact. Young stages grow roots and small
// tubers around the original; the completed stage uses the original directly.
export function PotatoGrowthVisual({ src, stage, expression, className }: {
  src: string; stage: number; expression: Expression; className: string;
}) {
  const size = [0, 60, 75, 90][stage];
  return <span className={`${className} potatoGrowth`} data-character="potato" data-stage={stage} data-expression={expression}>
    <svg className="potatoGrowthRoots" viewBox="0 0 220 220" aria-hidden="true">
      <ellipse cx="110" cy="196" rx={stage === 1 ? 31 : stage === 2 ? 47 : 65} ry="5" fill="#dad1bd" opacity=".4" />
      <g fill="none" stroke="#b68b5b" strokeWidth="2" strokeLinecap="round">
        <path d="M110 175v16m0-9-7 6m7-3 7 6" />
        {stage > 1 && <path d="M99 174q-8 11-18 12m41-12q10 13 23 13m-60-3-3 7m55-7 2 8" />}
        {stage > 2 && <path d="M89 175q-16 6-27 2m80-3q15 7 25 2m-102 2-3 8m100-7 3 8" />}
      </g>
      {stage > 1 && <ellipse cx="73" cy="182" rx={stage === 2 ? 8 : 12} ry={stage === 2 ? 6 : 9} fill="#edb567" stroke="#c59a62" strokeWidth="1.5" />}
      {stage > 2 && <><ellipse cx="154" cy="182" rx="13" ry="9" fill="#edb567" stroke="#c59a62" strokeWidth="1.5" /><circle cx="70" cy="182" r="1.5" fill="#ac7c48" /><circle cx="156" cy="180" r="1.5" fill="#ac7c48" /></>}
    </svg>
    <img src={src} alt="" draggable={false} width={220} height={220} data-stage={stage} data-expression={expression}
      style={{ width: `${size}%`, height: "auto", bottom: stage === 1 ? "16%" : stage === 2 ? "12%" : "8%" }} />
  </span>;
}
