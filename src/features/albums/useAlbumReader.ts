import { useEffect, useMemo, useRef, useState } from "react";
import type { MediaItem } from "../../types/media";
import { makeAlbumSpreads, shuffleAlbumItems, uniqueAlbumItems } from "../media/journalModel";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import { ALBUM_TURN_TIMING } from "./albumAnimation";

export function useAlbumReader(items: MediaItem[], open: boolean, onClose: () => void) {
  const [order, setOrder] = useState<string[] | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [turn, setTurn] = useState<{ direction: "next" | "prev"; from: number; to: number } | null>(null);
  const turning = turn?.direction ?? null;
  const [turnPhase, setTurnPhase] = useState<"departing" | "arriving" | "settling" | null>(null);
  const [listView, setListView] = useState(false);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [notice, setNotice] = useState("");
  const timers = useRef<number[]>([]);
  const turnLock = useRef(false);
  const ownsFullscreen = useRef(false);
  const albumItems = useMemo(() => uniqueAlbumItems(items), [items]);
  const mediaOrderKey = useMemo(() => JSON.stringify(albumItems.map((item) => item.id)), [albumItems]);
  const orderedItems = useMemo(() => {
    if (!order) return albumItems;
    const byId = new Map(albumItems.map((item) => [item.id, item]));
    const shuffled = order.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []);
    return shuffled.length === albumItems.length ? shuffled : albumItems;
  }, [albumItems, order]);
  const pages = useMemo(() => makeAlbumSpreads(orderedItems), [orderedItems]);
  const currentPage = Math.min(pageIndex, Math.max(0, pages.length - 1));
  const oppositeSide = turn?.direction === "next" ? "left" : "right";
  // Keep the opposite print in place until the turning leaf is almost flat.
  const visibleSpread = turn && turnPhase !== "settling" && pages[currentPage] ? {
    ...pages[currentPage], [oppositeSide]: pages[turn.from]?.[oppositeSide] ?? [],
  } : pages[currentPage];
  const turningLeaves = turn ? {
    front: pages[turn.from]?.[turn.direction === "next" ? "right" : "left"] ?? [],
    back: pages[turn.to]?.[oppositeSide] ?? [],
  } : null;

  function cancelTurn() {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    turnLock.current = false;
  }

  useEffect(() => {
    cancelTurn(); setOrder(null); setPageIndex(0); setTurn(null); setTurnPhase(null);
    return cancelTurn;
  }, [mediaOrderKey]);

  useEffect(() => {
    const syncFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      if (ownsFullscreen.current && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);

  useModalBehavior(onClose, { enabled: open, onPrev: () => { if (!listView) turnPage(-1); }, onNext: () => { if (!listView) turnPage(1); } });

  function resetOrder(shuffle: boolean) {
    cancelTurn(); setTurn(null); setTurnPhase(null); setPageIndex(0);
    setOrder(shuffle ? shuffleAlbumItems(albumItems).map((item) => item.id) : null);
  }

  function jumpToPage(next: number) {
    cancelTurn(); setTurn(null); setTurnPhase(null);
    setPageIndex(Math.min(Math.max(next, 0), Math.max(0, pages.length - 1)));
  }

  function turnPage(direction: -1 | 1) {
    if (turnLock.current || !pages.length) return;
    const nextIndex = Math.min(Math.max(currentPage + direction, 0), pages.length - 1);
    if (nextIndex === currentPage) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { jumpToPage(nextIndex); return; }
    turnLock.current = true;
    setTurn({ direction: direction > 0 ? "next" : "prev", from: currentPage, to: nextIndex }); setTurnPhase("departing");
    timers.current.push(window.setTimeout(() => { setTurnPhase("arriving"); setPageIndex(nextIndex); }, ALBUM_TURN_TIMING.swap));
    timers.current.push(window.setTimeout(() => { setTurnPhase("settling"); }, ALBUM_TURN_TIMING.oppositeSwap));
    timers.current.push(window.setTimeout(() => { setTurnPhase(null); setTurn(null); cancelTurn(); }, ALBUM_TURN_TIMING.duration));
  }

  async function toggleFullscreen() {
    setNotice("");
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); ownsFullscreen.current = false; }
      else { await document.documentElement.requestFullscreen(); ownsFullscreen.current = true; }
    } catch { setNotice("전체화면으로 전환하지 못했습니다. 창 크기를 늘려서 볼 수 있어요."); }
  }

  function toggleListView() {
    cancelTurn(); setTurn(null); setTurnPhase(null); setListView((current) => !current);
  }

  return { order, orderedItems, pages, currentPage, visibleSpread, turning, turningLeaves, turnPhase,
    listView, fullscreen, notice, resetOrder, jumpToPage, turnPage, toggleFullscreen, toggleListView };
}
