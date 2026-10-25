import type { VaultPayload } from "./types.js";

/** In-memory session after unlock (cleared on LOCK or SW restart). */
let vaultAesKey: CryptoKey | null = null;
let vaultPayload: VaultPayload | null = null;

export function isUnlocked(): boolean {
  return vaultAesKey !== null;
}

export function getVaultAesKey(): CryptoKey | null {
  return vaultAesKey;
}

export function getVaultPayload(): VaultPayload | null {
  return vaultPayload;
}

export function setSession(aesKey: CryptoKey, payload: VaultPayload): void {
  vaultAesKey = aesKey;
  vaultPayload = payload;
}

export function clearSession(): void {
  vaultAesKey = null;
  vaultPayload = null;
}

export function itemCount(): number {
  return vaultPayload?.items.length ?? 0;
}
