import type { ImportRow } from "./parse-csv.js";

const WEB_KEYS = {
  title: "Website name",
  url: "Website URL",
  loginLabel: "Login name",
  login: "Login",
  password: "Password",
  comment: "Comment",
} as const;

const APP_KEYS = {
  title: "Application",
  loginLabel: "Login name",
  login: "Login",
  password: "Password",
  comment: "Comment",
} as const;

/** Export “Xuất ra file text” của Kaspersky Password Manager. */
export function parseKasperskyTxt(text: string): {
  rows: ImportRow[];
  errors: string[];
} {
  const errors: string[] = [];
  const rows: ImportRow[] = [];
  const normalized = text.replace(/\r\n/g, "\n").replace(/^\uFEFF/, "");
  const blocks = normalized.split(/\n---\n/);

  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi]!.trim();
    if (!block) continue;
    if (block === "Websites" || block === "Applications") continue;
    if (/^Websites(\n|$)/.test(block)) {
      const body = block.replace(/^Websites\s*\n?/, "");
      if (body.trim()) parseBlock(body, rows, errors, bi);
      continue;
    }
    if (/^Applications(\n|$)/.test(block)) {
      const body = block.replace(/^Applications\s*\n?/, "");
      if (body.trim()) parseAppBlock(body, rows, errors, bi);
      continue;
    }
    if (block.includes("Website URL:")) {
      parseBlock(block, rows, errors, bi);
    } else if (block.includes("Application:")) {
      parseAppBlock(block, rows, errors, bi);
    }
  }

  return { rows, errors };
}

function parseBlock(
  block: string,
  rows: ImportRow[],
  errors: string[],
  blockIndex: number,
): void {
  const fields = readFields(block);
  const url = fields[WEB_KEYS.url] ?? "";
  const login = fields[WEB_KEYS.login] ?? "";
  const password = fields[WEB_KEYS.password] ?? "";
  const title =
    fields[WEB_KEYS.title]?.trim() ||
    fields[WEB_KEYS.loginLabel]?.trim() ||
    login ||
    url;
  const notes = fields[WEB_KEYS.comment] ?? "";

  if (!url) {
    errors.push(`Khối ${blockIndex + 1}: thiếu Website URL.`);
    return;
  }
  rows.push({ title, url, username: login, password, notes });
}

function parseAppBlock(
  block: string,
  rows: ImportRow[],
  errors: string[],
  blockIndex: number,
): void {
  const fields = readFields(block);
  const app = fields[APP_KEYS.title]?.trim() ?? "";
  const login = fields[APP_KEYS.login] ?? "";
  const password = fields[APP_KEYS.password] ?? "";
  const notes = fields[APP_KEYS.comment] ?? "";
  if (!app) {
    errors.push(`Khối ${blockIndex + 1}: thiếu Application.`);
    return;
  }
  const title = app;
  const url = `https://${slugHost(app)}.kpmapp`;
  rows.push({
    title,
    url,
    username: login,
    password,
    notes: notes ? `[App] ${notes}` : `[App] ${app}`,
  });
}

function slugHost(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return s || "application";
}

function readFields(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const trimmed = line.trimEnd();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    if (colon <= 0) continue;
    const key = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trimStart();
    out[key] = value;
  }
  return out;
}
