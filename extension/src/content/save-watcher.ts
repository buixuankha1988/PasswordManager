import {
  discoverLoginFields,
  type LoginFormContext,
} from "./form-detect.js";
import { SavePrompt } from "./save-prompt.js";

type PendingLogin = {
  username: string;
  password: string;
  title: string;
  hostname: string;
  pathAtSubmit: string;
};

const hookedForms = new WeakSet<HTMLFormElement>();
const savePrompt = new SavePrompt();
const dismissed = new Set<string>();
let pending: PendingLogin | null = null;
let historyHooked = false;
let lastOfferedKey = "";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function sendMessage<T>(req: object): Promise<T> {
  return chrome.runtime.sendMessage(req) as Promise<T>;
}

function isLoginPath(path: string): boolean {
  return /login|signin|sign-in|dang-nhap|auth/i.test(path);
}

function dismissKey(p: PendingLogin): string {
  return `${p.hostname}|${p.username.toLowerCase()}`;
}

function readAttempt(ctx: LoginFormContext): PendingLogin | null {
  const password = ctx.password.value;
  if (!password) return null;
  const username = ctx.username?.value.trim() ?? "";
  if (!username) return null;
  return {
    username,
    password,
    title: document.title.split("|")[0]?.trim() || location.hostname,
    hostname: location.hostname.toLowerCase(),
    pathAtSubmit: location.pathname,
  };
}

function onLoginAttempt(ctx: LoginFormContext): void {
  const attempt = readAttempt(ctx);
  if (!attempt) return;
  pending = attempt;
  void sendMessage({ type: "LOGIN_ATTEMPT", ...attempt, fromPath: attempt.pathAtSubmit });
  void watchForSuccess(attempt);
}

function hookHistory(): void {
  if (historyHooked) return;
  historyHooked = true;
  const notify = () => {
    if (pending) void checkSuccessNow(pending);
  };
  window.addEventListener("popstate", notify);
  for (const fn of ["pushState", "replaceState"] as const) {
    const orig = history[fn];
    history[fn] = function (...args) {
      const ret = orig.apply(this, args as never);
      notify();
      return ret;
    };
  }
}

async function checkSuccessNow(snap: PendingLogin): Promise<void> {
  if (pending !== snap) return;
  if (loginSucceeded(snap)) {
    pending = null;
    await offerSave(snap);
  }
}

function loginSucceeded(snap: PendingLogin): boolean {
  const forms = discoverLoginFields();
  const leftLoginPath =
    snap.pathAtSubmit !== location.pathname &&
    !isLoginPath(location.pathname);
  const noLoginFields = forms.length === 0;
  const leftLoginArea = !isLoginPath(location.pathname) && isLoginPath(snap.pathAtSubmit);
  return noLoginFields || leftLoginPath || leftLoginArea;
}

async function watchForSuccess(snap: PendingLogin): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    if (pending !== snap) return;

    if (loginSucceeded(snap)) {
      pending = null;
      await offerSave(snap);
      return;
    }

    if (i >= 12 && isLoginPath(location.pathname) && discoverLoginFields().length > 0) {
      pending = null;
      return;
    }
  }
  pending = null;
}

const offeredThisSession = new Set<string>();

async function offerSave(data: PendingLogin): Promise<void> {
  const key = dismissKey(data);
  if (dismissed.has(key) || offeredThisSession.has(key)) return;
  offeredThisSession.add(key);
  lastOfferedKey = key;
  void sendMessage({ type: "CLEAR_PENDING_SAVE" });

  const state = await sendMessage<{ ok: boolean; state?: { configured: boolean } }>({
    type: "GET_STATE",
  });
  if (!state.ok || !state.state?.configured) return;

  const fill = await sendMessage<{
    ok: boolean;
    fill?: { unlocked: boolean; accounts: Array<{ id: string; username: string }> };
  }>({ type: "GET_FILL_CONTEXT", hostname: data.hostname });

  if (!fill.ok || !fill.fill) return;

  const existing = fill.fill.accounts.find(
    (a) =>
      a.username.toLowerCase() === data.username.toLowerCase(),
  );

  savePrompt.open(
    {
      headline: existing ? "Cập nhật tài khoản?" : "Lưu tài khoản?",
      site: data.hostname,
      username: data.username,
      title: existing?.title ?? data.title,
      unlocked: fill.fill.unlocked,
      isUpdate: !!existing,
    },
    {
      onDismiss: () => {
        dismissed.add(dismissKey(data));
        data.password = "";
      },
      onSave: async (title) => {
        const login = {
          id: existing?.id,
          title: title.trim() || data.title,
          url: data.hostname,
          username: data.username,
          password: data.password,
        };

        try {
          const res = await sendMessage<{
            ok: boolean;
            error?: string;
            message?: string;
          }>({ type: "SAVE_LOGIN", login });

          data.password = "";

          if (!res?.ok) {
            return res?.error ?? "Không kết nối extension. Thử reload extension.";
          }
          dismissed.add(dismissKey(data));
          return `OK:${res.message ?? "Đã lưu."}`;
        } catch {
          data.password = "";
          return "Extension không phản hồi — reload chrome://extensions.";
        }
      },
    },
  );
}

function hookForm(ctx: LoginFormContext): void {
  if (ctx.form && !hookedForms.has(ctx.form)) {
    hookedForms.add(ctx.form);
    ctx.form.addEventListener(
      "submit",
      () => {
        onLoginAttempt(ctx);
      },
      true,
    );
  }
}

function hookLoginButtons(): void {
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const btn = target.closest("button, input[type=submit], input[type=button]");
      if (!btn) return;
      const form = btn.closest("form");
      if (!form) return;
      const pwd = form.querySelector('input[type="password"]');
      if (!(pwd instanceof HTMLInputElement)) return;
      const ctx = discoverLoginFields().find(
        (c) => c.form === form || c.password === pwd,
      );
      if (ctx) onLoginAttempt(ctx);
    },
    true,
  );
}

async function checkPendingAfterNavigation(): Promise<void> {
  const res = await sendMessage<{
    ok: boolean;
    pendingSave?: {
      username: string;
      password: string;
      title: string;
      hostname: string;
    };
  }>({
    type: "TAKE_PENDING_SAVE",
    hostname: location.hostname.toLowerCase(),
    pathname: location.pathname,
  });
  if (!res.ok || !res.pendingSave) return;
  await offerSave({
    username: res.pendingSave.username,
    password: res.pendingSave.password,
    title: res.pendingSave.title,
    hostname: res.pendingSave.hostname,
    pathAtSubmit: "/login",
  });
}

export function initSaveWatcher(): void {
  hookHistory();
  hookLoginButtons();
  void checkPendingAfterNavigation();
}

export function syncSaveHooks(): void {
  for (const ctx of discoverLoginFields()) {
    hookForm(ctx);
  }
}
