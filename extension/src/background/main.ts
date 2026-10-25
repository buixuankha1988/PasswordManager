import type { BgRequest, BgResponse } from "../shared/messages.js";
import * as vault from "../vault/service.js";
import * as logins from "../vault/logins.js";
import * as passGenHistory from "../vault/password-gen-history.js";
import * as pendingSave from "./pending-save.js";
import * as queuedSave from "./queued-save.js";

pendingSave.hookTabNavigation();

async function withQueuedFlush(response: BgResponse): Promise<BgResponse> {
  if (!response.ok) return response;
  const saved = await queuedSave.flushQueuedLogins();
  const merged = await logins.dedupeLoginItems();
  if ((saved > 0 || merged > 0) && response.message) {
    const parts = [response.message];
    if (saved > 0) parts.push(`Đã lưu ${saved} tài khoản đang chờ.`);
    if (merged > 0) parts.push(`Đã gộp ${merged} bản trùng.`);
    return { ...response, message: parts.join(" ") };
  }
  return response;
}

chrome.runtime.onMessage.addListener((request: BgRequest, sender, sendResponse) => {
  void (async () => {
    try {
      let response: BgResponse;
      switch (request.type) {
        case "GET_STATE":
          response = { ok: true, state: await vault.getPublicState() };
          break;
        case "SETUP":
          response = await withQueuedFlush(
            await vault.setupVault(request.masterPassword),
          );
          break;
        case "UNLOCK":
          response = await withQueuedFlush(
            await vault.unlockVault(request.masterPassword),
          );
          break;
        case "LOCK":
          response = vault.lockVault();
          break;
        case "RESET":
          response = await vault.resetVault();
          break;
        case "GET_FILL_CONTEXT": {
          const state = await vault.getPublicState();
          response = {
            ok: true,
            fill: {
              configured: state.configured,
              unlocked: state.unlocked,
              accounts: state.unlocked
                ? logins.listLoginsForHost(request.hostname)
                : [],
            },
          };
          break;
        }
        case "GET_LOGIN_CREDENTIALS": {
          if (!(await vault.getPublicState()).unlocked) {
            response = { ok: false, error: "Vault đang khóa." };
            break;
          }
          const credentials = logins.getLoginCredentials(request.id);
          if (!credentials) {
            response = { ok: false, error: "Không tìm thấy tài khoản." };
            break;
          }
          response = { ok: true, credentials };
          break;
        }
        case "UPSERT_LOGIN": {
          if (!(await vault.getPublicState()).unlocked) {
            response = { ok: false, error: "Mở khóa vault trước khi lưu." };
            break;
          }
          await logins.upsertLogin(request.login);
          response = { ok: true, message: "Đã lưu tài khoản." };
          break;
        }
        case "DELETE_LOGIN": {
          if (!(await vault.getPublicState()).unlocked) {
            response = { ok: false, error: "Vault đang khóa." };
            break;
          }
          await logins.deleteLogin(request.id);
          response = { ok: true, message: "Đã xóa." };
          break;
        }
        case "LIST_ALL_LOGINS": {
          const state = await vault.getPublicState();
          if (!state.unlocked) {
            response = { ok: false, error: "Vault đang khóa." };
            break;
          }
          await logins.dedupeLoginItems();
          response = {
            ok: true,
            logins: logins.listAllLogins().map((it) => ({
              id: it.id,
              title: it.title,
              url: it.url,
              username: it.username,
            })),
          };
          break;
        }
        case "IMPORT_LOGINS": {
          if (!(await vault.getPublicState()).unlocked) {
            response = { ok: false, error: "Mở khóa vault trước khi nhập." };
            break;
          }
          const { imported, skipped } = await logins.importLogins(
            request.logins.map((row) => ({
              title: row.title,
              url: row.url,
              username: row.username,
              password: row.password,
              notes: row.notes,
            })),
          );
          response = {
            ok: true,
            message: `Đã nhập ${imported} tài khoản${skipped > 0 ? ` (${skipped} bỏ qua)` : ""}.`,
          };
          break;
        }
        case "LOGIN_ATTEMPT": {
          const tabId = sender.tab?.id;
          if (!tabId) {
            response = { ok: false, error: "Không xác định tab." };
            break;
          }
          pendingSave.rememberLoginAttempt(tabId, {
            username: request.username,
            password: request.password,
            title: request.title,
            hostname: request.hostname.toLowerCase(),
            fromPath: request.fromPath,
          });
          response = { ok: true };
          break;
        }
        case "TAKE_PENDING_SAVE": {
          const tabId = sender.tab?.id;
          if (!tabId) {
            response = { ok: true };
            break;
          }
          const row = pendingSave.takePendingSave(
            tabId,
            request.hostname,
            request.pathname,
          );
          if (!row) {
            response = { ok: true };
            break;
          }
          response = {
            ok: true,
            pendingSave: {
              username: row.username,
              password: row.password,
              title: row.title,
              hostname: row.hostname,
            },
          };
          break;
        }
        case "CLEAR_PENDING_SAVE": {
          const tabId = sender.tab?.id;
          if (tabId) pendingSave.clearLoginAttempt(tabId);
          response = { ok: true };
          break;
        }
        case "QUEUE_LOGIN_SAVE": {
          queuedSave.queueLoginSave(request.login);
          response = {
            ok: true,
            message: "Đã xếp hàng — tự lưu khi bạn mở khóa vault (icon extension).",
          };
          break;
        }
        case "GET_PASSWORD_GEN_HISTORY": {
          if (!(await vault.getPublicState()).unlocked) {
            response = { ok: false, error: "Vault đang khóa." };
            break;
          }
          response = {
            ok: true,
            passwordGenHistory: passGenHistory.listPasswordGenHistory(),
          };
          break;
        }
        case "RECORD_PASSWORD_GEN_HISTORY": {
          if (!(await vault.getPublicState()).unlocked) {
            response = { ok: false, error: "Vault đang khóa." };
            break;
          }
          await passGenHistory.recordPasswordGenHistory(request.password);
          response = { ok: true };
          break;
        }
        case "REMOVE_PASSWORD_GEN_HISTORY": {
          if (!(await vault.getPublicState()).unlocked) {
            response = { ok: false, error: "Vault đang khóa." };
            break;
          }
          await passGenHistory.removePasswordGenHistoryEntry(request.id);
          response = { ok: true };
          break;
        }
        case "CLEAR_PASSWORD_GEN_HISTORY": {
          if (!(await vault.getPublicState()).unlocked) {
            response = { ok: false, error: "Vault đang khóa." };
            break;
          }
          await passGenHistory.clearPasswordGenHistory();
          response = { ok: true };
          break;
        }
        case "SAVE_LOGIN": {
          const saveState = await vault.getPublicState();
          if (!saveState.configured) {
            response = { ok: false, error: "Chưa tạo vault trong extension." };
            break;
          }
          if (saveState.unlocked) {
            await logins.upsertLogin(request.login);
            await logins.dedupeLoginItems();
            response = { ok: true, message: "Đã lưu tài khoản." };
            break;
          }
          queuedSave.queueLoginSave(request.login);
          response = {
            ok: true,
            message: "Đã ghi nhớ — mở khóa extension (icon) để hoàn tất lưu.",
          };
          break;
        }
        default:
          response = { ok: false, error: "Lệnh không hợp lệ." };
      }
      sendResponse(response);
    } catch (err) {
      console.error("[Password Manager]", err);
      const detail = err instanceof Error ? err.message : String(err);
      sendResponse({
        ok: false,
        error: detail ? `Lỗi nội bộ: ${detail}` : "Lỗi nội bộ. Thử lại.",
      });
    }
  })();
  return true;
});
