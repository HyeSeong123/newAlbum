import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function ActionMenu({ label, icon, triggerText, disabled = false, actions }: {
  label: string;
  icon: ReactNode;
  triggerText?: string;
  disabled?: boolean;
  actions: { label: string; icon?: ReactNode; disabled?: boolean; danger?: boolean; onSelect: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  useLayoutEffect(() => {
    if (!open) { setPosition(null); return; }
    const place = () => {
      if (!trigger.current || !panel.current) return;
      const margin = 10;
      const gap = 6;
      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportWidth = viewport?.width ?? document.documentElement.clientWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const leftEdge = viewportLeft + margin;
      const topEdge = viewportTop + margin;
      const rightEdge = viewportLeft + viewportWidth - margin;
      const bottomEdge = viewportTop + viewportHeight - margin;
      const anchor = trigger.current.getBoundingClientRect();
      const bounds = panel.current.getBoundingClientRect();
      const height = Math.min(bounds.height, viewportHeight - margin * 2);
      const below = anchor.bottom + gap;
      const above = anchor.top - gap - height;
      const top = below + height <= bottomEdge ? below : Math.max(topEdge, above);
      setPosition({
        position: "fixed", top: Math.max(topEdge, Math.min(top, bottomEdge - height)),
        left: Math.max(leftEdge, Math.min(anchor.right - bounds.width, rightEdge - bounds.width)),
        right: "auto", maxWidth: viewportWidth - margin * 2,
        maxHeight: viewportHeight - margin * 2, overflowY: "auto",
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [open]);
  useEffect(() => {
    if (open && position) panel.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  }, [open, Boolean(position)]);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);
  return <div className="actionMenu" ref={root} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null) && !panel.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
  }} onKeyDown={(event) => {
    if (event.key === "Escape" && open) {
      event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus();
    }
  }}>
    <button ref={trigger} type="button" className="actionMenuTrigger" aria-label={label} title={label} aria-expanded={open} disabled={disabled} onClick={() => setOpen(!open)}>{triggerText && <span>{triggerText}</span>}{icon}</button>
    {open && createPortal(<div ref={panel} className="actionMenuPanel" style={position ?? { position: "fixed", visibility: "hidden", maxWidth: "calc(100vw - 20px)", maxHeight: "calc(100dvh - 20px)", overflowY: "auto" }} role="group" aria-label={label}>
      {actions.map((action) => <button type="button" key={action.label} className={action.danger ? "dangerAction" : undefined} disabled={action.disabled} onClick={() => { setOpen(false); trigger.current?.focus({ preventScroll: true }); action.onSelect(); }}>{action.icon}{action.label}</button>)}
    </div>, document.fullscreenElement ?? document.body)}
  </div>;
}
