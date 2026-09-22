import { BG_MSG_STORAGE } from "../shared/constants";
import { asErrorMessage, sendBridgeResponse } from "../shared/utils";
import { ext, storageGet, storageRemove, storageSet } from "../shared/webext";
import { prepareAccountWrite, sanitizePublicAccount } from "./account-policy";

type StorageOperations = {
  get: (keys: unknown) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
};

const storage: StorageOperations = {
  get: storageGet,
  set: storageSet,
  remove: storageRemove,
};

function publicStorageValue(key: string, value: unknown): unknown {
  if (key === "account") return sanitizePublicAccount(value);
  // Provider sessions belong to a page, not to every page using the extension.
  if (key === "VOTSession") return undefined;
  return value;
}

type GmStorageMessage = {
  type: string;
  action?: string;
  payload?: Record<string, unknown>;
};

function isGmStorageMessage(msg: unknown): msg is GmStorageMessage {
  if (!msg || typeof msg !== "object") return false;
  return (msg as { type?: unknown }).type === BG_MSG_STORAGE;
}

function normalizeStorageRequestKey(value: unknown): string {
  switch (typeof value) {
    case "string":
      return value;
    case "number":
    case "boolean":
    case "bigint":
      return String(value);
    default:
      return "";
  }
}

export async function handleStorageRequest(
  action: string,
  payload: Record<string, unknown> | undefined,
  senderUrl?: string,
  operations: StorageOperations = storage,
): Promise<unknown> {
  switch (action) {
    case "gm_getValue": {
      const key = normalizeStorageRequestKey(payload?.key);
      const def = payload?.def;
      const items = await operations.get(key);
      return publicStorageValue(
        key,
        Object.hasOwn(items, key) ? items[key] : def,
      );
    }

    case "gm_setValue": {
      const key = normalizeStorageRequestKey(payload?.key);
      if (key === "VOTSession") return true;
      let value = payload?.value;
      if (key === "account") {
        const current = await operations.get("account");
        value = prepareAccountWrite(value, current.account, senderUrl);
      }
      await operations.set({ [key]: value });
      return true;
    }

    case "gm_deleteValue": {
      const key = normalizeStorageRequestKey(payload?.key);
      await operations.remove(key);
      return true;
    }

    case "gm_listValues": {
      const items = await operations.get(null);
      return Object.keys(items ?? {}).filter((key) => key !== "VOTSession");
    }

    case "gm_getValues": {
      const defaults = payload?.defaults;
      if (
        !defaults ||
        typeof defaults !== "object" ||
        Array.isArray(defaults)
      ) {
        throw new TypeError("Storage defaults must be an object");
      }
      const requested = Object.fromEntries(Object.entries(defaults));
      const items = await operations.get(requested);
      return Object.fromEntries(
        Object.keys(requested).map((key) => [
          key,
          publicStorageValue(
            key,
            Object.hasOwn(items, key) ? items[key] : requested[key],
          ),
        ]),
      );
    }

    default:
      throw new Error(`Unknown storage action: ${action}`);
  }
}

export function registerBackgroundStorageBridge(): void {
  ext?.runtime?.onMessage?.addListener?.(
    (
      msg: unknown,
      sender: { url?: string } | undefined,
      sendResponse: ((value: unknown) => void) | undefined,
    ) => {
      if (!isGmStorageMessage(msg)) return;

      void (async () => {
        try {
          const result = await handleStorageRequest(
            String(msg.action ?? ""),
            msg.payload,
            sender?.url,
          );
          sendBridgeResponse(sendResponse, { ok: true, result });
        } catch (error) {
          sendBridgeResponse(sendResponse, {
            ok: false,
            error: asErrorMessage(error),
          });
        }
      })();

      return true;
    },
  );
}
