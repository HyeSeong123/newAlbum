import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

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
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const anchor = trigger.current.getBoundingClientRect();
      const bounds = panel.current.getBoundingClientRect();
      const height = Math.min(bounds.height, viewportHeight - margin * 2);
      const below = anchor.bottom + gap;
      const above = anchor.top - gap - height;
      const top = below + height <= viewportHeight - margin ? below : Math.max(margin, above);
      setPosition({
        position: "fixed", top: Math.min(top, viewportHeight - margin - height),
        left: Math.max(margin, Math.min(anchor.right - bounds.width, viewportWidth - margin - bounds.width)),
        right: "auto", maxWidth: `calc(100vw - ${margin * 2}px)`,
        maxHeight: `calc(100dvh - ${margin * 2}px)`, overflowY: "auto",
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);
  return <div className="actionMenu" ref={root} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }} onKeyDown={(event) => {
    if (event.key === "Escape" && open) {
      event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus();
    }
  }}>
    <button ref={trigger} type="button" className="actionMenuTrigger" aria-label={label} title={label} aria-expanded={open} disabled={disabled} onClick={() => setOpen(!open)}>{triggerText && <span>{triggerText}</span>}{icon}</button>
    {open && <div ref={panel} className="actionMenuPanel" style={position ?? { position: "fixed", maxWidth: "calc(100vw - 20px)", maxHeight: "calc(100dvh - 20px)", overflowY: "auto" }} role="group" aria-label={label}>
      {actions.map((action) => <button type="button" key={action.label} className={action.danger ? "dangerAction" : undefined} disabled={action.disabled} onClick={() => { setOpen(false); trigger.current?.focus(); action.onSelect(); }}>{action.icon}{action.label}</button>)}
    </div>}
  </div>;
}
