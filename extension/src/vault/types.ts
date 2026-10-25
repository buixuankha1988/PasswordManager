export type VaultMeta = {
  version: 1;
  saltB64: string;
  verifierB64: string;
  /** New installs use HKDF split; omit = legacy Argon2 raw verifier (v0.1). */
  kdf?: "hkdf-v1";
};

export type VaultEncBlob = {
  version: 1;
  ivB64: string;
  ciphertextB64: string;
};

export type PasswordGenHistoryEntry = {
  id: string;
  password: string;
  createdAt: number;
};

export type VaultPayload = {
  version: 1;
  items: VaultItem[];
  /** Mật khẩu đã tạo bằng generator — lưu cùng vault (AES-GCM). */
  passwordGenHistory?: PasswordGenHistoryEntry[];
};

export type VaultItem = {
  id: string;
  kind: "login";
  title: string;
  url: string;
  username: string;
  password: string;
  notes: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
};

export function emptyVaultPayload(): VaultPayload {
  return { version: 1, items: [], passwordGenHistory: [] };
}
