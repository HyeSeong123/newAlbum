// Android WebView changes its visual viewport when the keyboard appears.
// Update geometry without remounting forms or changing their focus.
export function observeMobileViewport() {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const update = () => {
    if (Math.abs(viewport.scale - 1) > .02) return;
    document.documentElement.style.setProperty('--app-viewport-height', `${viewport.height}px`);
    document.documentElement.style.setProperty('--app-viewport-top', `${viewport.offsetTop}px`);
  };
  update();
  viewport.addEventListener('resize', update);
  viewport.addEventListener('scroll', update);
}
