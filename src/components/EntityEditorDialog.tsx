import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useModalBehavior } from '../hooks/useModalBehavior';
import './entity-editor.css';

/** Shared edit surface: fields scroll while the action row remains reachable. */
export function EntityEditorDialog({ title, busy, onClose, children, className = '' }: {
  title: string; busy: boolean; onClose: () => void; children: ReactNode; className?: string;
}) {
  const panel = useRef<HTMLElement>(null);
  useModalBehavior(() => { if (!busy) onClose(); });
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus({ preventScroll: true });
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <div className="modalBackdrop entityEditBackdrop">
    <section ref={panel} tabIndex={-1} className={`entityEditDialog ${className}`} role="dialog" aria-modal="true" aria-label={title} aria-busy={busy} onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const nodes = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? []).filter(node => node.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus(); }
    }}>
      <header className="detailHeader"><strong>{title}</strong><button type="button" className="closeButton" title="닫기" disabled={busy} onClick={onClose}><X size={18} /></button></header>
      {children}
    </section>
  </div>;
}
