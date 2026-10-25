import { fromBase64, toBase64 } from "../shared/bytes.js";
import type { VaultEncBlob, VaultMeta, VaultPayload } from "./types.js";
import { emptyVaultPayload } from "./types.js";

const KEY_META = "vaultMeta";
const KEY_ENC = "vaultEnc";

export async function loadVaultMeta(): Promise<VaultMeta | null> {
  const row = (await chrome.storage.local.get(KEY_META))[KEY_META];
  if (!row || typeof row !== "object") return null;
  const m = row as VaultMeta;
  if (m.version !== 1 || !m.saltB64 || !m.verifierB64) return null;
  return m;
}

export async function saveVaultMeta(meta: VaultMeta): Promise<void> {
  await chrome.storage.local.set({ [KEY_META]: meta });
}

export async function loadVaultEnc(): Promise<VaultEncBlob | null> {
  const row = (await chrome.storage.local.get(KEY_ENC))[KEY_ENC];
  if (!row || typeof row !== "object") return null;
  const b = row as VaultEncBlob;
  if (b.version !== 1 || !b.ivB64 || !b.ciphertextB64) return null;
  return b;
}

export async function saveVaultEnc(blob: VaultEncBlob): Promise<void> {
  await chrome.storage.local.set({ [KEY_ENC]: blob });
}

export async function clearAllVaultStorage(): Promise<void> {
  await chrome.storage.local.remove([KEY_META, KEY_ENC]);
}

export async function encryptPayload(
  aesKey: CryptoKey,
  payload: VaultPayload,
): Promise<VaultEncBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    plain,
  );
  return {
    version: 1,
    ivB64: toBase64(iv),
    ciphertextB64: toBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptPayload(
  aesKey: CryptoKey,
  blob: VaultEncBlob,
): Promise<VaultPayload> {
  const iv = fromBase64(blob.ivB64);
  const ciphertext = fromBase64(blob.ciphertextB64);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    ciphertext,
  );
  const parsed = JSON.parse(new TextDecoder().decode(plain)) as VaultPayload;
  if (parsed.version !== 1 || !Array.isArray(parsed.items)) {
    throw new Error("Vault payload không hợp lệ.");
  }
  if (!Array.isArray(parsed.passwordGenHistory)) {
    parsed.passwordGenHistory = [];
  }
  return parsed;
}

export { emptyVaultPayload };
