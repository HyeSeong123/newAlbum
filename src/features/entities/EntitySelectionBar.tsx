import type { ReactNode } from 'react';
import './entities.css';
export function EntitySelectionBar({ count, unit, busy = false, onAll, onClear, onClose, children, allLabel = '전체 선택', className = '', counter = '개', hint = true }: {
  count: number; unit: string; allLabel?: string; className?: string; counter?: string; hint?: boolean; busy?: boolean; onAll: () => void; onClear: () => void; onClose: () => void; children?: ReactNode;
}) {
  return <section className={`entitySelectionBar peopleActions ${className}`} aria-label={`선택한 ${unit} 관리`}>
    <div className="entitySelectionSummary"><strong role="status" aria-live="polite">{unit} {count}{counter} 선택</strong><button disabled={busy} onClick={onClose}>선택 취소</button></div>
    <div className="entitySelectionTools"><button disabled={busy} onClick={onAll}>{allLabel}</button><button disabled={busy || !count} onClick={onClear}>선택 해제</button></div>
    <div className="entitySelectionCommands">{children}</div>
    {hint && <small>좌우로 드래그해 선택 · 위아래로 스크롤</small>}
  </section>;
}
