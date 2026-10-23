import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Images, LoaderCircle } from 'lucide-react';
import { useModalBehavior } from '../hooks/useModalBehavior';
import '../features/media/mediaImportProgress.css';

export function GalleryCheckScreen() {
  const panel = useRef<HTMLDivElement>(null);
  useModalBehavior(() => {});
  useEffect(() => {
    const app = document.querySelector<HTMLElement>('main.app');
    const previousInert = app?.inert ?? false;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (app) app.inert = true;
    panel.current?.focus();
    return () => { if (app) app.inert = previousInert; if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);
  return createPortal(<div className="mediaImportScreen">
    <div ref={panel} className="mediaImportCard" role="dialog" aria-modal="true" aria-busy="true" aria-labelledby="galleryCheckTitle" tabIndex={-1}
      onKeyDown={event => { if (event.key === 'Tab') { event.preventDefault(); panel.current?.focus(); } }}>
      <div className="mediaImportIllustration" aria-hidden="true"><Images size={38} /><LoaderCircle className="mediaImportSpinner" size={86} /></div>
      <h2 id="galleryCheckTitle">갤러리와 사진을 비교하고 있어요</h2>
      <p className="mediaImportPhase" role="status">갤러리에서 삭제되거나 접근할 수 없는 원본이 있는지 확인해요.</p>
      <div className="mediaImportTrack" role="progressbar" aria-label="갤러리 비교 진행"><span className="indeterminate" /></div>
      <p className="mediaImportHint">확인을 마치면 자동으로 닫혀요.</p>
    </div>
  </div>, document.body);
}
