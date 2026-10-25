import {
  fromBase64,
  randomBytes,
  timingSafeEqual,
  toBase64,
  zeroize,
} from "../shared/bytes.js";
import { deriveKeyMaterial } from "../crypto/argon2.js";
import {
  deriveVaultAesKey,
  deriveVerifier,
  verifyMasterPassword,
} from "../crypto/master-key.js";
import {
  clearAllVaultStorage,
  decryptPayload,
  emptyVaultPayload,
  encryptPayload,
  loadVaultEnc,
  loadVaultMeta,
  saveVaultEnc,
  saveVaultMeta,
} from "./storage.js";
import { migrateLegacyPlaintextGenHistory } from "./password-gen-history.js";
import * as session from "./session.js";
import type { VaultMeta } from "./types.js";

const LEGACY_GEN_HISTORY_KEY = "passwordGenHistory";

export async function getPublicState() {
  const meta = await loadVaultMeta();
  return {
    configured: meta !== null,
    unlocked: session.isUnlocked(),
    itemCount: session.itemCount(),
  };
}

async function verifyLegacyRawArgon2(
  password: string,
  salt: Uint8Array,
  expectedVerifier: Uint8Array,
): Promise<boolean> {
  const material = await deriveKeyMaterial(password, salt);
  try {
    return timingSafeEqual(material, expectedVerifier);
  } finally {
    zeroize(material);
  }
}

async function unlockWithPassword(
  password: string,
  meta: VaultMeta,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const salt = fromBase64(meta.saltB64);
  const verifier = fromBase64(meta.verifierB64);

  let passwordOk = false;
  if (meta.kdf === "hkdf-v1") {
    passwordOk = await verifyMasterPassword(password, salt, verifier);
  } else {
    passwordOk = await verifyLegacyRawArgon2(password, salt, verifier);
  }

  if (!passwordOk) {
    session.clearSession();
    return { ok: false, error: "Master password không đúng." };
  }

  let aesKey: CryptoKey;
  try {
    aesKey = await deriveVaultAesKey(password, salt);
  } catch {
    return { ok: false, error: "Không tạo được master key." };
  }

  let enc = await loadVaultEnc();
  if (!enc) {
    try {
      const blob = await encryptPayload(aesKey, emptyVaultPayload());
      await saveVaultEnc(blob);
      enc = blob;
    } catch {
      session.clearSession();
      return { ok: false, error: "Không mã hóa được vault (crypto)." };
    }
  }

  let payload;
  try {
    payload = await decryptPayload(aesKey, enc);
  } catch {
    session.clearSession();
    return {
      ok: false,
      error: "Không giải mã vault — dữ liệu hỏng hoặc master password sai.",
    };
  }

  session.setSession(aesKey, payload);
  try {
    await migrateLegacyPlaintextGenHistory();
  } catch {
    /* không chặn mở khóa nếu migrate lỗi */
  }

  if (meta.kdf !== "hkdf-v1") {
    const newVerifier = await deriveVerifier(password, salt);
    await saveVaultMeta({
      version: 1,
      saltB64: meta.saltB64,
      verifierB64: toBase64(newVerifier),
      kdf: "hkdf-v1",
    });
    zeroize(newVerifier);
  }

  return { ok: true };
}

export async function setupVault(
  masterPassword: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  if (await loadVaultMeta()) {
    return {
      ok: false,
      error: "Vault đã được thiết lập. Hãy mở khóa hoặc reset trong Cài đặt.",
    };
  }

  const trimmed = masterPassword.trim();
  if (trimmed.length < 8) {
    return { ok: false, error: "Master password cần ít nhất 8 ký tự." };
  }

  const salt = randomBytes(16);
  const verifier = await deriveVerifier(trimmed, salt);
  const meta: VaultMeta = {
    version: 1,
    saltB64: toBase64(salt),
    verifierB64: toBase64(verifier),
    kdf: "hkdf-v1",
  };
  zeroize(verifier);

  await saveVaultMeta(meta);

  const unlocked = await unlockWithPassword(trimmed, meta);
  if (!unlocked.ok) {
    await clearAllVaultStorage();
    session.clearSession();
    return { ok: false, error: unlocked.error };
  }

  return {
    ok: true,
    message: "Đã tạo master password. Master key đang active trong phiên này.",
  };
}

export async function unlockVault(
  masterPassword: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const meta = await loadVaultMeta();
  if (!meta) {
    return { ok: false, error: "Chưa thiết lập vault. Tạo master password mới." };
  }

  const result = await unlockWithPassword(masterPassword.trim(), meta);
  if (!result.ok) return result;

  return {
    ok: true,
    message: `Đã mở khóa. ${session.itemCount()} mục trong vault.`,
  };
}

export function lockVault(): { ok: true; message: string } {
  session.clearSession();
  return { ok: true, message: "Đã khóa vault và xóa master key khỏi RAM." };
}

export async function resetVault(): Promise<{ ok: true; message: string }> {
  session.clearSession();
  await clearAllVaultStorage();
  await chrome.storage.local.remove(LEGACY_GEN_HISTORY_KEY);
  return { ok: true, message: "Đã reset vault local." };
}

