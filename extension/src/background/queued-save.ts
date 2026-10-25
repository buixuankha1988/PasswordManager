import * as logins from "../vault/logins.js";
import type { UpsertLoginInput } from "../vault/logins.js";
import * as session from "../vault/session.js";

const TTL_MS = 30 * 60_000;

type Row = { login: UpsertLoginInput; at: number };

const queue: Row[] = [];

function queueKey(login: UpsertLoginInput): string {
  return logins.loginIdentityKey(login.url, login.username);
}

function prune(): void {
  const now = Date.now();
  while (queue.length > 0 && now - queue[0]!.at > TTL_MS) {
    queue.shift();
  }
}

export function queueLoginSave(login: UpsertLoginInput): void {
  prune();
  const key = queueKey(login);
  const idx = queue.findIndex((row) => queueKey(row.login) === key);
  if (idx >= 0) queue.splice(idx, 1);
  queue.push({ login, at: Date.now() });
}

export async function flushQueuedLogins(): Promise<number> {
  if (!session.isUnlocked()) return 0;
  prune();
  let saved = 0;
  while (queue.length > 0) {
    const row = queue.shift()!;
    await logins.upsertLogin(row.login);
    saved += 1;
  }
  return saved;
}
