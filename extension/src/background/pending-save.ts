const TTL_MS = 90_000;

export type PendingSaveAttempt = {
  username: string;
  password: string;
  title: string;
  hostname: string;
  fromPath: string;
  at: number;
};

const byTab = new Map<number, PendingSaveAttempt>();

function isLoginPath(path: string): boolean {
  return /login|signin|sign-in|dang-nhap|auth/i.test(path);
}

export function rememberLoginAttempt(
  tabId: number,
  attempt: Omit<PendingSaveAttempt, "at">,
): void {
  byTab.set(tabId, { ...attempt, at: Date.now() });
}

export function clearLoginAttempt(tabId: number): void {
  byTab.delete(tabId);
}

export function takePendingSave(
  tabId: number,
  hostname: string,
  pathname: string,
): PendingSaveAttempt | null {
  const row = byTab.get(tabId);
  if (!row) return null;
  if (Date.now() - row.at > TTL_MS) {
    byTab.delete(tabId);
    return null;
  }
  if (row.hostname !== hostname.toLowerCase()) return null;
  if (isLoginPath(pathname)) return null;
  if (!isLoginPath(row.fromPath) && row.fromPath === pathname) return null;

  byTab.delete(tabId);
  return row;
}

export function hookTabNavigation(): void {
  chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (info.status !== "complete" || !tab.url) return;
    let url: URL;
    try {
      url = new URL(tab.url);
    } catch {
      return;
    }
    if (!url.protocol.startsWith("http")) return;
    const row = byTab.get(tabId);
    if (!row) return;
    if (url.hostname.toLowerCase() !== row.hostname) return;
    if (isLoginPath(url.pathname)) return;
    // Giữ pending — content script trang đích sẽ TAKE_PENDING_SAVE.
  });
}
