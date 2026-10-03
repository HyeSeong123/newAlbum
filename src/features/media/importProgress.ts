export type MediaImportProgress = {
  phase: "selecting" | "scanning" | "copying" | "registering" | "region" | "album" | "finishing" | "recovering";
  processed: number;
  total: number;
  fileName?: string;
  bytesProcessed?: number;
  totalBytes?: number;
};

export function initialImportProgress(phase: MediaImportProgress["phase"]): MediaImportProgress {
  return { phase, processed: 0, total: 0 };
}
