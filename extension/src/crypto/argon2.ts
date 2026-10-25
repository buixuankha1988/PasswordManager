import { argon2id } from "hash-wasm";

/** Raw 32-byte key material from master password + salt (Argon2id). */
export async function deriveKeyMaterial(
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const hash = await argon2id({
    password,
    salt,
    parallelism: 1,
    iterations: 3,
    memorySize: 65536,
    hashLength: 32,
    outputType: "binary",
  });
  return new Uint8Array(hash);
}
