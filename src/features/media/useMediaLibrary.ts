import { useEffect, useMemo, useRef, useState } from "react";
import type { MediaItem, SavedAlbum } from "../../types/media";
import * as api from "../../services/tauriMediaService";
import { createKeyedTaskQueue } from "../../services/keyedTaskQueue";
import { browserImportItems, retainMediaEdits } from "./browserImport";
import { syncAlbumMedia } from "./journalModel";
import { REGION_NAMES } from "../map/regions";

type LibraryState = { items: MediaItem[]; albums: SavedAlbum[]; loaded: boolean };

export function useMediaLibrary() {
  const desktop = api.isTauriRuntime();
  const [state, setState] = useState<LibraryState>({ items: [], albums: [], loaded: !desktop });
  const [albumsLoaded, setAlbumsLoaded] = useState(!desktop);
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
  const [importNotice, setImportNotice] = useState("");
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
      if (!disposed) {
        if (albumVersion === albumRevision.current) publish({ albums: records });
        setAlbumsLoaded(true);
      }
    }).catch(() => { if (!disposed) setError("앨범 목록을 불러오지 못했습니다. 앱을 다시 실행해 주세요."); });
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

  async function register(kind: "files" | "folder"): Promise<MediaItem[]> {
    if (locked.current) return [];
    locked.current = true;
    setImporting(kind); setError(""); setImportNotice("");
    try {
      const registered = kind === "files" ? await api.chooseAndRegisterFiles() : await api.chooseAndRegisterFolder();
      const before = new Set(current.current.items.map(item => item.id));
      if (registered.length) {
        mediaRevision.current++;
        const items = retainMediaEdits(registered, current.current.items).map((item) => ({ ...item, ...pendingMediaEdits.current.get(item.id) }));
        publish({ items, loaded: true });
        pendingMediaEdits.current.clear();
        const added = items.filter(item => !before.has(item.id));
        setImportNotice(added.length ? `사진과 영상 ${added.length}개를 가져왔습니다.` : "새로 가져올 사진과 영상이 없습니다.");
        return added;
      }
    } catch {
      try {
        const before = new Set(current.current.items.map(item => item.id));
        const latest = await api.loadRegisteredMedia();
        const added = latest.filter(item => !before.has(item.id)).length;
        mediaRevision.current++;
        publish({ items: retainMediaEdits(latest, current.current.items), loaded: true });
        setError(added ? `${added}개 파일은 가져왔습니다. 나머지 파일은 가져오지 못했습니다. 등록된 사진은 그대로 남아 있습니다. 다시 가져오기를 시도해 주세요.` : "사진과 영상을 가져오지 못했습니다. 이미 등록된 사진은 그대로 남아 있습니다. 다시 시도해 주세요.");
      } catch { setError("사진과 영상을 가져오던 중 문제가 발생했습니다. 등록된 사진을 확인한 뒤 다시 시도해 주세요."); }
    }
    finally { locked.current = false; setImporting(null); }
    return [];
  }

  async function importIntoAlbum(title: string) {
    const added = await register("files");
    if (!added.length) return false;
    try { await createAlbum(title, "#B9C58E", added); return true; } catch { setError("사진은 등록했지만 앨범을 만들지 못했습니다. 다시 앨범을 만들어 주세요."); return false; }
  }
  async function handleFilesIntoAlbum(files: FileList | null, title: string) {
    if (!title.trim()) { handleFiles(files, "files"); return false; }
    const before = new Set(current.current.items.map(item => item.id));
    handleFiles(files, "files");
    const added = current.current.items.filter(item => !before.has(item.id));
    if (!added.length) return false;
    try { await createAlbum(title.trim(), "#B9C58E", added); return true; } catch { setError("사진은 등록했지만 앨범을 만들지 못했습니다. 다시 앨범을 만들어 주세요."); return false; }
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
    setImporting(kind); setError(""); setImportNotice("");
    try {
      const added = browserImportItems(files, current.current.items);
      if (!added.length) { setImportNotice("새로 가져올 사진과 영상이 없습니다."); return; }
      added.forEach((item) => { if (item.previewUrl) urls.current.add(item.previewUrl); });
      mediaRevision.current++;
      publish({ items: [...added, ...current.current.items], loaded: true });
      setImportNotice(`사진과 영상 ${added.length}개를 가져왔습니다.`);
    } catch { setError("선택한 파일을 읽지 못했습니다. 이미 등록된 사진은 그대로 남아 있습니다. 다시 시도해 주세요."); }
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

  async function saveTitle(id: string, value: string) {
    const title = value.trim();
    if (title.length > 120) throw new Error("제목은 120자 이내로 입력해 주세요.");
    await write.current(id, async () => {
      if (desktop) await api.saveMediaTitle(id, title);
      // Publish only after persistence succeeds, using the latest media state.
      // A title-only write cannot overwrite a concurrent rating or comment edit.
      patchMedia(id, { title }, false);
    });
  }

  async function assignRegion(ids: string[], regionCode: string, district = "", country = "", city = "") {
    if ((!REGION_NAMES[regionCode] && regionCode !== "overseas") || !ids.length) throw new Error("지역과 기록을 선택해 주세요.");
    await write.current("locations", async () => {
      if (desktop) await api.assignMediaRegion(ids, regionCode, district, country, city);
      const selected = new Set(ids);
      const patch: Partial<MediaItem> = { regionCode, regionName: REGION_NAMES[regionCode] ?? "해외", district: regionCode === "overseas" ? "" : district, country: regionCode === "overseas" ? country : "", city: regionCode === "overseas" ? city : "", locationSource: "manual", locationStatus: "ready" };
      const update = (item: MediaItem) => selected.has(item.id) ? { ...item, ...patch } : item;
      if (!current.current.loaded) {
        // Albums can open before the initial library query finishes. Keep its
        // response valid and merge this edit when it arrives.
        for (const id of ids) pendingMediaEdits.current.set(id, { ...pendingMediaEdits.current.get(id), ...patch });
        publish({ albums: current.current.albums.map(album => ({ ...album, items: album.items.map(update) })) });
      } else {
        mediaRevision.current++;
        publish({ items: current.current.items.map(update) });
      }
    });
  }

  async function refreshLocations() {
    if (!desktop) return;
    await write.current("locations", async () => {
      const records = new Map((await api.loadRegisteredMedia()).map(item => [item.id, item]));
      mediaRevision.current++;
      if (!current.current.loaded) {
        publish({ items: [...records.values()].map(item => ({ ...item, ...pendingMediaEdits.current.get(item.id) })), loaded: true });
        pendingMediaEdits.current.clear();
        return;
      }
      publish({ items: current.current.items.map(item => {
        const location = records.get(item.id);
        return location ? { ...item, latitude: location.latitude, longitude: location.longitude,
          regionCode: location.regionCode, regionName: location.regionName,
          district: location.district, country: location.country, city: location.city,
          locationSource: location.locationSource, locationStatus: location.locationStatus } : item;
      }) });
    });
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

  return { desktop, loaded: state.loaded && albumsLoaded, importIntoAlbum, handleFilesIntoAlbum, items: state.items, itemsById, albums, importing, importNotice, clearing, error, fileInput, folderInput,
    chooseFiles, chooseFolder, handleFiles, patchMedia, saveTitle, assignRegion, refreshLocations, recordView, removeMedia, createAlbum, saveAlbum, deleteAlbums };
}
