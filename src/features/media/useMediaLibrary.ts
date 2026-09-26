import { useEffect, useMemo, useRef, useState } from "react";
import type { MediaItem, SavedAlbum } from "../../types/media";
import * as api from "../../services/tauriMediaService";
import { createKeyedTaskQueue } from "../../services/keyedTaskQueue";
import { browserImportItems, retainMediaEdits } from "./browserImport";
import { syncAlbumMedia } from "./journalModel";

type LibraryState = { items: MediaItem[]; albums: SavedAlbum[]; loaded: boolean };

export function useMediaLibrary() {
  const desktop = api.isTauriRuntime();
  const [state, setState] = useState<LibraryState>({ items: [], albums: [], loaded: !desktop });
  const current = useRef(state);
  const mediaRevision = useRef(0);
  const pendingMediaEdits = useRef(new Map<string, Partial<MediaItem>>());
  const albumRevision = useRef(0);
  const urls = useRef(new Set<string>());
  const write = useRef(createKeyedTaskQueue());
  const locked = useRef(false);
  const [importing, setImporting] = useState<"files" | "folder" | null>(null);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const albums = useMemo(() => syncAlbumMedia(state.albums, state.items, state.loaded), [state]);
  const itemsById = useMemo(() => {
    const entries = state.loaded ? state.items : [...albums.flatMap((album) => album.items), ...state.items];
    return new Map(entries.map((item) => [item.id, item]));
  }, [state.items, state.loaded, albums]);

  function publish(patch: Partial<LibraryState>) {
    current.current = { ...current.current, ...patch };
    setState(current.current);
  }

  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    const mediaVersion = mediaRevision.current;
    const albumVersion = albumRevision.current;
    void api.loadRegisteredMedia().then((items) => {
      if (!disposed && mediaVersion === mediaRevision.current) {
        publish({ items: items.map((item) => ({ ...item, ...pendingMediaEdits.current.get(item.id) })), loaded: true });
        pendingMediaEdits.current.clear();
      }
    }).catch(() => { if (!disposed) setError("등록된 미디어를 불러오지 못했습니다."); });
    void api.loadSavedAlbums().then((records) => {
      if (!disposed && albumVersion === albumRevision.current) publish({ albums: records });
    }).catch(() => { if (!disposed) setError("앨범 목록을 불러오지 못했습니다."); });
    return () => { disposed = true; };
  }, [desktop]);

  useEffect(() => {
    const owned = urls.current;
    return () => { owned.forEach((url) => URL.revokeObjectURL(url)); owned.clear(); };
  }, []);

  useEffect(() => {
    const retained = new Set(state.items.flatMap((item) => item.previewUrl ? [item.previewUrl] : []));
    for (const album of albums) for (const item of album.items) if (item.previewUrl) retained.add(item.previewUrl);
    urls.current.forEach((url) => {
      if (!retained.has(url)) { URL.revokeObjectURL(url); urls.current.delete(url); }
    });
  }, [state.items, albums]);

  async function register(kind: "files" | "folder") {
    if (locked.current) return;
    locked.current = true;
    setImporting(kind); setError("");
    try {
      const registered = kind === "files" ? await api.chooseAndRegisterFiles() : await api.chooseAndRegisterFolder();
      if (registered.length) {
        mediaRevision.current++;
        const items = retainMediaEdits(registered, current.current.items).map((item) => ({ ...item, ...pendingMediaEdits.current.get(item.id) }));
        publish({ items, loaded: true });
        pendingMediaEdits.current.clear();
      }
    } catch { setError("미디어를 등록하지 못했습니다. 다시 시도해 주세요."); }
    finally { locked.current = false; setImporting(null); }
  }

  function chooseFiles() {
    if (locked.current) return;
    if (desktop) void register("files"); else fileInput.current?.click();
  }

  function chooseFolder() {
    if (locked.current) return;
    if (desktop) void register("folder"); else folderInput.current?.click();
  }

  function handleFiles(files: FileList | null, kind: "files" | "folder") {
    if (!files?.length || locked.current) return;
    setImporting(kind); setError("");
    try {
      const added = browserImportItems(files, current.current.items);
      if (!added.length) return;
      added.forEach((item) => { if (item.previewUrl) urls.current.add(item.previewUrl); });
      mediaRevision.current++;
      publish({ items: [...added, ...current.current.items], loaded: true });
    } catch { setError("선택한 파일을 읽지 못했습니다. 다시 시도해 주세요."); }
    finally { setImporting(null); }
  }

  function patchMedia(id: string, patch: Partial<MediaItem> | ((item: MediaItem) => Partial<MediaItem>), persist = true) {
    const item = current.current.items.find((entry) => entry.id === id)
      ?? (!current.current.loaded ? current.current.albums.flatMap((album) => album.items).find((entry) => entry.id === id) : undefined);
    if (!item) return;
    const changes = typeof patch === "function" ? patch(item) : patch;
    const updated = { ...item, ...changes, id };
    if (!current.current.loaded) {
      pendingMediaEdits.current.set(id, { ...pendingMediaEdits.current.get(id), ...changes });
      publish({ albums: current.current.albums.map((album) => ({ ...album, items: album.items.map((entry) => entry.id === id ? updated : entry) })) });
    } else {
      mediaRevision.current++;
      publish({ items: current.current.items.map((entry) => entry.id === id ? updated : entry) });
    }
    if (desktop && persist) void write.current(id, () => api.saveMediaDetails(updated))
      .catch(() => setError("미디어 정보를 저장하지 못했습니다. 변경한 항목을 다시 저장해 주세요."));
  }

  function recordView(id: string) {
    patchMedia(id, (item) => ({ viewCount: (item.viewCount ?? 0) + 1 }), false);
    if (desktop) void write.current(id, () => api.incrementMediaView(id))
      .catch(() => setError("조회수를 저장하지 못했습니다."));
  }

  async function removeMedia(ids?: Set<string>): Promise<boolean> {
    if (locked.current) return false;
    locked.current = true;
    if (!ids) setClearing(true);
    setError("");
    try {
      if (desktop) {
        const removedIds = ids ? [...ids] : current.current.items.map((item) => item.id);
        await Promise.all(removedIds.map((id) => write.current(id, async () => {})));
      }
      const remaining = desktop
        ? ids ? await api.deleteRegisteredMedia([...ids]) : await api.clearRegisteredMedia()
        : ids ? current.current.items.filter((item) => !ids.has(item.id)) : [];
      const items = retainMediaEdits(remaining, current.current.items);
      mediaRevision.current++;
      pendingMediaEdits.current.clear();
      publish({ items, loaded: true, albums: syncAlbumMedia(current.current.albums, items) });
      return true;
    } catch { setError("등록 목록을 변경하지 못했습니다. 다시 시도해 주세요."); return false; }
    finally { locked.current = false; setClearing(false); }
  }

  async function createAlbum(title: string, coverColor: string, items: MediaItem[]) {
    await write.current("albums", async () => {
      if (desktop) {
        await api.createAlbumFromMedia(title, items.map((item) => item.id), coverColor);
        const albums = await api.loadSavedAlbums();
        albumRevision.current++;
        publish({ albums });
      } else {
        albumRevision.current++;
        publish({ albums: [{ id: `local-album-${crypto.randomUUID()}`, title, description: "", createdAt: new Date().toISOString(), coverColor, items }, ...current.current.albums] });
      }
    });
  }

  async function saveAlbum(album: SavedAlbum) {
    await write.current("albums", async () => {
      if (desktop) await api.saveAlbum(album);
      albumRevision.current++;
      publish({ albums: current.current.albums.map((entry) => entry.id === album.id ? album : entry) });
    });
  }

  async function deleteAlbums(ids: string[]) {
    await write.current("albums", async () => {
      if (desktop) await api.deleteAlbums(ids);
      albumRevision.current++;
      const removed = new Set(ids);
      publish({ albums: current.current.albums.filter((album) => !removed.has(album.id)) });
    });
  }

  return { items: state.items, itemsById, albums, importing, clearing, error, fileInput, folderInput,
    chooseFiles, chooseFolder, handleFiles, patchMedia, recordView, removeMedia, createAlbum, saveAlbum, deleteAlbums };
}
