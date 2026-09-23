import { describe, expect, test } from "bun:test";
import {
  getExtensionDnrRequestScope,
  withDnrRequestLock,
} from "../src/extension/background/dnr-rules";

describe("DNR service worker scope", () => {
  test("modifies only tabless requests initiated by this extension", () => {
    expect(getExtensionDnrRequestScope("chrome-extension://abc123/")).toEqual({
      tabIds: [-1],
      initiatorDomains: ["abc123"],
    });
    expect(getExtensionDnrRequestScope("moz-extension://uuid123/")).toEqual({
      tabIds: [-1],
      initiatorDomains: ["uuid123"],
    });
    expect(() => getExtensionDnrRequestScope("https://site.example/")).toThrow();
  });

  test("serializes requests that share mutable header rules", async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    const first = withDnrRequestLock(
      "https://api.browser.yandex.ru/video-translation/translate",
      async () => {
        order.push("first-start");
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
        order.push("first-end");
      },
    );
    const second = withDnrRequestLock(
      "https://api.browser.yandex.ru/video-translation/translate",
      async () => {
        order.push("second-start");
      },
    );
    await Promise.resolve();
    expect(order).toEqual(["first-start"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(["first-start", "first-end", "second-start"]);
  });
});
