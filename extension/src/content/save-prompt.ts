import panelCss from "./panel.css?inline";

export type SaveOffer = {
  headline: string;
  site: string;
  username: string;
  title: string;
  unlocked: boolean;
  isUpdate: boolean;
};

export class SavePrompt {
  private panelEl: HTMLDivElement | null = null;
  private saving = false;

  private ensure(): HTMLDivElement {
    if (this.panelEl) return this.panelEl;
    const host = document.createElement("div");
    host.id = "pm-save-root";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = panelCss;
    shadow.appendChild(style);
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.hidden = true;
    shadow.appendChild(overlay);
    document.documentElement.appendChild(host);
    this.panelEl = overlay;
    return overlay;
  }

  close(): void {
    this.saving = false;
    if (this.panelEl) this.panelEl.hidden = true;
    document.getElementById("pm-save-root")?.remove();
    this.panelEl = null;
  }

  open(
    offer: SaveOffer,
    handlers: {
      onSave: (title: string) => Promise<string | null>;
      onDismiss: () => void;
    },
  ): void {
    this.saving = false;
    const overlay = this.ensure();
    overlay.hidden = false;

    const lockedHint = offer.unlocked
      ? ""
      : `<p class="panel-msg">Vault đang khóa — bấm <strong>Lưu</strong> để ghi nhớ; mở khóa bằng icon extension là xong (không cần nhập lại ở đây).</p>`;

    overlay.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true">
        <h2 class="modal-title">${escapeHtml(offer.headline)}</h2>
        <p class="modal-sub">${offer.isUpdate ? "Cập nhật mật khẩu đã lưu cho" : "Lưu thông tin đăng nhập cho"} <strong>${escapeHtml(offer.site)}</strong>?</p>
        <div class="modal-body">
          ${lockedHint}
          <label class="field">
            <span>Tên hiển thị</span>
            <input type="text" id="pm-save-title" value="${escapeAttr(offer.title)}" />
          </label>
          <label class="field">
            <span>Tên đăng nhập</span>
            <div class="readonly-value">${escapeHtml(offer.username)}</div>
          </label>
          <p class="error" id="pm-save-err" hidden></p>
          <p class="status-ok" id="pm-save-ok" hidden></p>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="pm-save-no">Không lưu</button>
            <button type="button" class="btn" id="pm-save-yes">Lưu</button>
          </div>
        </div>
      </div>`;

    const err = overlay.querySelector("#pm-save-err") as HTMLParagraphElement;
    const ok = overlay.querySelector("#pm-save-ok") as HTMLParagraphElement;
    const titleInput = overlay.querySelector("#pm-save-title") as HTMLInputElement;

    overlay.querySelector("#pm-save-no")?.addEventListener("click", () => {
      handlers.onDismiss();
      this.close();
    });

    const saveBtn = overlay.querySelector("#pm-save-yes") as HTMLButtonElement | null;

    const runSave = () => {
      if (this.saving) return;
      void (async () => {
        if (!saveBtn || saveBtn.disabled || this.saving) return;
        this.saving = true;
        err.hidden = true;
        ok.hidden = true;
        saveBtn.disabled = true;
        saveBtn.textContent = "Đang lưu…";
        const title = titleInput?.value.trim() || offer.title;
        try {
          const msg = await handlers.onSave(title);
          if (msg?.startsWith("OK:") || msg === null || msg === undefined) {
            this.close();
            return;
          }
          if (msg) {
            err.textContent = msg;
            err.hidden = false;
          }
          this.saving = false;
          saveBtn.disabled = false;
          saveBtn.textContent = "Lưu";
        } catch {
          err.textContent = "Không lưu được. Thử reload extension.";
          err.hidden = false;
          this.saving = false;
          saveBtn.disabled = false;
          saveBtn.textContent = "Lưu";
        }
      })();
    };

    saveBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      runSave();
    });

    titleInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        runSave();
      }
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        handlers.onDismiss();
        this.close();
      }
    });

    titleInput?.focus();
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
