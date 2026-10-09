import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaItem } from '../../types/media';
import type { PetView } from './engine/types';
import type { PetProgress } from './engine/manager';
export function usePetAnalysis() {
  const controller = useRef<AbortController | null>(null);
  const backlog = useRef<{items:MediaItem[]; petId?: number; views?:Record<string,PetView>}[]>([]);
  const mounted = useRef(true);
  const [progress, setProgress] = useState<PetProgress | null>(null);
  const start = useCallback((items: MediaItem[], petId?: number, views?:Record<string,PetView>) => {
    backlog.current.push({items:items.filter(item => item.fileType === 'image'),petId,views});
    if (controller.current) return;
    const abort = new AbortController(); controller.current = abort;
    void (async () => {
      const { scanPetBatch } = await import('./engine/manager');
      while (backlog.current.length && !abort.signal.aborted) {
        const batch = backlog.current.shift()!;
        await scanPetBatch(batch.items,abort.signal,value => { if (mounted.current) setProgress(value); }, batch.petId ? {petId:batch.petId,views:batch.views ?? {}} : undefined);
      }
    })().catch(error => { if (mounted.current) setProgress({ done:0,total:0,failed:1,detected:0,running:false,message:error instanceof Error ? error.message : '반려동물 분석을 시작하지 못했습니다.' }); })
      .finally(() => { controller.current = null; });
  }, []);
  useEffect(() => {
    mounted.current = true;
    const imported = (event: Event) => start((event as CustomEvent<MediaItem[]>).detail);
    const enrolled = (event:Event) => {const {items,petId,views}=(event as CustomEvent).detail;start(items,petId,views);};
    window.addEventListener('gamjassak-pet-import', imported);
    window.addEventListener('gamjassak-pet-enroll', enrolled);
    return () => { mounted.current = false; controller.current?.abort(); backlog.current = []; window.removeEventListener('gamjassak-pet-import', imported);window.removeEventListener('gamjassak-pet-enroll',enrolled); };
  }, [start]);
  return { progress, cancel: () => { backlog.current = []; controller.current?.abort(); }, dismiss: () => setProgress(null) };
}
