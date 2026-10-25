import * as session from "./session.js";
import { encryptPayload, saveVaultEnc } from "./storage.js";

export async function persistVault(): Promise<void> {
  const key = session.getVaultAesKey();
  const payload = session.getVaultPayload();
  if (!key || !payload) {
    throw new Error("Vault đang khóa.");
  }
  const blob = await encryptPayload(key, payload);
  await saveVaultEnc(blob);
}
