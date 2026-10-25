export type VaultState = {
  configured: boolean;
  unlocked: boolean;
  itemCount: number;
};

export type LoginSummary = {
  id: string;
  title: string;
  username: string;
};

export type PasswordGenHistoryEntry = {
  id: string;
  password: string;
  createdAt: number;
};

export type FillContext = {
  configured: boolean;
  unlocked: boolean;
  accounts: LoginSummary[];
};

export type BgRequest =
  | { type: "GET_STATE" }
  | { type: "SETUP"; masterPassword: string }
  | { type: "UNLOCK"; masterPassword: string }
  | { type: "LOCK" }
  | { type: "RESET" }
  | { type: "GET_FILL_CONTEXT"; hostname: string }
  | { type: "GET_LOGIN_CREDENTIALS"; id: string }
  | {
      type: "UPSERT_LOGIN";
      login: {
        id?: string;
        title: string;
        url: string;
        username: string;
        password: string;
      };
    }
  | { type: "DELETE_LOGIN"; id: string }
  | { type: "LIST_ALL_LOGINS" }
  | {
      type: "IMPORT_LOGINS";
      logins: Array<{
        title: string;
        url: string;
        username: string;
        password: string;
        notes?: string;
      }>;
    }
  | {
      type: "LOGIN_ATTEMPT";
      username: string;
      password: string;
      title: string;
      hostname: string;
      fromPath: string;
    }
  | { type: "TAKE_PENDING_SAVE"; hostname: string; pathname: string }
  | { type: "CLEAR_PENDING_SAVE" }
  | {
      type: "QUEUE_LOGIN_SAVE";
      login: {
        id?: string;
        title: string;
        url: string;
        username: string;
        password: string;
      };
    }
  | {
      type: "SAVE_LOGIN";
      login: {
        id?: string;
        title: string;
        url: string;
        username: string;
        password: string;
      };
    }
  | { type: "GET_PASSWORD_GEN_HISTORY" }
  | { type: "RECORD_PASSWORD_GEN_HISTORY"; password: string }
  | { type: "REMOVE_PASSWORD_GEN_HISTORY"; id: string }
  | { type: "CLEAR_PASSWORD_GEN_HISTORY" };

export type BgResponse =
  | {
      ok: true;
      state?: VaultState;
      message?: string;
      fill?: FillContext;
      credentials?: { username: string; password: string };
      logins?: Array<{
        id: string;
        title: string;
        url: string;
        username: string;
      }>;
      pendingSave?: {
        username: string;
        password: string;
        title: string;
        hostname: string;
      };
      passwordGenHistory?: PasswordGenHistoryEntry[];
    }
  | { ok: false; error: string };

export function sendBg(req: BgRequest): Promise<BgResponse> {
  return chrome.runtime.sendMessage(req) as Promise<BgResponse>;
}
