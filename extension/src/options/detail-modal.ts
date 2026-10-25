import { copyToClipboard } from "../shared/clipboard.js";
import { sendBg } from "../shared/messages.js";
import { hostFromUrl } from "../popup/accounts-tree.js";

let detailAccountId: string | null = null;
let detailUrl = "";
let cachedUsername = "";
let cachedPassword = "";

const overlay = () => document.getElementById("detail-modal")!;
const titleEl = () => document.getElementById("detail-title")!;
const siteEl = () => document.getElementById("detail-site")!;
const userInput = () => document.getElementById("detail-username") as HTMLInputElement;
const passMask = () => document.getElementById("detail-password-mask")!;
const passInput = () => document.getElementById("detail-password") as HTMLInputElement;
const copyMsg = () => document.getElementById("detail-copy-msg")!;
const passEyeBtn = () =>
  document.getElementById("detail-toggle-pass") as HTMLButtonElement | null;

let wired = false;

function setPassEyeRevealing(revealing: boolean): void {
  passEyeBtn()?.classList.toggle("is-revealing", revealing);
}

function maskDots(len: number): string {
  const n = Math.min(12, Math.max(8, len || 8));
  return "•".repeat(n);
}

function hidePasswordInDom(): void {
  passInput().value = "";
  passInput().classList.add("hidden");
  passMask().classList.remove("hidden");
  setPassEyeRevealing(false);
}

function showPasswordInDom(): void {
  if (!cachedPassword) return;
  passMask().classList.add("hidden");
  passInput().classList.remove("hidden");
  passInput().value = cachedPassword;
  setPassEyeRevealing(true);
}

function closeDetail(): void {
  hidePasswordInDom();
  overlay().classList.add("hidden");
  overlay().setAttribute("aria-hidden", "true");
  cachedPassword = "";
  cachedUsername = "";
  detailAccountId = null;
  copyMsg.textContent = "";
  userInput().value = "";
}

async function copyAndNotify(text: string, label: string): Promise<void> {
  copyMsg.textContent = "";
  copyMsg.className = "form-msg";
  if (!text) {
    copyMsg.textContent = `Không có ${label} để copy.`;
    copyMsg.classList.add("err");
    return;
  }
  const ok = await copyToClipboard(text, 45_000);
  if (ok) {
    copyMsg.textContent = `Đã copy ${label}. Clipboard tự xóa sau ~45 giây.`;
    copyMsg.classList.add("ok");
    hidePasswordInDom();
  } else {
    copyMsg.textContent = "Không copy được — thử lại nút Copy pass.";
    copyMsg.classList.add("err");
  }
}

function wireHoldToViewButton(btn: HTMLButtonElement): void {
  btn.addEventListener("pointerdown", (e) => {
    if (btn.disabled || !cachedPassword) return;
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    showPasswordInDom();
  });
  const endHold = (e: PointerEvent) => {
    if (btn.hasPointerCapture(e.pointerId)) {
      btn.releasePointerCapture(e.pointerId);
    }
    hidePasswordInDom();
  };
  btn.addEventListener("pointerup", endHold);
  btn.addEventListener("pointercancel", () => hidePasswordInDom());
  btn.addEventListener("lostpointercapture", () => hidePasswordInDom());
  btn.addEventListener("click", (e) => e.preventDefault());
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
}

export function initDetailModal(handlers: {
  onOpenWeb: (url: string, id: string) => void;
  onEdit: (id: string) => void;
}): void {
  if (wired) return;
  wired = true;

  document.getElementById("detail-close")?.addEventListener("click", closeDetail);
  overlay().addEventListener("click", (e) => {
    if (e.target === overlay()) closeDetail();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay().classList.contains("hidden")) closeDetail();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && !overlay().classList.contains("hidden")) {
      hidePasswordInDom();
    }
  });

  window.addEventListener("blur", () => {
    if (!overlay().classList.contains("hidden")) hidePasswordInDom();
  });

  userInput().addEventListener("click", () => {
    userInput().focus();
    userInput().select();
  });

  const viewPassBtn = document.getElementById("detail-toggle-pass") as HTMLButtonElement | null;
  if (viewPassBtn) wireHoldToViewButton(viewPassBtn);

  document.getElementById("detail-copy-user")?.addEventListener("click", () => {
    void copyAndNotify(cachedUsername, "tên đăng nhập");
  });
  document.getElementById("detail-copy-pass")?.addEventListener("click", () => {
    void copyAndNotify(cachedPassword, "mật khẩu");
  });
  document.getElementById("detail-open-web")?.addEventListener("click", () => {
    if (detailAccountId && detailUrl) {
      handlers.onOpenWeb(detailUrl, detailAccountId);
    }
  });
  document.getElementById("detail-edit")?.addEventListener("click", () => {
    if (detailAccountId) {
      const id = detailAccountId;
      closeDetail();
      handlers.onEdit(id);
    }
  });
}

export async function openAccountDetail(
  item: { id: string; title: string; url: string; username: string },
): Promise<void> {
  overlay().classList.remove("hidden");
  overlay().setAttribute("aria-hidden", "false");
  copyMsg.textContent = "Đang tải…";
  copyMsg.className = "form-msg";

  const res = await sendBg({ type: "GET_LOGIN_CREDENTIALS", id: item.id });

  detailAccountId = item.id;
  detailUrl = item.url;
  const host = hostFromUrl(item.url);
  titleEl().textContent = item.title.trim() || host;
  siteEl().textContent = host;

  cachedUsername = res.credentials?.username ?? item.username;
  cachedPassword = res.ok && res.credentials ? res.credentials.password : "";

  userInput().value = cachedUsername;
  passMask().textContent = maskDots(cachedPassword.length);
  hidePasswordInDom();

  const passCopyBtn = document.getElementById("detail-copy-pass") as HTMLButtonElement | null;
  const toggleBtn = document.getElementById("detail-toggle-pass") as HTMLButtonElement | null;
  if (passCopyBtn) passCopyBtn.disabled = !cachedPassword;
  if (toggleBtn) toggleBtn.disabled = !cachedPassword;

  copyMsg.textContent = "";
  copyMsg.className = "form-msg";
  if (!res.ok) {
    copyMsg.textContent = res.error ?? "Không đọc được vault — mở khóa lại.";
    copyMsg.classList.add("err");
  } else if (!cachedPassword) {
    copyMsg.textContent = "Tài khoản này không có mật khẩu trong vault.";
    copyMsg.classList.add("err");
  }

  userInput().focus();
}
