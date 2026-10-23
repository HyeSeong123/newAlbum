// Decode only visible video previews, at most two at a time. Players release their
// source immediately after capturing a frame; the grid never keeps video decoders.
const frames = new Map<string, Promise<string>>();
let pending = Promise.resolve();
let alternate = Promise.resolve();
export function videoThumbnail(source: string): Promise<string> {
  const cached = frames.get(source);
  if (cached) return cached;
  const request = pending.then(() => new Promise<string>((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.preload = 'auto';
    const finish = (result?: string) => {
      clearTimeout(timeout); video.onloadeddata = null; video.onseeked = null; video.onerror = null;
      video.removeAttribute('src'); video.load();
      if (result) resolve(result); else reject(new Error('동영상 미리보기를 만들 수 없습니다.'));
    };
    const capture = () => {
      if (!video.videoWidth || !video.videoHeight) return finish();
      const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      try { canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height); finish(canvas.toDataURL('image/jpeg', .85)); } catch { finish(); }
    };
    const timeout = window.setTimeout(() => finish(), 12_000);
    video.onloadeddata = () => {
      video.onloadeddata = null;
      if (video.duration > .2) { video.onseeked = capture; video.currentTime = Math.min(1, video.duration / 2); }
      else capture();
    };
    video.onerror = () => finish();
    video.src = source;
  }));
  pending = alternate; alternate = request.then(() => {}, () => {});
  if (frames.size >= 128) frames.delete(frames.keys().next().value!);
  frames.set(source, request);
  void request.catch(() => { if (frames.get(source) === request) frames.delete(source); });
  return request;
}
