export type LoginRow = {
  id: string;
  title: string;
  url: string;
  username: string;
};

export function hostFromUrl(url: string): string {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname;
  } catch {
    return url;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase();
}

function itemMatches(item: LoginRow, query: string): boolean {
  if (!query) return true;
  const host = hostFromUrl(item.url);
  const title = (item.title.trim() || item.username).toLowerCase();
  const blob = `${title} ${item.username.toLowerCase()} ${host.toLowerCase()}`;
  return blob.includes(query);
}

export function groupByHost(items: LoginRow[]): Map<string, LoginRow[]> {
  const map = new Map<string, LoginRow[]>();
  for (const it of items) {
    const host = hostFromUrl(it.url);
    const list = map.get(host) ?? [];
    list.push(it);
    map.set(host, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) =>
      (a.title || a.username).localeCompare(b.title || b.username, "vi"),
    );
  }
  return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b, "vi")));
}

export class AccountsTreeView {
  private allItems: LoginRow[] = [];
  private collapsed = new Set<string>();
  private query = "";

  constructor(
    private readonly root: HTMLElement,
    private readonly searchInput: HTMLInputElement,
  ) {
    searchInput.addEventListener("input", () => {
      this.query = normalizeQuery(searchInput.value);
      this.render();
    });
  }

  setItems(items: LoginRow[]): void {
    this.allItems = items;
    this.render();
  }

  showError(message: string): void {
    this.root.innerHTML = `<p class="popup-account-empty">${escapeHtml(message)}</p>`;
  }

  showEmpty(): void {
    this.root.innerHTML =
      `<p class="popup-account-empty">Chưa có tài khoản. Lưu khi đăng nhập web hoặc thêm trong Cài đặt.</p>`;
  }

  private render(): void {
    const q = this.query;
    const filtered = this.allItems.filter((it) => itemMatches(it, q));
    this.root.innerHTML = "";

    if (this.allItems.length === 0) {
      this.showEmpty();
      return;
    }
    if (filtered.length === 0) {
      this.root.innerHTML = `<p class="popup-account-empty">Không có kết quả cho “${escapeHtml(this.searchInput.value.trim())}”.</p>`;
      return;
    }

    const groups = groupByHost(filtered);
    const searching = q.length > 0;

    for (const [host, items] of groups) {
      const expanded = searching || !this.collapsed.has(host);
      const group = document.createElement("div");
      group.className = "tree-group";

      const head = document.createElement("button");
      head.type = "button";
      head.className = "tree-group-head";
      head.innerHTML = `
        <span class="tree-chevron" aria-hidden="true">${expanded ? "▾" : "▸"}</span>
        <span class="tree-host">${escapeHtml(host)}</span>
        <span class="tree-count">${items.length}</span>`;
      head.addEventListener("click", () => {
        if (this.collapsed.has(host)) this.collapsed.delete(host);
        else this.collapsed.add(host);
        this.render();
      });

      const children = document.createElement("ul");
      children.className = "tree-children";
      children.hidden = !expanded;

      for (const it of items) {
        const li = document.createElement("li");
        li.className = "tree-leaf";
        const title = it.title.trim() || it.username;
        li.innerHTML = `
          <div class="tree-leaf-title">${escapeHtml(title)}</div>
          <div class="tree-leaf-sub">${escapeHtml(it.username)}</div>`;
        children.appendChild(li);
      }

      group.appendChild(head);
      group.appendChild(children);
      this.root.appendChild(group);
    }
  }
}
