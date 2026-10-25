import type { LoginFormContext } from "./form-detect.js";
import {
  discoverLoginFields,
  fillLoginContext,
  setInputValue,
} from "./form-detect.js";
import { syncFieldIcons } from "./icon-anchor.js";
import { FillPanel } from "./panel.js";
import { initSaveWatcher, syncSaveHooks } from "./save-watcher.js";
import type { FillContext } from "../shared/messages.js";

const panel = new FillPanel();
let activeContext: LoginFormContext | null = null;

function sendMessage<T>(req: object): Promise<T> {
  return chrome.runtime.sendMessage(req) as Promise<T>;
}

function hostname(): string {
  return location.hostname.toLowerCase();
}

async function fetchFillContext(): Promise<FillContext | null> {
  const res = await sendMessage<{
    ok: boolean;
    fill?: FillContext;
    error?: string;
  }>({ type: "GET_FILL_CONTEXT", hostname: hostname() });
  if (!res.ok || !res.fill) return null;
  return res.fill;
}

async function openPanel(anchor: HTMLButtonElement): Promise<void> {
  panel.setHandlers({
    onPickAccount: (id) => void pickAccount(id),
    onUnlock: async (password) => {
      const res = await sendMessage<{ ok: boolean; error?: string }>({
        type: "UNLOCK",
        masterPassword: password,
      });
      if (!res.ok) return res.error ?? "Mở khóa thất bại.";
      const fill = await fetchFillContext();
      if (fill?.unlocked) {
        panel.openNear(anchor);
        panel.renderAccounts(fill);
      }
      return null;
    },
  });

  panel.openNear(anchor);
  const fill = await fetchFillContext();
  if (!fill) {
    panel.renderSetupRequired();
    return;
  }
  if (!fill.configured) {
    panel.renderSetupRequired();
    return;
  }
  if (!fill.unlocked) {
    panel.renderLocked();
    return;
  }
  panel.renderAccounts(fill);
}

async function pickAccount(id: string): Promise<void> {
  const res = await sendMessage<{
    ok: boolean;
    credentials?: { username: string; password: string };
    error?: string;
  }>({ type: "GET_LOGIN_CREDENTIALS", id });
  if (!res.ok || !res.credentials || !activeContext) return;
  if (!res.credentials.password) {
    console.warn("[Password Manager] Tài khoản không có mật khẩu trong vault — đăng nhập lại và Lưu khi vault đã mở khóa.");
    if (activeContext.username) {
      setInputValue(activeContext.username, res.credentials.username);
    }
    return;
  }
  fillLoginContext(
    activeContext,
    res.credentials.username,
    res.credentials.password,
  );
}

function scan(): void {
  const fields: Array<{ input: HTMLInputElement; ctx: LoginFormContext }> = [];
  for (const ctx of discoverLoginFields()) {
    fields.push({ input: ctx.password, ctx });
    if (ctx.username) fields.push({ input: ctx.username, ctx });
  }
  syncFieldIcons(fields, (ctx, anchor) => {
    activeContext = ctx;
    void openPanel(anchor);
  });
  syncSaveHooks();
}

let scanTimer: number | undefined;
function scheduleScan(): void {
  window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(scan, 120);
}

panel.setHandlers({
  onPickAccount: (id) => void pickAccount(id),
  onUnlock: async () => null,
});

document.addEventListener("mousedown", (e) => {
  if (
    !isInsidePanel(e) &&
    !(e.target as HTMLElement)?.closest?.(".pm-field-icon")
  ) {
    panel.close();
  }
});

function isInsidePanel(e: Event): boolean {
  return e.composedPath().some(
    (n) => n instanceof HTMLElement && n.id === "pm-fill-root",
  );
}

if (!document.getElementById("pm-field-icon-style")) {
  const st = document.createElement("style");
  st.id = "pm-field-icon-style";
  st.textContent = `
    button.pm-field-icon {
      border: none; padding: 0; cursor: pointer;
      border-radius: 50%; overflow: hidden;
      background: transparent;
      box-shadow: 0 1px 4px rgba(0,0,0,.22);
    }
    button.pm-field-icon:hover { filter: brightness(1.06); }
    button.pm-field-icon img {
      width: 100%; height: 100%; display: block;
      pointer-events: none; object-fit: cover;
    }
  `;
  document.documentElement.appendChild(st);
}

initSaveWatcher();
scheduleScan();
const mo = new MutationObserver(scheduleScan);
mo.observe(document.documentElement, { childList: true, subtree: true });
