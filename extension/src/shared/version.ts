/** Hiển thị version từ manifest (đồng bộ với chrome://extensions). */
export function showAppVersion(elementId = "app-version"): void {
  const el = document.getElementById(elementId);
  if (!el) return;
  const v = chrome.runtime.getManifest().version;
  el.textContent = `v${v}`;
  el.title = `Password Manager ${v}`;
}
