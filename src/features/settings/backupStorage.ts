import { invoke } from "@tauri-apps/api/core";

export function hasBackupBridge() {
  return (window as Window & { __GOMGOMI_BACKUP__?: boolean }).__GOMGOMI_BACKUP__ === true;
}

export type BrowserRecords = Record<string, string>;
export type BackupCounts = { media: number; albums: number; diaries: number; characters: number };
export type BackupPreview = { current: BackupCounts; restored: BackupCounts; token: string };
export type Recovery = { mode: "restore" | "undo"; storage: BrowserRecords };

export function backupCommand<T>(action: string, args: { storage?: BrowserRecords; token?: string } = {}) {
  return invoke<T>("android_backup_action", { action, ...args });
}

const prefixes = ["gamjassak:", "oraedameun.", "warm-journal-", "geuruteogi."];
function owned(key: string) { return prefixes.some(prefix => key.startsWith(prefix)); }

export function readRecords(store: Storage): BrowserRecords {
  const records: BrowserRecords = {};
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key && owned(key)) records[key] = store.getItem(key)!;
  }
  return records;
}

export function replaceRecords(store: Storage, records: BrowserRecords) {
  if (!Object.entries(records).every(([key, value]) => owned(key) && typeof value === "string")) {
    throw new Error("앱 기록 형식을 확인할 수 없습니다.");
  }
  for (const key of Object.keys(readRecords(store))) store.removeItem(key);
  for (const [key, value] of Object.entries(records)) store.setItem(key, value);
}
