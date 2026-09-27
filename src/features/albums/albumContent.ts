import type { AlbumContent, MediaItem, SavedAlbum } from "../../types/media";
import { makeAlbumSpreads } from "../media/journalModel";

export function albumContents(album: Pick<SavedAlbum, "items" | "contents">): AlbumContent[] {
  const media = new Map(album.items.map(item => [item.id, item]));
  if (album.contents !== undefined) return album.contents.filter(entry =>
    entry.kind === "CHAPTER" || entry.kind === "TEXT" || media.has(entry.mediaId ?? ""));
  return album.items.map((item, index) => ({
    id: `media-${item.id}-${index}`, kind: item.fileType === "image" ? "PHOTO" : item.fileType === "video" ? "VIDEO" : "AUDIO",
    mediaId: item.id, title: "", body: "", displayDuration: 5, transitionType: "fade", commentVisible: true,
  }));
}

export function writtenPage(kind: "CHAPTER" | "TEXT"): AlbumContent {
  return { id: crypto.randomUUID(), kind, title: "", body: "", displayDuration: 5, transitionType: "fade", commentVisible: true };
}

export function albumListContents(items: MediaItem[], contents?: AlbumContent[], diariesOnly = false): AlbumContent[] {
  // Written albums retain their saved sequence; photo-only albums retain shuffle order.
  const hasWrittenPages = contents?.some(entry => entry.kind === "TEXT" || entry.kind === "CHAPTER");
  const entries = albumContents({ items, contents: hasWrittenPages ? contents : undefined });
  return diariesOnly ? entries.filter(entry => entry.kind === "TEXT") : entries;
}

export function moveContent(entries: AlbumContent[], index: number, target: number): AlbumContent[] {
  if (target < 0 || target >= entries.length || index < 0 || index >= entries.length) return entries;
  const result = [...entries];
  result.splice(target, 0, ...result.splice(index, 1));
  return result;
}

export type BookSpread = { left: MediaItem[]; right: MediaItem[]; leftPage?: AlbumContent; rightPage?: AlbumContent };
export function makeBookSpreads(items: MediaItem[], contents?: AlbumContent[]): BookSpread[] {
  if (!contents?.some(entry => entry.kind === "CHAPTER" || entry.kind === "TEXT")) return makeAlbumSpreads(items);
  const byId = new Map(items.map(item => [item.id, item]));
  const leaves: { items: MediaItem[]; page?: AlbumContent }[] = [];
  let section: MediaItem[] = [];
  const flush = () => {
    for (const spread of makeAlbumSpreads(section)) {
      if (spread.left.length) leaves.push({ items: spread.left });
      if (spread.right.length) leaves.push({ items: spread.right });
    }
    section = [];
  };
  for (const entry of contents) {
    if (entry.kind === "CHAPTER" || entry.kind === "TEXT") {
      flush(); leaves.push({ items: [], page: entry });
    } else {
      const item = byId.get(entry.mediaId ?? "");
      if (item) section.push(item);
    }
  }
  flush();
  const spreads: BookSpread[] = [];
  for (let index = 0; index < leaves.length; index += 2) spreads.push({
    left: leaves[index].items, right: leaves[index + 1]?.items ?? [],
    leftPage: leaves[index].page, rightPage: leaves[index + 1]?.page,
  });
  return spreads;
}
