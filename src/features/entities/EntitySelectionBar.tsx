import type { ReactNode } from 'react';
import './entities.css';
import { FunctionHelp } from '../../components/FunctionHelp';
export function EntitySelectionBar({ count, unit, busy = false, onAll, onClear, onClose, children, allLabel = '전체 선택', className = '', counter = '개', hint = true, help }: {
  count: number; unit: string; allLabel?: string; className?: string; counter?: string; hint?: boolean; help?: ReactNode; busy?: boolean; onAll: () => void; onClear: () => void; onClose: () => void; children?: ReactNode;
}) {
  return <section className={`entitySelectionBar peopleActions ${className}`} data-help-selection-count={count} data-help-selection-unit={unit} aria-label={`선택한 ${unit} 관리`}>
    <div className="entitySelectionSummary"><strong role="status" aria-live="polite">{unit} {count}{counter} 선택</strong>{(hint || help) && <FunctionHelp title={`${unit} 선택`}>{help}{hint && <p>좌우로 드래그해 여러 항목을 선택하고, 위아래로 밀어 스크롤하세요.</p>}</FunctionHelp>}<button disabled={busy} onClick={onClose}>선택 취소</button></div>
    <div className="entitySelectionTools"><button disabled={busy} onClick={onAll}>{allLabel}</button><button disabled={busy || !count} onClick={onClear}>선택 해제</button></div>
    <div className="entitySelectionCommands">{children}</div>
  </section>;
}
