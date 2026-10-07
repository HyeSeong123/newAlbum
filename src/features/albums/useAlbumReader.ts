import { useEffect, useMemo, useRef, useState, type PointerEvent, type MouseEvent } from "react";
import type { AlbumContent, MediaItem } from "../../types/media";
import { uniqueAlbumItems } from "../media/journalModel";
import { makeBookSpreads, singleBookPages } from "./albumContent";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import { ALBUM_TURN_TIMING } from "./albumAnimation";

const SINGLE_PAGE_QUERY = "(max-width: 760px), (max-width: 1000px) and (max-height: 520px)";

export function useAlbumReader(items: MediaItem[], open: boolean, onClose: () => void, contents?: AlbumContent[]) {
  const [singlePage, setSinglePage] = useState(() => window.matchMedia(SINGLE_PAGE_QUERY).matches);
  // Keep a leaf position so a viewport change preserves the page being read.
  const [leafIndex, setLeafIndex] = useState(0);
  const [turn, setTurn] = useState<{ direction: "next" | "prev"; from: number; to: number } | null>(null);
  const turning = turn?.direction ?? null;
  const [turnPhase, setTurnPhase] = useState<"departing" | "arriving" | "settling" | null>(null);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [notice, setNotice] = useState("");
  const timers = useRef<number[]>([]);
  const turnLock = useRef(false);
  const [drag, setDrag] = useState<{ direction: "next" | "prev"; progress: number } | null>(null);
  const gesture = useRef<{ id: number; x: number; y: number; width: number; claimed: boolean } | null>(null);
  const suppressClick = useRef(false);
  const ownsFullscreen = useRef(false);
  const albumItems = useMemo(() => uniqueAlbumItems(items), [items]);
  const mediaOrderKey = useMemo(() => JSON.stringify(albumItems.map((item) => item.id)), [albumItems]);
  const orderedItems = albumItems;
  const spreads = useMemo(() => makeBookSpreads(orderedItems, contents), [orderedItems, contents]);
  const pages = useMemo(() => singlePage ? singleBookPages(spreads) : spreads, [singlePage, spreads]);
  const pageLayoutKey = JSON.stringify(spreads.map(({ left, right, leftPage, rightPage }) => [left.map(item => item.id), right.map(item => item.id), leftPage?.id, rightPage?.id]));
  const leavesPerView = singlePage ? 1 : 2;
  const currentPage = Math.min(Math.floor(leafIndex / leavesPerView), Math.max(0, pages.length - 1));
  const oppositeSide = turn?.direction === "next" ? "left" : "right";
  const oppositePage = oppositeSide === "left" ? "leftPage" : "rightPage";
  // Keep the opposite print in place until the turning leaf is almost flat.
  const visibleSpread = singlePage && turn ? pages[turn.direction === "next" ? turn.to : turn.from] : turn && turnPhase !== "settling" && pages[currentPage] ? {
    ...pages[currentPage], [oppositeSide]: pages[turn.from]?.[oppositeSide] ?? [],
    [`${oppositeSide}Page`]: pages[turn.from]?.[`${oppositeSide}Page`],
  } : pages[currentPage];
  const turningLeaves = turn ? {
    front: pages[singlePage && turn.direction === "prev" ? turn.to : turn.from]?.[singlePage || turn.direction === "prev" ? "left" : "right"] ?? [],
    back: pages[singlePage && turn.direction === "prev" ? turn.from : turn.to]?.[singlePage ? "left" : oppositeSide] ?? [],
    frontPage: pages[singlePage && turn.direction === "prev" ? turn.to : turn.from]?.[singlePage || turn.direction === "prev" ? "leftPage" : "rightPage"],
    backPage: pages[singlePage && turn.direction === "prev" ? turn.from : turn.to]?.[singlePage ? "leftPage" : oppositePage],
  } : null;

  function cancelTurn() {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    turnLock.current = false;
  }

  useEffect(() => {
    gesture.current = null; setDrag(null);
    cancelTurn(); setLeafIndex(0); setTurn(null); setTurnPhase(null);
    return cancelTurn;
  }, [mediaOrderKey]);

  // Late dimension metadata can regroup pages. Never finish a turn against the old grouping.
  useEffect(() => {
    gesture.current = null; setDrag(null);
    cancelTurn(); setLeafIndex(0); setTurn(null); setTurnPhase(null);
  }, [pageLayoutKey]);

  useEffect(() => {
    const query = window.matchMedia(SINGLE_PAGE_QUERY);
    const syncLayout = () => {
      gesture.current = null; setDrag(null);
      cancelTurn(); setTurn(null); setTurnPhase(null); setSinglePage(query.matches);
    };
    query.addEventListener("change", syncLayout);
    return () => query.removeEventListener("change", syncLayout);
  }, []);

  useEffect(() => {
    const syncFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      if (ownsFullscreen.current && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);

  useModalBehavior(onClose, { enabled: open, onPrev: () => { turnPage(-1); }, onNext: () => { turnPage(1); } });

  function jumpToPage(next: number) {
    gesture.current = null; setDrag(null);
    cancelTurn(); setTurn(null); setTurnPhase(null);
    setLeafIndex(Math.min(Math.max(next, 0), Math.max(0, pages.length - 1)) * leavesPerView);
  }

  function turnPage(direction: -1 | 1) {
    if (turnLock.current || !pages.length) return;
    const nextIndex = Math.min(Math.max(currentPage + direction, 0), pages.length - 1);
    if (nextIndex === currentPage) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { jumpToPage(nextIndex); return; }
    turnLock.current = true;
    setTurn({ direction: direction > 0 ? "next" : "prev", from: currentPage, to: nextIndex }); setTurnPhase("departing");
    timers.current.push(window.setTimeout(() => { setTurnPhase("arriving"); setLeafIndex(nextIndex * leavesPerView); }, ALBUM_TURN_TIMING.swap));
    timers.current.push(window.setTimeout(() => { setTurnPhase("settling"); }, ALBUM_TURN_TIMING.oppositeSwap));
    timers.current.push(window.setTimeout(() => { setTurnPhase(null); setTurn(null); cancelTurn(); }, ALBUM_TURN_TIMING.duration));
  }

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    suppressClick.current = false;
    if (!singlePage || !event.isPrimary || event.pointerType === "mouse" || turnLock.current) return;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, width: event.currentTarget.clientWidth, claimed: false };
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (!start.claimed) {
      if (Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) { gesture.current = null; return; }
      if (Math.abs(dx) < 12 || Math.abs(dx) <= Math.abs(dy) * 1.25) return;
      start.claimed = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const atEdge = dx > 0 ? currentPage === 0 : currentPage === pages.length - 1;
    setDrag({ direction: dx < 0 ? "next" : "prev", progress: atEdge ? 0 : Math.min(.55, Math.abs(dx) / start.width) });
  }
  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    gesture.current = null; setDrag(null);
    if (!start || start.id !== event.pointerId || !start.claimed) return;
    suppressClick.current = true;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) >= Math.max(40, start.width * .14) && Math.abs(dx) > Math.abs(dy) * 1.25) turnPage(dx < 0 ? 1 : -1);
  }
  function pointerCancel() {
    suppressClick.current = Boolean(gesture.current?.claimed);
    gesture.current = null; setDrag(null);
  }
  function clickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!suppressClick.current) return;
    suppressClick.current = false; event.preventDefault(); event.stopPropagation();
  }

  async function toggleFullscreen() {
    setNotice("");
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); ownsFullscreen.current = false; }
      else { await document.documentElement.requestFullscreen(); ownsFullscreen.current = true; }
    } catch { setNotice("전체화면으로 전환하지 못했습니다. 창 크기를 늘려서 볼 수 있어요."); }
  }

  return { orderedItems, pages, currentPage, singlePage, visibleSpread, turning, turningLeaves, turnPhase,
    fullscreen, notice, drag, swipeHandlers: { onPointerDown: pointerDown, onPointerMove: pointerMove, onPointerUp: pointerUp, onPointerCancel: pointerCancel, onClickCapture: clickCapture }, jumpToPage, turnPage, toggleFullscreen };
}
