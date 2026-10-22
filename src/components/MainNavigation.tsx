import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function MainNavigation({ children, activeKey }: { children: ReactNode; activeKey: string }) {
  const nav = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ overflow: false, left: false, right: false });
  function measure() {
    const element = nav.current;
    if (!element) return;
    const remaining = element.scrollWidth - element.clientWidth;
    setEdges({ overflow: remaining > 1, left: element.scrollLeft > 1, right: element.scrollLeft < remaining - 1 });
  }
  useLayoutEffect(() => {
    const element = nav.current;
    if (!element) return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    Array.from(element.children).forEach(child => observer.observe(child));
    void document.fonts.ready.then(measure);
    measure();
    return () => observer.disconnect();
  }, [children]);
  useLayoutEffect(() => {
    const element = nav.current;
    const active = element?.querySelector<HTMLElement>('button[aria-pressed="true"]');
    if (!element || !active) return;
    const bounds = element.getBoundingClientRect();
    const button = active.getBoundingClientRect();
    if (button.left < bounds.left) element.scrollLeft += button.left - bounds.left;
    else if (button.right > bounds.right) element.scrollLeft += button.right - bounds.right;
    measure();
  }, [activeKey, edges.overflow]);
  function scroll(direction: number) {
    const element = nav.current;
    if (element) element.scrollBy({ left: direction * element.clientWidth * .75, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  return <div className="navScroll" data-overflow={edges.overflow}>
    <button className="navScrollArrow" aria-label="이전 메뉴 보기" title="이전 메뉴 보기" disabled={!edges.left} hidden={!edges.overflow} onClick={() => scroll(-1)}><ChevronLeft size={20} /></button>
    <nav ref={nav} className="navList" aria-label="주 메뉴" onScroll={measure}>{children}</nav>
    <button className="navScrollArrow" aria-label="다음 메뉴 보기" title="다음 메뉴 보기" disabled={!edges.right} hidden={!edges.overflow} onClick={() => scroll(1)}><ChevronRight size={20} /></button>
  </div>;
}
