import { useEffect, useRef } from "react";

const modalStack: symbol[] = [];

let previousBodyOverflow = "";

export function useModalBehavior(onClose: () => void, options: { enabled?: boolean; onPrev?: () => void; onNext?: () => void } = {}) {
  const callbacks = useRef({ onClose, ...options });
  callbacks.current = { onClose, ...options };
  const enabled = options.enabled ?? true;
  useEffect(() => {
    if (!enabled) return;
    const id = Symbol("modal");
    if (!modalStack.length) previousBodyOverflow = document.body.style.overflow;
    modalStack.push(id);
    document.body.style.overflow = "hidden";
    function handleKeydown(event: KeyboardEvent) {
      if (modalStack.at(-1) !== id || event.defaultPrevented || event.repeat) return;
      const current = callbacks.current;
      if (event.key === "Escape") {
        event.preventDefault();
        current.onClose();
        return;
      }

      if (isEditableTarget(event.target)) return;

      if (event.key === "ArrowLeft" && current.onPrev) {
        event.preventDefault();
        current.onPrev();
      }

      if (event.key === "ArrowRight" && current.onNext) {
        event.preventDefault();
        current.onNext();
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
      const index = modalStack.indexOf(id);
      if (index !== -1) modalStack.splice(index, 1);
      if (!modalStack.length) document.body.style.overflow = previousBodyOverflow;
    };
  }, [enabled]);
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}
