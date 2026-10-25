import "../styles.css";
import { AccountsTreeView } from "./accounts-tree.js";
import { sendBg } from "../shared/messages.js";
import { showAppVersion } from "../shared/version.js";

const subtitle = document.getElementById("subtitle")!;
const formView = document.getElementById("form-view")!;
const unlockedView = document.getElementById("unlocked-view")!;
const passwordLabel = document.getElementById("password-label")!;
const passwordInput = document.getElementById("password") as HTMLInputElement;
const confirmWrap = document.getElementById("confirm-wrap")!;
const confirmInput = document.getElementById("confirm") as HTMLInputElement;
const errorEl = document.getElementById("error")!;
const primaryBtn = document.getElementById("primary") as HTMLButtonElement;
const lockBtn = document.getElementById("lock") as HTMLButtonElement;
const vaultMetaEl = document.getElementById("vault-meta")!;
const accountTreeEl = document.getElementById("account-tree")!;
const accountSearchEl = document.getElementById("account-search") as HTMLInputElement;
const openOptionsBtn = document.getElementById("open-options") as HTMLButtonElement;

const accountsTree = new AccountsTreeView(accountTreeEl, accountSearchEl);

type Mode = "setup" | "unlock";
let mode: Mode = "unlock";

function showError(msg: string) {
  errorEl.textContent = msg;
  errorEl.classList.remove("hidden");
}

function clearError() {
  errorEl.textContent = "";
  errorEl.classList.add("hidden");
}

async function renderAccountList(): Promise<void> {
  accountSearchEl.value = "";
  const res = await sendBg({ type: "LIST_ALL_LOGINS" });
  if (!res.ok) {
    accountsTree.showError(res.error);
    return;
  }
  const items = res.logins ?? [];
  accountsTree.setItems(items);
}

async function showUnlocked(itemCount: number) {
  formView.classList.add("hidden");
  unlockedView.classList.remove("hidden");
  subtitle.textContent = "";
  vaultMetaEl.textContent =
    itemCount === 0
      ? "Master key active — chưa có mục nào."
      : `${itemCount} mục · master key trong phiên trình duyệt.`;
  await renderAccountList();
}

function showForm(setup: boolean) {
  mode = setup ? "setup" : "unlock";
  unlockedView.classList.add("hidden");
  formView.classList.remove("hidden");
  passwordInput.value = "";
  confirmInput.value = "";
  clearError();

  if (setup) {
    subtitle.textContent = "Lần đầu: tạo master password (Argon2id + khóa vault AES-GCM).";
    passwordLabel.textContent = "Tạo master password";
    confirmWrap.classList.remove("hidden");
    primaryBtn.textContent = "Tạo vault";
    passwordInput.autocomplete = "new-password";
  } else {
    subtitle.textContent = "Nhập master password để derive master key.";
    passwordLabel.textContent = "Master password";
    confirmWrap.classList.add("hidden");
    primaryBtn.textContent = "Mở khóa";
    passwordInput.autocomplete = "current-password";
  }
}

async function refresh() {
  const res = await sendBg({ type: "GET_STATE" });
  if (!res.ok || !res.state) {
    showForm(true);
    if (!res.ok) showError(res.error);
    return;
  }
  if (res.state.unlocked) {
    await showUnlocked(res.state.itemCount);
    return;
  }
  showForm(!res.state.configured);
}

async function submitPrimary(): Promise<void> {
  clearError();
  const pw = passwordInput.value;
  if (!pw) {
    showError("Vui lòng nhập master password.");
    return;
  }

  if (mode === "setup") {
    if (pw !== confirmInput.value) {
      showError("Hai lần nhập không khớp.");
      return;
    }
    primaryBtn.disabled = true;
    const res = await sendBg({ type: "SETUP", masterPassword: pw });
    primaryBtn.disabled = false;
    if (!res.ok) {
      showError(res.error);
      return;
    }
    await refresh();
    return;
  }

  primaryBtn.disabled = true;
  const res = await sendBg({ type: "UNLOCK", masterPassword: pw });
  primaryBtn.disabled = false;
  if (!res.ok) {
    showError(res.error);
    return;
  }
  await refresh();
}

primaryBtn.addEventListener("click", () => void submitPrimary());

function onPasswordKeydown(e: KeyboardEvent): void {
  if (e.key !== "Enter") return;
  e.preventDefault();
  if (mode === "setup" && !confirmInput.value.trim()) {
    confirmInput.focus();
    return;
  }
  void submitPrimary();
}

function onConfirmKeydown(e: KeyboardEvent): void {
  if (e.key !== "Enter") return;
  e.preventDefault();
  void submitPrimary();
}

passwordInput.addEventListener("keydown", onPasswordKeydown);
confirmInput.addEventListener("keydown", onConfirmKeydown);

document.addEventListener("keydown", (e) => {
  if (!unlockedView.classList.contains("hidden") && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
    e.preventDefault();
    accountSearchEl.focus();
    accountSearchEl.select();
  }
});

lockBtn.addEventListener("click", async () => {
  await sendBg({ type: "LOCK" });
  await refresh();
});

openOptionsBtn.addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});

showAppVersion();
void refresh();
