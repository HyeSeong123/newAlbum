// Playwright infers pkg by grepping ps output; substring PID matches can label
// a recreated WebView with another process name. pidof supplies exact app PIDs.
export function parseAppProcessIds(output) {
  if (typeof output !== 'string' || !/^\d+(?:\s+\d+)*$/.test(output.trim())) return [];
  return output.trim().split(/\s+/).map(Number).filter(id => Number.isSafeInteger(id) && id > 0);
}
export function selectAppWebView(views, processIds) {
  const current = new Set(processIds);
  return [...views].reverse().find(view => current.has(view.pid()));
}
