import type { FillContext } from "../shared/messages.js";
import panelCss from "./panel.css?inline";

export class FillPanel {
  private host: HTMLDivElement | null = null;
  private shadow: ShadowRoot | null = null;
  private panelEl: HTMLDivElement | null = null;
  private onPickAccount: ((id: string) => void) | null = null;
  private onUnlock: ((password: string) => Promise<string | null>) | null = null;

  setHandlers(handlers: {
    onPickAccount: (id: string) => void;
    onUnlock: (password: string) => Promise<string | null>;
  }): void {
    this.onPickAccount = handlers.onPickAccount;
    this.onUnlock = handlers.onUnlock;
  }

  ensurePanel(): HTMLDivElement {
    if (this.panelEl) return this.panelEl;
    const host = document.createElement("div");
    host.id = "pm-fill-root";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = panelCss;
    shadow.appendChild(style);

    const panel = document.createElement("div");
    panel.className = "panel";
    panel.hidden = true;
    shadow.appendChild(panel);

    document.documentElement.appendChild(host);
    this.host = host;
    this.shadow = shadow;
    this.panelEl = panel;
    return panel;
  }

  close(): void {
    if (this.panelEl) this.panelEl.hidden = true;
  }

  openNear(anchor: HTMLElement): void {
    const panel = this.ensurePanel();
    panel.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const top = Math.min(window.innerHeight - 20, rect.bottom + 6);
    let left = rect.right - 280;
    left = Math.max(8, Math.min(left, window.innerWidth - 288));
    panel.style.top = `${Math.max(8, top)}px`;
    panel.style.left = `${left}px`;
  }

  renderSetupRequired(): void {
    const panel = this.ensurePanel();
    panel.innerHTML = `
      <div class="panel-header">
        <span>Password Manager</span>
        <button type="button" class="panel-close" data-close aria-label="Đóng">×</button>
      </div>
      <div class="panel-body">
        <p class="panel-msg">Chưa thiết lập vault. Bấm icon extension trên trình duyệt để tạo master password.</p>
      </div>`;
    this.bindClose(panel);
  }

  renderLocked(): void {
    const panel = this.ensurePanel();
    panel.innerHTML = `
      <div class="panel-header">
        <span>Mở khóa vault</span>
        <button type="button" class="panel-close" data-close aria-label="Đóng">×</button>
      </div>
      <div class="panel-body">
        <p class="panel-msg">Nhập master password để xem tài khoản đã lưu.</p>
        <label class="field">
          <span>Master password</span>
          <input type="password" id="pm-unlock-pw" autocomplete="current-password" />
        </label>
        <p class="error" id="pm-unlock-err" hidden></p>
        <button type="button" class="btn" id="pm-unlock-btn">Mở khóa</button>
      </div>`;
    this.bindClose(panel);
    const pw = panel.querySelector("#pm-unlock-pw") as HTMLInputElement;
    const err = panel.querySelector("#pm-unlock-err") as HTMLParagraphElement;
    const btn = panel.querySelector("#pm-unlock-btn") as HTMLButtonElement;
    const submit = async () => {
      err.hidden = true;
      if (!this.onUnlock) return;
      btn.disabled = true;
      const msg = await this.onUnlock(pw.value);
      btn.disabled = false;
      if (msg) {
        err.textContent = msg;
        err.hidden = false;
      }
    };
    btn.addEventListener("click", () => void submit());
    pw.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void submit();
    });
    pw.focus();
  }

  renderAccounts(fill: FillContext): void {
    const panel = this.ensurePanel();
    if (fill.accounts.length === 0) {
      panel.innerHTML = `
        <div class="panel-header">
          <span>Password Manager</span>
          <button type="button" class="panel-close" data-close aria-label="Đóng">×</button>
        </div>
        <div class="panel-body">
          <p class="panel-msg">Chưa có tài khoản cho site này. Thêm trong Cài đặt extension (chuột phải icon → Tùy chọn).</p>
        </div>`;
      this.bindClose(panel);
      return;
    }

    const items = fill.accounts
      .map(
        (a) => `
      <li>
        <button type="button" class="account-item" data-id="${a.id}">
          <span class="account-icon">👤</span>
          <span class="account-text">
            <div class="account-title">${escapeHtml(a.title)}</div>
            <div class="account-sub">${escapeHtml(a.username)}</div>
          </span>
        </button>
      </li>`,
      )
      .join("");

    panel.innerHTML = `
      <div class="panel-header">
        <span>Password Manager</span>
        <button type="button" class="panel-close" data-close aria-label="Đóng">×</button>
      </div>
      <div class="panel-body">
        <ul class="account-list">${items}</ul>
      </div>`;
    this.bindClose(panel);
    panel.querySelectorAll<HTMLButtonElement>("[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        if (id && this.onPickAccount) this.onPickAccount(id);
        this.close();
      });
    });
  }

  private bindClose(panel: HTMLDivElement): void {
    panel.querySelector("[data-close]")?.addEventListener("click", () => this.close());
  }
}

export function createFieldIcon(onClick: (el: HTMLButtonElement) => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pm-field-icon";
  btn.setAttribute("aria-label", "Password Manager");
  btn.title = "Password Manager";
  const img = document.createElement("img");
  img.src = chrome.runtime.getURL("icons/icon-32.png");
  img.alt = "";
  img.draggable = false;
  btn.appendChild(img);
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick(btn);
  });
  return btn;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
