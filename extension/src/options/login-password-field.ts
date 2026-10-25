import { copyToClipboard } from "../shared/clipboard.js";
import {
  DEFAULT_PASSWORD_GEN,
  generatePassword,
  passwordStrengthLabel,
  type PasswordGenOptions,
} from "../shared/generate-password.js";
import { sendBg, type PasswordGenHistoryEntry } from "../shared/messages.js";

let suggestVisible = false;

function readGenOptions(): PasswordGenOptions {
  const lenEl = document.getElementById("login-pass-len") as HTMLInputElement | null;
  const length = lenEl ? Number(lenEl.value) : DEFAULT_PASSWORD_GEN.length;
  return {
    length: Number.isFinite(length) ? length : DEFAULT_PASSWORD_GEN.length,
    upper: (document.getElementById("login-pass-upper") as HTMLInputElement)?.checked ?? true,
    lower: (document.getElementById("login-pass-lower") as HTMLInputElement)?.checked ?? true,
    digits: (document.getElementById("login-pass-digits") as HTMLInputElement)?.checked ?? true,
    symbols: (document.getElementById("login-pass-symbols") as HTMLInputElement)?.checked ?? true,
  };
}

function strengthEl() {
  return document.getElementById("login-pass-strength");
}

function suggestBox() {
  return document.getElementById("login-pass-suggest");
}

function suggestValueEl() {
  return document.getElementById("login-pass-suggest-value");
}

function passwordInput() {
  return document.getElementById("login-password") as HTMLInputElement;
}

function updateStrength(pw: string): void {
  const el = strengthEl();
  if (!el) return;
  if (!pw) {
    el.textContent = "";
    el.className = "login-pass-strength hidden";
    return;
  }
  const label = passwordStrengthLabel(pw);
  el.className = `login-pass-strength strength-${label === "mạnh" ? "strong" : label === "trung bình" ? "medium" : "weak"}`;
  el.textContent = `Độ bảo mật: ${label}`;
}

function applyToField(input: HTMLInputElement, pw: string): void {
  input.value = pw;
  updateStrength(pw);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function formatHistoryTime(ts: number): string {
  return new Date(ts).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderPasswordGenHistory(entries: PasswordGenHistoryEntry[]): void {
  const list = document.getElementById("login-pass-history-list");
  const empty = document.getElementById("login-pass-history-empty");
  const countBadge = document.getElementById("login-pass-history-count");
  const clearBtn = document.getElementById("login-pass-history-clear");
  if (!list || !empty || !countBadge || !clearBtn) return;

  countBadge.textContent = entries.length ? String(entries.length) : "";
  empty.classList.toggle("hidden", entries.length > 0);
  clearBtn.classList.toggle("hidden", entries.length === 0);

  list.innerHTML = entries
    .map(
      (e) => `
    <li class="login-pass-history-item" data-id="${e.id}">
      <div class="login-pass-history-main">
        <code class="login-pass-history-pw">${escapeHtml(e.password)}</code>
        <time class="login-pass-history-time">${formatHistoryTime(e.createdAt)}</time>
      </div>
      <div class="login-pass-history-actions">
        <button type="button" class="btn-link-sm" data-action="use">Dùng</button>
        <button type="button" class="btn-link-sm" data-action="copy">Copy</button>
        <button type="button" class="btn-link-sm login-pass-history-del" data-action="remove" aria-label="Xóa">×</button>
      </div>
    </li>`,
    )
    .join("");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function refreshPasswordGenHistoryUi(): Promise<void> {
  const res = await sendBg({ type: "GET_PASSWORD_GEN_HISTORY" });
  if (!res.ok) {
    renderPasswordGenHistory([]);
    return;
  }
  renderPasswordGenHistory(res.passwordGenHistory ?? []);
}

async function rememberGeneratedPassword(pw: string): Promise<void> {
  const res = await sendBg({ type: "RECORD_PASSWORD_GEN_HISTORY", password: pw });
  if (res.ok) await refreshPasswordGenHistoryUi();
}

function refreshSuggestion(apply = false): string {
  const pw = generatePassword(readGenOptions());
  const valEl = suggestValueEl();
  if (valEl) valEl.textContent = pw;
  const input = passwordInput();
  if (apply) applyToField(input, pw);
  else updateStrength(input.value || pw);
  void rememberGeneratedPassword(pw);
  return pw;
}

export function setLoginPasswordSuggestMode(mode: "add" | "edit"): void {
  suggestVisible = mode === "add";
  const input = passwordInput();
  const toggleBtn = document.getElementById("login-pass-toggle");
  input.type = "password";
  toggleBtn?.classList.remove("is-visible");

  const box = suggestBox();
  if (!box) return;
  box.classList.toggle("hidden", !suggestVisible);
  if (suggestVisible) refreshSuggestion(false);
  else updateStrength(input.value);

  void refreshPasswordGenHistoryUi();
}

export function initLoginPasswordField(): void {
  const input = passwordInput();
  const genBtn = document.getElementById("login-pass-generate");
  const toggleBtn = document.getElementById("login-pass-toggle");
  const useBtn = document.getElementById("login-pass-suggest-use");
  const againBtn = document.getElementById("login-pass-suggest-again");
  const historyList = document.getElementById("login-pass-history-list");
  const clearHistoryBtn = document.getElementById("login-pass-history-clear");

  genBtn?.addEventListener("click", () => {
    refreshSuggestion(true);
    input.focus();
  });

  useBtn?.addEventListener("click", () => {
    const text = suggestValueEl()?.textContent ?? "";
    if (text) applyToField(input, text);
    input.focus();
  });

  againBtn?.addEventListener("click", () => {
    refreshSuggestion(false);
  });

  toggleBtn?.addEventListener("click", () => {
    input.type = input.type === "password" ? "text" : "password";
    toggleBtn.classList.toggle("is-visible", input.type === "text");
  });

  input.addEventListener("input", () => updateStrength(input.value));

  document.querySelectorAll<HTMLInputElement>(".login-pass-opt input").forEach((el) => {
    el.addEventListener("change", () => {
      if (suggestVisible) refreshSuggestion(false);
    });
  });

  historyList?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
    if (!btn) return;
    const li = btn.closest<HTMLLIElement>("li.login-pass-history-item");
    if (!li) return;
    const id = li.dataset.id;
    if (!id) return;
    const code = li.querySelector(".login-pass-history-pw");
    const pw = code?.textContent ?? "";
    const action = btn.dataset.action;

    if (action === "use" && pw) {
      applyToField(input, pw);
      input.focus();
    } else if (action === "copy" && pw) {
      void copyToClipboard(pw, 45_000);
    } else if (action === "remove") {
      void sendBg({ type: "REMOVE_PASSWORD_GEN_HISTORY", id }).then(() =>
        refreshPasswordGenHistoryUi(),
      );
    }
  });

  clearHistoryBtn?.addEventListener("click", () => {
    if (!confirm("Xóa toàn bộ lịch sử mật khẩu đã tạo?")) return;
    void sendBg({ type: "CLEAR_PASSWORD_GEN_HISTORY" }).then(() =>
      refreshPasswordGenHistoryUi(),
    );
  });

  void refreshPasswordGenHistoryUi();
}
