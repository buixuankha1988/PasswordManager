import * as session from "./session.js";
import type { VaultItem } from "./types.js";
import { persistVault } from "./persist.js";

export type LoginSummary = {
  id: string;
  title: string;
  username: string;
};

export function normalizeHost(urlOrHost: string): string {
  const raw = urlOrHost.trim();
  if (!raw) return "";
  try {
    const url = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    return url.hostname.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function loginItems(): VaultItem[] {
  const payload = session.getVaultPayload();
  if (!payload) return [];
  return payload.items.filter((it) => it.kind === "login");
}

export function listLoginsForHost(pageHost: string): LoginSummary[] {
  const host = pageHost.toLowerCase();
  return loginItems()
    .filter((it) => normalizeHost(it.url) === host)
    .map((it) => ({
      id: it.id,
      title: it.title.trim() || it.username || normalizeHost(it.url),
      username: it.username,
    }));
}

export function listAllLogins(): VaultItem[] {
  return loginItems();
}

export function getLoginCredentials(
  id: string,
): { username: string; password: string } | null {
  const item = loginItems().find((it) => it.id === id);
  if (!item) return null;
  return { username: item.username, password: item.password };
}

export type UpsertLoginInput = {
  id?: string;
  title: string;
  url: string;
  username: string;
  password: string;
  notes?: string;
};

export function loginIdentityKey(host: string, username: string): string {
  return `${normalizeHost(host)}|${username.trim().toLowerCase()}`;
}

function findLoginIndexByIdentity(
  payload: { items: VaultItem[] },
  host: string,
  username: string,
): number {
  const key = loginIdentityKey(host, username);
  return payload.items.findIndex(
    (it) =>
      it.kind === "login" &&
      loginIdentityKey(it.url, it.username) === key,
  );
}

/** Gộp bản trùng (cùng site + username), giữ bản cập nhật mới nhất. */
export async function dedupeLoginItems(): Promise<number> {
  const payload = session.getVaultPayload();
  if (!payload) return 0;

  const bestByKey = new Map<string, VaultItem>();
  for (const it of loginItems()) {
    const key = loginIdentityKey(it.url, it.username);
    const prev = bestByKey.get(key);
    if (!prev || it.updatedAt >= prev.updatedAt) {
      bestByKey.set(key, it);
    }
  }

  const keepIds = new Set([...bestByKey.values()].map((it) => it.id));
  const before = payload.items.length;
  payload.items = payload.items.filter(
    (it) => it.kind !== "login" || keepIds.has(it.id),
  );
  const removed = before - payload.items.length;
  if (removed > 0) await persistVault();
  return removed;
}

export async function upsertLogin(input: UpsertLoginInput): Promise<VaultItem> {
  const payload = session.getVaultPayload();
  if (!payload) throw new Error("Vault đang khóa.");

  const now = new Date().toISOString();
  const host = normalizeHost(input.url);
  const url = host ? `https://${host}` : input.url.trim();

  let idx =
    input.id !== undefined
      ? payload.items.findIndex((it) => it.id === input.id)
      : -1;
  if (idx < 0) {
    idx = findLoginIndexByIdentity(payload, host, input.username);
  }

  if (idx >= 0) {
    const prev = payload.items[idx]!;
    const nextPassword =
      input.password.length > 0 ? input.password : prev.password;
    const next: VaultItem = {
      ...prev,
      title: input.title.trim(),
      url,
      username: input.username.trim(),
      password: nextPassword,
      notes: input.notes ?? prev.notes,
      updatedAt: now,
    };
    payload.items[idx] = next;
    await persistVault();
    return next;
  }

  const item: VaultItem = {
    id: crypto.randomUUID(),
    kind: "login",
    title: input.title.trim(),
    url,
    username: input.username.trim(),
    password: input.password,
    notes: input.notes ?? "",
    favorite: false,
    createdAt: now,
    updatedAt: now,
  };
  payload.items.push(item);
  await persistVault();
  return item;
}

export async function importLogins(
  inputs: UpsertLoginInput[],
): Promise<{ imported: number; skipped: number }> {
  const payload = session.getVaultPayload();
  if (!payload) throw new Error("Vault đang khóa.");

  let imported = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const input of inputs) {
    const host = normalizeHost(input.url);
    if (!host) {
      skipped += 1;
      continue;
    }
    const url = `https://${host}`;
    let idx = findLoginIndexByIdentity(payload, host, input.username);

    if (idx >= 0) {
      const prev = payload.items[idx]!;
      const nextPassword =
        input.password.length > 0 ? input.password : prev.password;
      payload.items[idx] = {
        ...prev,
        title: input.title.trim() || prev.title,
        url,
        username: input.username.trim(),
        password: nextPassword,
        notes: input.notes?.trim() ? input.notes.trim() : prev.notes,
        updatedAt: now,
      };
    } else {
      payload.items.push({
        id: crypto.randomUUID(),
        kind: "login",
        title: input.title.trim() || input.username || host,
        url,
        username: input.username.trim(),
        password: input.password,
        notes: input.notes?.trim() ?? "",
        favorite: false,
        createdAt: now,
        updatedAt: now,
      });
    }
    imported += 1;
  }

  if (imported > 0) await persistVault();
  await dedupeLoginItems();
  return { imported, skipped };
}

export async function deleteLogin(id: string): Promise<boolean> {
  const payload = session.getVaultPayload();
  if (!payload) throw new Error("Vault đang khóa.");
  const before = payload.items.length;
  payload.items = payload.items.filter((it) => it.id !== id);
  if (payload.items.length === before) return false;
  await persistVault();
  return true;
}
