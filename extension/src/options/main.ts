import "./options.css";
import { parseLoginCsv, parseLoginJson } from "../import/parse-csv.js";
import { parseKasperskyTxt } from "../import/parse-kpm-txt.js";
import { sendBg } from "../shared/messages.js";
import { showAppVersion } from "../shared/version.js";
import { initDetailModal, openAccountDetail } from "./detail-modal.js";
import {
  initLoginPasswordField,
  refreshPasswordGenHistoryUi,
  setLoginPasswordSuggestMode,
} from "./login-password-field.js";
import { faviconImgHtml, wireFaviconImages } from "../shared/favicon.js";
import { groupByHost, hostFromUrl } from "../popup/accounts-tree.js";
import type { ImportRow } from "../import/parse-csv.js";

type LoginItem = {
  id: string;
  title: string;
  url: string;
  username: string;
};

type ViewId = "home" | "accounts" | "add" | "import" | "settings";

const TITLES: Record<ViewId, string> = {
  home: "Chính",
  accounts: "Tài khoản",
  add: "Thêm tài khoản",
  import: "Nhập dữ liệu",
  settings: "Cài đặt vault",
};

let items: LoginItem[] = [];
let searchQuery = "";
let configured = false;
let unlocked = false;
let currentView: ViewId = "home";
let pendingImport: ImportRow[] = [];
/** Tài khoản đang mở tab để user thử đăng nhập. */
let checkingLoginId: string | null = null;
const collapsedHosts = new Set<string>();

const navCount = document.getElementById("nav-count")!;
const vaultPill = document.getElementById("vault-pill")!;
const sidebarStatus = document.getElementById("sidebar-status")!;
const pageTitle = document.getElementById("page-title")!;
const globalSearch = document.getElementById("global-search") as HTMLInputElement;
const searchWrap = document.getElementById("search-wrap")!;
const topAdd = document.getElementById("top-add") as HTMLButtonElement;
const lockBanner = document.getElementById("lock-banner")!;
const setupBanner = document.getElementById("setup-banner")!;
const statAccounts = document.getElementById("stat-accounts")!;
const statSites = document.getElementById("stat-sites")!;
const homeGrid = document.getElementById("home-grid")!;
const accountsTableWrap = document.getElementById("accounts-table-wrap")!;
const loginForm = document.getElementById("login-form") as HTMLFormElement;
const loginId = document.getElementById("login-id") as HTMLInputElement;
const loginTitle = document.getElementById("login-title") as HTMLInputElement;
const loginUrl = document.getElementById("login-url") as HTMLInputElement;
const loginUsername = document.getElementById("login-username") as HTMLInputElement;
const loginPassword = document.getElementById("login-password") as HTMLInputElement;
const loginMsg = document.getElementById("login-msg")!;
const formHeading = document.getElementById("form-heading")!;
const formCancel = document.getElementById("form-cancel") as HTMLButtonElement;
const settingsStatus = document.getElementById("settings-status")!;
const resetBtn = document.getElementById("reset") as HTMLButtonElement;
const msg = document.getElementById("msg")!;
const unlockPw = document.getElementById("unlock-pw") as HTMLInputElement;
const unlockBtn = document.getElementById("unlock-btn") as HTMLButtonElement;
const unlockErr = document.getElementById("unlock-err")!;
const importFile = document.getElementById("import-file") as HTMLInputElement;
const importRun = document.getElementById("import-run") as HTMLButtonElement;
const importPreview = document.getElementById("import-preview")!;
const importResult = document.getElementById("import-result")!;

showAppVersion();

const brandImg = document.querySelector(".brand-mark img") as HTMLImageElement | null;
if (brandImg) {
  brandImg.src = chrome.runtime.getURL("icons/icon-48.png");
}

function loginPageUrl(stored: string): string {
  const raw = stored.trim();
  if (!raw) return "";
  if (raw.includes("://")) return raw;
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(raw)) {
    return `http://${raw}`;
  }
  return `https://${raw}`;
}

function openLoginSite(storedUrl: string): void {
  const url = loginPageUrl(storedUrl);
  if (!url) return;
  void chrome.tabs.create({ url, active: true });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function initials(host: string): string {
  const h = host.replace(/^www\./, "");
  const parts = h.split(".");
  const core = parts.length >= 2 ? parts[parts.length - 2]! : parts[0]!;
  return core.slice(0, 2).toUpperCase();
}

function filteredItems(): LoginItem[] {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return items;
  return items.filter((it) => {
    const host = hostFromUrl(it.url).toLowerCase();
    const title = (it.title || it.username).toLowerCase();
    return (
      title.includes(q) ||
      it.username.toLowerCase().includes(q) ||
      host.includes(q)
    );
  });
}

function uniqueSiteCount(list: LoginItem[]): number {
  return new Set(list.map((it) => hostFromUrl(it.url))).size;
}

function setView(view: ViewId): void {
  currentView = view;
  pageTitle.textContent = TITLES[view];
  document.querySelectorAll<HTMLElement>(".content").forEach((el) => {
    el.classList.toggle("hidden", !el.id.endsWith(view));
  });
  document.querySelectorAll<HTMLButtonElement>(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  searchWrap.classList.toggle(
    "hidden",
    view === "add" || view === "settings" || view === "import",
  );
}

function openEditForm(it: LoginItem): void {
  loginId.value = it.id;
  loginTitle.value = it.title || "";
  loginUrl.value = hostFromUrl(it.url);
  loginUsername.value = it.username;
  loginPassword.value = "";
  formHeading.textContent = "Sửa tài khoản";
  loginMsg.textContent = "";
  setLoginPasswordSuggestMode("edit");
  setView("add");
}

function resetForm(): void {
  loginForm.reset();
  loginId.value = "";
  formHeading.textContent = "Thêm tài khoản";
  loginMsg.textContent = "";
  setLoginPasswordSuggestMode("add");
}

function renderHomeGrid(): void {
  const list = filteredItems();
  if (!configured) {
    homeGrid.innerHTML = "";
    return;
  }
  if (!unlocked) {
    homeGrid.innerHTML = `<div class="empty-state"><p>Mở khóa vault để xem tài khoản.</p></div>`;
    return;
  }
  if (list.length === 0) {
    homeGrid.innerHTML = `<div class="empty-state"><p>Chưa có tài khoản.</p><button type="button" class="btn btn-primary" id="empty-add">+ Thêm tài khoản</button></div>`;
    document.getElementById("empty-add")?.addEventListener("click", () => {
      resetForm();
      setView("add");
    });
    return;
  }
  homeGrid.innerHTML = list
    .map((it) => {
      const host = hostFromUrl(it.url);
      const title = it.title.trim() || host;
      const ini = initials(host);
      return `<button type="button" class="account-card" data-edit="${it.id}">
        <div class="account-card-favicon">${faviconImgHtml(host, ini)}</div>
        <div class="account-card-title">${escapeHtml(title)}</div>
        <div class="account-card-sub">${escapeHtml(it.username)} · ${escapeHtml(host)}</div>
      </button>`;
    })
    .join("");
  wireFaviconImages(homeGrid);
  homeGrid.querySelectorAll(".account-card").forEach((card) => {
    card.addEventListener("dblclick", () => {
      const id = (card as HTMLElement).getAttribute("data-edit");
      const it = id ? items.find((x) => x.id === id) : undefined;
      if (it) void openAccountDetail(it);
    });
  });
  homeGrid.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = (btn as HTMLElement).getAttribute("data-edit")!;
      const it = items.find((x) => x.id === id);
      if (it) openEditForm(it);
    });
  });
}

function accountRowHtml(it: LoginItem): string {
  const title = it.title.trim() || hostFromUrl(it.url);
  const checking = checkingLoginId === it.id;
  const btnClass = checking
    ? "btn btn-open-web btn-open-web-active btn-sm"
    : "btn btn-open-web btn-sm";
  const btnLabel = checking ? "Đang check trên web" : "Check tại web";
  const btnTitle = checking
    ? "Đang thử trên tab web — bấm lại để đánh dấu xong"
    : "Mở trang đăng nhập — dùng icon extension trên form để điền mật khẩu";
  return `<tr class="account-row" data-account-id="${it.id}" title="Double-click để xem chi tiết">
        <td><div class="cell-title">${escapeHtml(title)}</div><div class="cell-muted">${escapeHtml(it.username)}</div></td>
        <td>
          <button type="button" class="${btnClass}" data-open-id="${it.id}" title="${escapeHtml(btnTitle)}">
            ${btnLabel}
          </button>
        </td>
        <td><div class="row-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-edit="${it.id}">Sửa</button>
          <button type="button" class="btn btn-ghost btn-sm" data-del="${it.id}">Xóa</button>
        </div></td>
      </tr>`;
}

function renderAccountsTable(): void {
  if (!configured || !unlocked) {
    accountsTableWrap.innerHTML = `<div class="empty-state"><p>${!configured ? "Chưa có vault." : "Mở khóa vault để xem danh sách."}</p></div>`;
    return;
  }
  const list = filteredItems();
  if (list.length === 0) {
    accountsTableWrap.innerHTML = `<div class="empty-state"><p>Không có tài khoản phù hợp.</p></div>`;
    return;
  }

  const searching = searchQuery.length > 0;
  const groups = groupByHost(list);
  const rows: string[] = [];

  for (const [host, groupItems] of groups) {
    const expanded = searching || !collapsedHosts.has(host);
    const ini = initials(host);
    rows.push(`<tr class="group-row">
      <td colspan="3">
        <button type="button" class="group-head" data-toggle-host="${escapeHtml(host)}">
          <span class="group-chevron" aria-hidden="true">${expanded ? "▾" : "▸"}</span>
          <span class="group-favicon">${faviconImgHtml(host, ini)}</span>
          <span class="group-host">${escapeHtml(host)}</span>
          <span class="group-count">${groupItems.length}</span>
        </button>
      </td>
    </tr>`);
    if (expanded) {
      for (const it of groupItems) {
        rows.push(accountRowHtml(it));
      }
    }
  }

  accountsTableWrap.innerHTML = `<table class="data-table data-table-grouped">
    <thead><tr><th>Tài khoản</th><th>Check tại web</th><th></th></tr></thead>
    <tbody>${rows.join("")}</tbody>
  </table>`;

  wireFaviconImages(accountsTableWrap);
  accountsTableWrap.querySelectorAll("[data-toggle-host]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const host = (btn as HTMLElement).getAttribute("data-toggle-host");
      if (!host) return;
      if (collapsedHosts.has(host)) collapsedHosts.delete(host);
      else collapsedHosts.add(host);
      renderAccountsTable();
    });
  });
  accountsTableWrap.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = (btn as HTMLElement).getAttribute("data-edit")!;
      const it = items.find((x) => x.id === id);
      if (it) openEditForm(it);
    });
  });
  accountsTableWrap.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => void deleteLogin((btn as HTMLElement).getAttribute("data-del")!));
  });
  accountsTableWrap.querySelectorAll("tr.account-row").forEach((row) => {
    row.addEventListener("dblclick", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      const id = (row as HTMLElement).getAttribute("data-account-id");
      const it = id ? items.find((x) => x.id === id) : undefined;
      if (it) void openAccountDetail(it);
    });
  });
  accountsTableWrap.querySelectorAll("[data-open-id]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).getAttribute("data-open-id");
      if (!id) return;
      const row = items.find((x) => x.id === id);
      if (!row) return;

      if (checkingLoginId === id) {
        checkingLoginId = null;
        renderAccountsTable();
        return;
      }

      checkingLoginId = id;
      openLoginSite(row.url);
      renderAccountsTable();
    });
  });
}

async function deleteLogin(id: string): Promise<void> {
  if (!confirm("Xóa tài khoản này?")) return;
  await sendBg({ type: "DELETE_LOGIN", id });
  await refreshAll();
}

function updateChrome(): void {
  navCount.textContent = String(unlocked ? items.length : "—");
  statAccounts.textContent = unlocked ? String(items.length) : "—";
  statSites.textContent = unlocked ? String(uniqueSiteCount(items)) : "—";

  vaultPill.className = `vault-pill ${unlocked ? "ok" : "locked"}`;
  vaultPill.textContent = unlocked ? "Vault mở khóa" : "Vault khóa";

  if (!configured) {
    sidebarStatus.textContent = "Chưa thiết lập — dùng popup extension.";
    setupBanner.classList.remove("hidden");
    lockBanner.classList.add("hidden");
  } else if (!unlocked) {
    sidebarStatus.textContent = `${items.length > 0 ? "Có dữ liệu mã hóa." : "Mở khóa để quản lý."}`;
    setupBanner.classList.add("hidden");
    lockBanner.classList.remove("hidden");
  } else {
    sidebarStatus.textContent = `${items.length} tài khoản · lưu trên máy này.`;
    setupBanner.classList.add("hidden");
    lockBanner.classList.add("hidden");
  }

  settingsStatus.textContent = !configured
    ? "Chưa tạo vault."
    : unlocked
      ? `Vault mở khóa · ${items.length} tài khoản · ${uniqueSiteCount(items)} website.`
      : "Vault đang khóa — mở khóa để xem chi tiết.";

  topAdd.disabled = !configured || !unlocked;
  importRun.disabled = !unlocked || pendingImport.length === 0;
  renderHomeGrid();
  renderAccountsTable();
}

async function refreshStatus(): Promise<void> {
  const state = await sendBg({ type: "GET_STATE" });
  if (!state.ok || !state.state) {
    configured = false;
    unlocked = false;
    return;
  }
  configured = state.state.configured;
  unlocked = state.state.unlocked;
}

async function refreshLogins(): Promise<void> {
  items = [];
  if (!configured) return;
  const res = await sendBg({ type: "LIST_ALL_LOGINS" });
  if (res.ok && res.logins) {
    items = res.logins;
    items.sort((a, b) =>
      (a.title || a.username).localeCompare(b.title || b.username, "vi"),
    );
  }
}

async function refreshAll(): Promise<void> {
  await refreshStatus();
  await refreshLogins();
  updateChrome();
}

document.querySelectorAll<HTMLButtonElement>(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    const view = btn.dataset.view as ViewId;
    if (view === "add") resetForm();
    setView(view);
  });
});

topAdd.addEventListener("click", () => {
  resetForm();
  setView("add");
});

formCancel.addEventListener("click", () => {
  resetForm();
  setView("home");
});

globalSearch.addEventListener("input", () => {
  searchQuery = globalSearch.value;
  renderHomeGrid();
  renderAccountsTable();
});

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
    e.preventDefault();
    globalSearch.focus();
    globalSearch.select();
  }
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginMsg.textContent = "";
  loginMsg.className = "form-msg";
  if (!unlocked) {
    loginMsg.textContent = "Mở khóa vault trước khi lưu.";
    loginMsg.classList.add("err");
    return;
  }
  const isEdit = !!loginId.value;
  if (!isEdit && !loginPassword.value) {
    loginMsg.textContent = "Nhập mật khẩu khi thêm mới.";
    loginMsg.classList.add("err");
    return;
  }
  const res = await sendBg({
    type: "UPSERT_LOGIN",
    login: {
      id: loginId.value || undefined,
      title: loginTitle.value,
      url: loginUrl.value,
      username: loginUsername.value,
      password: loginPassword.value,
    },
  });
  if (res.ok) {
    loginMsg.textContent = res.message ?? "Đã lưu.";
    loginMsg.classList.add("ok");
    resetForm();
    await refreshAll();
    setView("accounts");
  } else {
    loginMsg.textContent = res.error;
    loginMsg.classList.add("err");
  }
});

unlockBtn.addEventListener("click", async () => {
  unlockErr.classList.add("hidden");
  unlockBtn.disabled = true;
  const res = await sendBg({ type: "UNLOCK", masterPassword: unlockPw.value });
  unlockBtn.disabled = false;
  if (!res.ok) {
    unlockErr.textContent = res.error ?? "Mở khóa thất bại.";
    unlockErr.classList.remove("hidden");
    return;
  }
  unlockPw.value = "";
  await refreshAll();
  void refreshPasswordGenHistoryUi();
});

unlockPw.addEventListener("keydown", (e) => {
  if (e.key === "Enter") unlockBtn.click();
});

importFile.addEventListener("change", async () => {
  importResult.textContent = "";
  importResult.className = "form-msg";
  pendingImport = [];
  importRun.disabled = true;

  const file = importFile.files?.[0];
  if (!file) {
    importPreview.textContent = "";
    return;
  }

  const lower = file.name.toLowerCase();
  if (lower.endsWith(".edb")) {
    importPreview.textContent =
      "File .edb là backup mã hóa của Kaspersky — extension không giải mã trực tiếp. Xuất CSV từ KPM (mục Nhập dữ liệu).";
    importPreview.className = "form-msg err";
    importFile.value = "";
    return;
  }

  const text = await file.text();
  const parsed = lower.endsWith(".json")
    ? parseLoginJson(text)
    : lower.endsWith(".txt")
      ? parseKasperskyTxt(text)
      : parseLoginCsv(text);

  pendingImport = parsed.rows;
  const warn = parsed.errors.length
    ? ` (${parsed.errors.slice(0, 3).join(" ")}${parsed.errors.length > 3 ? "…" : ""})`
    : "";
  if (pendingImport.length === 0) {
    importPreview.textContent = (parsed.errors[0] ?? "Không có dòng hợp lệ.") + warn;
    importPreview.className = "form-msg err";
    return;
  }
  importPreview.textContent = `Sẵn sàng nhập ${pendingImport.length} tài khoản.${warn}`;
  importPreview.className = "form-msg ok";
  importRun.disabled = !unlocked;
});

importRun.addEventListener("click", async () => {
  importResult.textContent = "";
  importResult.className = "form-msg";
  if (!unlocked) {
    importResult.textContent = "Mở khóa vault trước khi nhập.";
    importResult.classList.add("err");
    return;
  }
  if (pendingImport.length === 0) return;
  if (
    !confirm(
      `Nhập ${pendingImport.length} tài khoản vào vault? (Dữ liệu chỉ lưu trên máy bạn)`,
    )
  ) {
    return;
  }
  importRun.disabled = true;
  const res = await sendBg({ type: "IMPORT_LOGINS", logins: pendingImport });
  importRun.disabled = false;
  if (res.ok) {
    importResult.textContent = res.message ?? "Đã nhập.";
    importResult.classList.add("ok");
    pendingImport = [];
    importFile.value = "";
    importPreview.textContent = "";
    await refreshAll();
    setView("accounts");
  } else {
    importResult.textContent = res.error;
    importResult.classList.add("err");
  }
});

resetBtn.addEventListener("click", async () => {
  if (
    !confirm(
      "Xóa toàn bộ vault (master password + dữ liệu mã hóa) trên trình duyệt này?",
    )
  ) {
    return;
  }
  const res = await sendBg({ type: "RESET" });
  msg.textContent = res.ok
    ? "Đã reset. Mở popup để tạo master password mới."
    : res.error;
  msg.className = `form-msg ${res.ok ? "ok" : "err"}`;
  await refreshAll();
});

const BUNDLED_IMPORT_FLAG = "kpmBundledImport_v1";

async function runBundledKpmImportIfNeeded(): Promise<void> {
  if (!configured || !unlocked) return;
  const done = await chrome.storage.local.get(BUNDLED_IMPORT_FLAG);
  if (done[BUNDLED_IMPORT_FLAG]) return;

  let res: Response;
  try {
    res = await fetch(chrome.runtime.getURL("pending-kpm-import.txt"));
  } catch {
    return;
  }
  if (!res.ok) return;

  const text = await res.text();
  const parsed = parseKasperskyTxt(text);
  if (parsed.rows.length === 0) return;

  const importRes = await sendBg({
    type: "IMPORT_LOGINS",
    logins: parsed.rows,
  });
  if (!importRes.ok) return;

  await chrome.storage.local.set({ [BUNDLED_IMPORT_FLAG]: Date.now() });
  importResult.textContent = importRes.message ?? `Đã nhập ${parsed.rows.length} tài khoản từ bản Kaspersky.`;
  importResult.className = "form-msg ok";
  setView("import");
  await refreshAll();
}

initLoginPasswordField();

initDetailModal({
  onOpenWeb: (url, id) => {
    checkingLoginId = id;
    openLoginSite(url);
    renderAccountsTable();
  },
  onEdit: (id) => {
    const it = items.find((x) => x.id === id);
    if (it) openEditForm(it);
  },
});

void refreshAll().then(() => void runBundledKpmImportIfNeeded());
