import { persistVault } from "./persist.js";
import * as session from "./session.js";
import type { PasswordGenHistoryEntry } from "./types.js";

const LEGACY_STORAGE_KEY = "passwordGenHistory";
const MAX_ENTRIES = 50;

function newId(): string {
  return crypto.randomUUID();
}

function payloadOrThrow() {
  const payload = session.getVaultPayload();
  if (!payload) throw new Error("Vault đang khóa.");
  return payload;
}

function normalizeEntries(raw: unknown): PasswordGenHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is PasswordGenHistoryEntry =>
      !!e &&
      typeof e === "object" &&
      typeof (e as PasswordGenHistoryEntry).id === "string" &&
      typeof (e as PasswordGenHistoryEntry).password === "string" &&
      typeof (e as PasswordGenHistoryEntry).createdAt === "number",
  );
}

function capAndSort(entries: PasswordGenHistoryEntry[]): PasswordGenHistoryEntry[] {
  return [...entries]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_ENTRIES);
}

export function listPasswordGenHistory(): PasswordGenHistoryEntry[] {
  const payload = session.getVaultPayload();
  if (!payload) return [];
  return payload.passwordGenHistory ?? [];
}

export async function recordPasswordGenHistory(password: string): Promise<void> {
  if (!password) return;
  const payload = payloadOrThrow();
  const prev = payload.passwordGenHistory ?? [];
  if (prev[0]?.password === password) return;
  payload.passwordGenHistory = capAndSort([
    { id: newId(), password, createdAt: Date.now() },
    ...prev.filter((e) => e.password !== password),
  ]);
  await persistVault();
}

export async function removePasswordGenHistoryEntry(id: string): Promise<void> {
  const payload = payloadOrThrow();
  payload.passwordGenHistory = (payload.passwordGenHistory ?? []).filter((e) => e.id !== id);
  await persistVault();
}

export async function clearPasswordGenHistory(): Promise<void> {
  const payload = payloadOrThrow();
  payload.passwordGenHistory = [];
  await persistVault();
}

/** Một lần: gộp lịch sử plaintext cũ (v0.9.2) vào vault rồi xóa key. */
export async function migrateLegacyPlaintextGenHistory(): Promise<void> {
  const payload = session.getVaultPayload();
  if (!payload) return;

  const row = await chrome.storage.local.get(LEGACY_STORAGE_KEY);
  const legacy = normalizeEntries(row[LEGACY_STORAGE_KEY]);
  if (legacy.length === 0) return;

  const merged = capAndSort([...(payload.passwordGenHistory ?? []), ...legacy]);
  payload.passwordGenHistory = merged;
  await persistVault();
  await chrome.storage.local.remove(LEGACY_STORAGE_KEY);
}
