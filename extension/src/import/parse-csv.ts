export type ImportRow = {
  title: string;
  url: string;
  username: string;
  password: string;
  notes?: string;
};

/** Parse CSV UTF-8 (Kaspersky / Bitwarden-style: url, username, password, name). */
export function parseLoginCsv(text: string): {
  rows: ImportRow[];
  errors: string[];
} {
  const errors: string[] = [];
  const stripped = text.replace(/^\uFEFF/, "");
  const records = parseCsvRecords(stripped);
  if (records.length === 0) {
    return { rows: [], errors: ["File trống."] };
  }

  const header = records[0]!.map((c) => c.trim().toLowerCase());
  let start = 0;
  let urlIdx = 0;
  let userIdx = 1;
  let passIdx = 2;
  let nameIdx = 3;

  const hasHeader =
    header.includes("url") ||
    header.includes("username") ||
    header.includes("password") ||
    header.includes("name");

  if (hasHeader) {
    start = 1;
    urlIdx = header.indexOf("url");
    userIdx = header.indexOf("username");
    passIdx = header.indexOf("password");
    nameIdx = header.indexOf("name");
    if (urlIdx < 0) {
      return { rows: [], errors: ["CSV cần cột url (hoặc header url,username,password,name)."] };
    }
  }

  const rows: ImportRow[] = [];
  for (let i = start; i < records.length; i++) {
    const cols = records[i]!;
    if (cols.every((c) => !c.trim())) continue;

    const url = (urlIdx >= 0 ? cols[urlIdx] : cols[0])?.trim() ?? "";
    const username = (userIdx >= 0 ? cols[userIdx] : cols[1])?.trim() ?? "";
    const password = (passIdx >= 0 ? cols[passIdx] : cols[2])?.trim() ?? "";
    const title =
      (nameIdx >= 0 ? cols[nameIdx] : cols[3])?.trim() ||
      username ||
      url;

    if (!url) {
      errors.push(`Dòng ${i + 1}: thiếu URL — bỏ qua.`);
      continue;
    }
    rows.push({ title, url, username, password });
  }

  return { rows, errors };
}

function parseCsvRecords(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n" || (ch === "\r" && next === "\n")) {
      row.push(field);
      field = "";
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      if (ch === "\r") i++;
      continue;
    }
    if (ch === "\r") continue;
    field += ch;
  }
  row.push(field);
  if (row.some((c) => c.length > 0)) rows.push(row);
  return rows;
}

export function parseLoginJson(text: string): {
  rows: ImportRow[];
  errors: string[];
} {
  const errors: string[] = [];
  try {
    const data = JSON.parse(text) as unknown;
    const list = Array.isArray(data)
      ? data
      : data &&
          typeof data === "object" &&
          Array.isArray((data as { logins?: unknown }).logins)
        ? (data as { logins: unknown[] }).logins
        : null;
    if (!list) {
      return { rows: [], errors: ["JSON phải là mảng hoặc { \"logins\": [...] }."] };
    }
    const rows: ImportRow[] = [];
    list.forEach((item, i) => {
      if (!item || typeof item !== "object") {
        errors.push(`Mục ${i + 1}: không hợp lệ.`);
        return;
      }
      const o = item as Record<string, unknown>;
      const url = String(o.url ?? o.URL ?? "").trim();
      const username = String(o.username ?? o.login ?? "").trim();
      const password = String(o.password ?? "").trim();
      const title = String(o.title ?? o.name ?? username ?? url).trim();
      if (!url) {
        errors.push(`Mục ${i + 1}: thiếu url.`);
        return;
      }
      rows.push({ title, url, username, password });
    });
    return { rows, errors };
  } catch {
    return { rows: [], errors: ["JSON không đọc được."] };
  }
}
