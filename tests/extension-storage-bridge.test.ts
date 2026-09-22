import { describe, expect, test } from "bun:test";
import { authServerUrl } from "../src/config/config";
import { PUBLIC_ACCOUNT_TOKEN } from "../src/extension/background/account-policy";
import { handleStorageRequest } from "../src/extension/background/storage-bridge";

function fixture() {
  const values: Record<string, unknown> = {
    account: { token: "TEST_ONLY_ACCOUNT_TOKEN", expires: Date.now() + 60_000 },
    VOTSession: { secretKey: "TEST_ONLY_SESSION_KEY" },
    autoTranslate: true,
  };
  const operations = {
    async get(keys: unknown) {
      if (keys === null) return { ...values };
      if (typeof keys === "string") {
        return Object.hasOwn(values, keys) ? { [keys]: values[keys] } : {};
      }
      return Object.fromEntries(
        Object.entries(keys as Record<string, unknown>).map(
          ([key, fallback]) => [
            key,
            Object.hasOwn(values, key) ? values[key] : fallback,
          ],
        ),
      );
    },
    async set(items: Record<string, unknown>) {
      Object.assign(values, items);
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key];
    },
  };
  const request = (
    action: string,
    payload: Record<string, unknown>,
    sender = "https://www.youtube.com/watch?v=test",
  ) => handleStorageRequest(action, payload, sender, operations);
  return { request, values };
}

describe("native storage bridge credential boundary", () => {
  test("single and bulk reads never return account or persisted session secrets", async () => {
    const { request } = fixture();
    const single = await request("gm_getValue", { key: "account" });
    expect(single).toMatchObject({ token: PUBLIC_ACCOUNT_TOKEN });
    const bulk = await request("gm_getValues", {
      defaults: { account: {}, VOTSession: {}, autoTranslate: false },
    });
    expect(bulk).toMatchObject({
      account: { token: PUBLIC_ACCOUNT_TOKEN },
      VOTSession: undefined,
      autoTranslate: true,
    });
    expect(JSON.stringify([single, bulk])).not.toContain("TEST_ONLY_");
    expect(await request("gm_getValue", { key: "VOTSession" })).toBeUndefined();
    expect(await request("gm_listValues", {})).not.toContain("VOTSession");
  });

  test("rejects malformed bulk requests instead of interpreting them as all keys", async () => {
    const { request } = fixture();
    for (const defaults of [null, undefined, [], "account", 0]) {
      await expect(request("gm_getValues", { defaults })).rejects.toThrow(
        "object",
      );
    }
  });

  test("page writes cannot replace credentials or persist shared provider sessions", async () => {
    const { request, values } = fixture();
    const original = values.account;
    await expect(
      request("gm_setValue", {
        key: "account",
        value: { token: "NEW_TEST_TOKEN", expires: Date.now() + 60_000 },
      }),
    ).rejects.toThrow("trusted sign-in");
    expect(values.account).toEqual(original);
    await request("gm_setValue", { key: "VOTSession", value: "new session" });
    expect(values.VOTSession).toEqual({ secretKey: "TEST_ONLY_SESSION_KEY" });
  });

  test("trusted callback and profile update keep the real credential private", async () => {
    const { request, values } = fixture();
    await request(
      "gm_setValue",
      {
        key: "account",
        value: { token: "NEW_TEST_TOKEN", expires: Date.now() + 60_000 },
      },
      `${authServerUrl}/auth/callback`,
    );
    const publicAccount = (await request("gm_getValue", {
      key: "account",
    })) as Record<string, unknown>;
    await request(
      "gm_setValue",
      {
        key: "account",
        value: {
          ...publicAccount,
          username: "test-user",
          avatarId: "test-avatar",
        },
      },
      `${authServerUrl}/my/profile`,
    );
    expect(values.account).toMatchObject({
      token: "NEW_TEST_TOKEN",
      username: "test-user",
    });
    expect(await request("gm_getValue", { key: "account" })).toMatchObject({
      token: PUBLIC_ACCOUNT_TOKEN,
      username: "test-user",
    });
    await request("gm_deleteValue", { key: "account" });
    expect(await request("gm_getValue", { key: "account", def: {} })).toEqual(
      {},
    );
  });
});
