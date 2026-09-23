import { beforeEach, describe, expect, mock, test } from "bun:test";

Object.defineProperty(globalThis, "DEBUG_MODE", {
  configurable: true,
  value: false,
});
Object.defineProperty(globalThis, "VOT_VERSION", {
  configurable: true,
  value: "1.0.0",
});

const stored = new Map<string, unknown>();
let online = true;
const requests: string[] = [];

mock.module("../src/utils/storage.ts", () => ({
  votStorage: {
    get: async (key: string, fallback: unknown) => stored.get(key) ?? fallback,
    set: async (key: string, value: unknown) => {
      stored.set(key, value);
    },
    delete: async (key: string) => {
      stored.delete(key);
    },
  },
}));

mock.module("../src/utils/gm.ts", () => ({
  GM_fetch: async (url: string) => {
    requests.push(url);
    if (!online) throw new Error("offline");
    if (url.includes("hashes.json")) {
      return {
        ok: true,
        json: async () => ({ ru: "ru-hash", de: "de-hash" }),
      };
    }
    return {
      ok: true,
      text: async () => JSON.stringify({ VOTSettings: "Einstellungen DE" }),
    };
  },
}));

const { localizationProvider } = await import(
  "../src/localization/localizationProvider"
);

describe("localization cache language", () => {
  beforeEach(() => {
    stored.clear();
    stored.set("localeLangOverride", "ru");
    stored.set("localeLang", "ru");
    stored.set(
      "localePhrases",
      JSON.stringify({ VOTSettings: "Настройки RU" }),
    );
    stored.set("localeHash", "ru-hash");
    stored.set("localeVersion", "1.0.0");
    online = true;
    requests.length = 0;
  });

  test("switching languages offline never displays phrases from the old language", async () => {
    await localizationProvider.init();
    expect(localizationProvider.get("VOTSettings")).toBe("Настройки RU");

    online = false;
    await localizationProvider.changeLang("de");
    expect(localizationProvider.lang).toBe("de");
    expect(localizationProvider.get("VOTSettings")).toBe(
      localizationProvider.getDefault("VOTSettings"),
    );

    // A new session must not load the Russian cache under the German choice.
    await localizationProvider.init();
    expect(localizationProvider.get("VOTSettings")).toBe(
      localizationProvider.getDefault("VOTSettings"),
    );

    online = true;
    requests.length = 0;
    await localizationProvider.update();
    expect(requests.some((url) => url.includes("hashes.json"))).toBe(true);
    expect(requests.some((url) => url.includes("/de.json"))).toBe(true);
    expect(localizationProvider.get("VOTSettings")).toBe("Einstellungen DE");
    expect(stored.get("localeLang")).toBe("de");
  });

  test("matching language and build version retain the cached locale", async () => {
    await localizationProvider.init();
    await localizationProvider.update();
    expect(requests).toEqual([]);
    expect(localizationProvider.get("VOTSettings")).toBe("Настройки RU");
  });
});
