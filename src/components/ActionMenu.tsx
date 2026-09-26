import { useEffect, useRef, useState, type ReactNode } from "react";

export function ActionMenu({ label, icon, disabled = false, actions }: {
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  actions: { label: string; icon?: ReactNode; disabled?: boolean; onSelect: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>(".actionMenuPanel button:not(:disabled)")?.focus();
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
    <button ref={trigger} type="button" className="actionMenuTrigger" aria-label={label} title={label} aria-expanded={open} disabled={disabled} onClick={() => setOpen(!open)}>{icon}</button>
    {open && <div className="actionMenuPanel" role="group" aria-label={label}>
      {actions.map((action) => <button type="button" key={action.label} disabled={action.disabled} onClick={() => { setOpen(false); trigger.current?.focus(); action.onSelect(); }}>{action.icon}{action.label}</button>)}
    </div>}
  </div>;
}
