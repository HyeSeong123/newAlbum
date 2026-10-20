import { useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useModalBehavior } from '../hooks/useModalBehavior';
import { useDialogFocus } from '../hooks/useDialogFocus';
import './entity-editor.css';

/** Shared edit surface: fields scroll while the action row remains reachable. */
export function EntityEditorDialog({ title, busy, onClose, children, className = '' }: {
  title: string; busy: boolean; onClose: () => void; children: ReactNode; className?: string;
}) {
  const panel = useRef<HTMLElement>(null);
  useModalBehavior(() => { if (!busy) onClose(); });
  const onKeyDown = useDialogFocus(panel);
  return <div className="modalBackdrop entityEditBackdrop">
    <section ref={panel} tabIndex={-1} className={`entityEditDialog ${className}`} role="dialog" aria-modal="true" aria-label={title} aria-busy={busy} onKeyDown={onKeyDown}>
      <header className="detailHeader"><strong>{title}</strong><button type="button" className="closeButton" title="닫기" disabled={busy} onClick={onClose}><X size={18} /></button></header>
      {children}
    </section>
  </div>;
}
