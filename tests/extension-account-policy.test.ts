import { describe, expect, test } from "bun:test";
import { authServerUrl } from "../src/config/config";
import {
  hasAccountTokenPlaceholder,
  PUBLIC_ACCOUNT_TOKEN,
  prepareAccountWrite,
  prepareAuthenticatedRequest,
  sanitizePublicAccount,
} from "../src/extension/background/account-policy";

const secret = "test-only-oauth-secret";
const account = () => ({
  token: secret,
  expires: Date.now() + 60_000,
  username: "Tester",
  avatarId: "avatar",
});
const authorization = `OAuth ${PUBLIC_ACCOUNT_TOKEN}`;
const directUrl = "https://api.browser.yandex.ru/video-translation/translate";
const proxyUrls = [
  "https://vot-worker.eu.cc/video-translation/translate",
  "https://vot-worker.vtrans.eu.cc/video-translation/translate",
];
const wrap = (value: unknown) => btoa(JSON.stringify(value));

describe("extension account projection and writes", () => {
  test("projects only public fields and never the bearer credential", () => {
    const stored = { ...account(), nested: { token: secret }, unknown: secret };
    expect(sanitizePublicAccount(stored)).toEqual({
      token: PUBLIC_ACCOUNT_TOKEN,
      expires: stored.expires,
      username: "Tester",
      avatarId: "avatar",
    });
    expect(JSON.stringify(sanitizePublicAccount(stored))).not.toContain(secret);
    expect(stored.token).toBe(secret);
  });

  test("does not expose inherited fields, arrays, or invalid accounts", () => {
    for (const value of [
      null,
      [],
      [account()],
      Object.create(account()),
      { token: secret },
      { ...account(), token: PUBLIC_ACCOUNT_TOKEN },
      { ...account(), expires: Number.POSITIVE_INFINITY },
    ]) {
      expect(sanitizePublicAccount(value)).toEqual({});
    }
    const value = JSON.parse(
      `{"__proto__":{"token":"${secret}"},"username":"x"}`,
    );
    expect(sanitizePublicAccount(value)).toEqual({});
  });

  test("accepts credentials only from the exact trusted callback", () => {
    const value = account();
    expect(
      prepareAccountWrite(value, undefined, `${authServerUrl}/auth/callback#x`),
    ).toEqual({ token: secret, expires: value.expires });
    for (const sender of [
      undefined,
      "https://www.youtube.com/watch?v=x",
      `${authServerUrl}.example/auth/callback`,
      `${authServerUrl.replace("https:", "http:")}/auth/callback`,
      `${authServerUrl}/auth/callback/other`,
      `${authServerUrl}/other`,
      `${authServerUrl.replace("https://", "https://user:pass@")}/auth/callback`,
    ]) {
      expect(() => prepareAccountWrite(value, undefined, sender)).toThrow();
    }
  });

  test("rejects invalid credentials and expiry at the callback", () => {
    for (const value of [
      {},
      [],
      { ...account(), token: "" },
      { ...account(), token: "token\r\nInjected: value" },
      { ...account(), token: PUBLIC_ACCOUNT_TOKEN },
      { ...account(), expires: 0 },
      { ...account(), expires: Number.NaN },
      { ...account(), expires: Number.POSITIVE_INFINITY },
    ]) {
      expect(() =>
        prepareAccountWrite(value, undefined, `${authServerUrl}/auth/callback`),
      ).toThrow();
    }
  });

  test("profile update can only change username and avatar", () => {
    const stored = account();
    expect(
      prepareAccountWrite(
        {
          token: "attacker-replacement",
          expires: 1,
          username: "Updated",
          avatarId: "new-avatar",
          nested: { token: "extra" },
        },
        stored,
        `${authServerUrl}/my/profile`,
      ),
    ).toEqual({ ...stored, username: "Updated", avatarId: "new-avatar" });
    expect(() =>
      prepareAccountWrite(account(), undefined, `${authServerUrl}/my/profile`),
    ).toThrow();
  });
});

describe("extension account credential injection", () => {
  test("finds placeholders before loading private account storage", () => {
    expect(hasAccountTokenPlaceholder({ Accept: "audio/webm" })).toBe(false);
    expect(hasAccountTokenPlaceholder({ Authorization: authorization })).toBe(
      true,
    );
    expect(
      hasAccountTokenPlaceholder({
        "X-VOT-Headers": wrap({ Authorization: authorization }),
      }),
    ).toBe(true);
    expect(
      hasAccountTokenPlaceholder({
        "X-VOT-Headers": wrap({ Accept: "application/x-protobuf" }),
      }),
    ).toBe(false);
    expect(() =>
      hasAccountTokenPlaceholder({ "X-VOT-Headers": "broken" }),
    ).toThrow();
  });

  test("injects only the direct Authorization header without mutating input", () => {
    const headers = {
      aUtHoRiZaTiOn: authorization,
      Accept: "application/x-protobuf",
    };
    const result = prepareAuthenticatedRequest(
      { url: directUrl, method: "post", headers },
      account(),
    );
    expect(result).toEqual({
      headers: { ...headers, aUtHoRiZaTiOn: `OAuth ${secret}` },
      authenticated: true,
      redirect: "error",
    });
    expect(headers.aUtHoRiZaTiOn).toBe(authorization);
  });

  test("injects encoded headers only for the two fixed proxy origins", () => {
    for (const url of proxyUrls) {
      const packed = wrap({
        Authorization: authorization,
        "Sec-Vtrans-Sk": "session",
      });
      const headers = { "x-vot-HEADERS": packed };
      const result = prepareAuthenticatedRequest(
        { url, method: "POST", headers },
        account(),
      );
      expect(JSON.parse(atob(result.headers["x-vot-HEADERS"]))).toEqual({
        Authorization: `OAuth ${secret}`,
        "Sec-Vtrans-Sk": "session",
      });
      expect(result.authenticated).toBe(true);
      expect(result.redirect).toBe("error");
      expect(headers["x-vot-HEADERS"]).toBe(packed);
    }
  });

  test("leaves anonymous requests independent of account availability", () => {
    const headers = { Accept: "application/json" };
    expect(
      prepareAuthenticatedRequest(
        { url: "https://example.org/", headers },
        null,
      ),
    ).toEqual({
      headers,
      authenticated: false,
    });
    const packed = {
      "X-VOT-Headers": wrap({ "Sec-Vtrans-Sk": "anonymous-session" }),
    };
    expect(
      prepareAuthenticatedRequest(
        { url: "https://custom.example/", headers: packed },
        null,
      ),
    ).toEqual({
      headers: packed,
      authenticated: false,
    });
  });

  test("rejects untrusted destinations, alternate paths and redirect URLs", () => {
    for (const url of [
      "http://api.browser.yandex.ru/video-translation/translate",
      `${directUrl}?redirect=https://example.org`,
      `${directUrl}#fragment`,
      directUrl.replace(
        "api.browser.yandex.ru",
        "api.browser.yandex.ru.example.org",
      ),
      directUrl.replace("api.browser.yandex.ru", "api.browser.yandex.ru:444"),
      directUrl.replace("https://", "https://user:pass@"),
      directUrl.replace("/translate", "/other"),
      "https://custom-proxy.example/video-translation/translate",
      "not a URL",
      ...proxyUrls,
    ]) {
      expect(() =>
        prepareAuthenticatedRequest(
          { url, method: "POST", headers: { Authorization: authorization } },
          account(),
        ),
      ).toThrow();
    }
    for (const method of [undefined, "GET", "PUT", "DELETE"]) {
      expect(() =>
        prepareAuthenticatedRequest(
          { url: directUrl, method, headers: { Authorization: authorization } },
          account(),
        ),
      ).toThrow();
    }
    for (const url of [
      directUrl,
      "https://custom-proxy.example/video-translation/translate",
    ]) {
      expect(() =>
        prepareAuthenticatedRequest(
          {
            url,
            method: "POST",
            headers: {
              "X-VOT-Headers": wrap({ Authorization: authorization }),
            },
          },
          account(),
        ),
      ).toThrow();
    }
  });

  test("rejects missing or expired accounts instead of sending the marker", () => {
    for (const value of [
      null,
      {},
      { ...account(), expires: Date.now() - 1 },
      { ...account(), token: PUBLIC_ACCOUNT_TOKEN },
    ]) {
      expect(() =>
        prepareAuthenticatedRequest(
          {
            url: directUrl,
            method: "POST",
            headers: { Authorization: authorization },
          },
          value,
        ),
      ).toThrow();
    }
  });

  test("rejects malformed, duplicate and nested credential markers", () => {
    const cases: Record<string, string>[] = [
      { Authorization: `Bearer ${PUBLIC_ACCOUNT_TOKEN}` },
      { Authorization: `${authorization}extra` },
      { Authorization: authorization, authorization },
      { " Authorization": authorization },
      { Authorization: authorization, Other: PUBLIC_ACCOUNT_TOKEN },
      { Authorization: authorization, "X-VOT-Headers": wrap({ Accept: "x" }) },
      { "X-VOT-Headers": "not base64" },
      { "X-VOT-Headers": wrap([]) },
      { "X-VOT-Headers": wrap(null) },
      {
        "X-VOT-Headers": wrap({ Authorization: authorization, authorization }),
      },
      {
        "X-VOT-Headers": wrap({
          Authorization: authorization,
          Other: PUBLIC_ACCOUNT_TOKEN,
        }),
      },
      {
        "X-VOT-Headers": wrap({
          "X-VOT-Headers": wrap({ Authorization: authorization }),
        }),
      },
      {
        "X-VOT-Headers": wrap({ Authorization: authorization }),
        "x-vot-headers": wrap({ Authorization: authorization }),
      },
      {
        Authorization: "OAuth other",
        "X-VOT-Headers": wrap({ Authorization: authorization }),
      },
    ];
    for (const headers of cases) {
      expect(() =>
        prepareAuthenticatedRequest(
          { url: proxyUrls[0], method: "POST", headers },
          account(),
        ),
      ).toThrow();
    }
  });
});
