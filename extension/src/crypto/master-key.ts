import { timingSafeEqual, zeroize } from "../shared/bytes.js";
import { deriveKeyMaterial } from "./argon2.js";

const HKDF_INFO_VERIFIER = new TextEncoder().encode("pm-local-v1|verifier");
const HKDF_INFO_VAULT = new TextEncoder().encode("pm-local-v1|vault-aes");

function copyBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

/** HKDF-SHA256 with PBKDF2 fallback (một số SW extension lỗi với HKDF). */
async function deriveSubkey(
  material: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const ikm = copyBytes(material);
  try {
    try {
      const baseKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
        "deriveBits",
      ]);
      const bits = await crypto.subtle.deriveBits(
        { name: "HKDF", hash: "SHA-256", salt: copyBytes(salt), info: copyBytes(info) },
        baseKey,
        length * 8,
      );
      return new Uint8Array(bits);
    } catch {
      const combinedSalt = new Uint8Array(salt.length + info.length);
      combinedSalt.set(salt, 0);
      combinedSalt.set(info, salt.length);
      const pbkdfKey = await crypto.subtle.importKey(
        "raw",
        ikm,
        "PBKDF2",
        false,
        ["deriveBits"],
      );
      const bits = await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: combinedSalt,
          iterations: 1,
          hash: "SHA-256",
        },
        pbkdfKey,
        length * 8,
      );
      return new Uint8Array(bits);
    }
  } finally {
    zeroize(ikm);
  }
}

/** Stored verifier — never used to decrypt vault directly. */
export async function deriveVerifier(
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const material = await deriveKeyMaterial(password, salt);
  try {
    return await deriveSubkey(material, salt, HKDF_INFO_VERIFIER, 32);
  } finally {
    zeroize(material);
  }
}

export async function verifyMasterPassword(
  password: string,
  salt: Uint8Array,
  expectedVerifier: Uint8Array,
): Promise<boolean> {
  const candidate = await deriveVerifier(password, salt);
  const ok = timingSafeEqual(candidate, expectedVerifier);
  zeroize(candidate);
  return ok;
}

/** AES-256-GCM key derived from master password — only while vault is unlocked in RAM. */
export async function deriveVaultAesKey(
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const material = await deriveKeyMaterial(password, salt);
  try {
    const rawAes = await deriveSubkey(material, salt, HKDF_INFO_VAULT, 32);
    const keyBytes = copyBytes(rawAes);
    zeroize(rawAes);
    return await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    zeroize(material);
  }
}
