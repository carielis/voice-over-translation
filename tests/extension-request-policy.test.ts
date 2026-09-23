import { describe, expect, test } from "bun:test";
import { resolveRequestPolicy } from "../src/extension/background/request-policy";

const sender = "https://www.youtube.com/watch?v=test";

describe("privileged extension request policy", () => {
  test("preserves same-origin requests while blocking arbitrary cross-origin URLs", () => {
    expect(
      resolveRequestPolicy("https://www.youtube.com/youtubei/v1/player", "POST", sender),
    ).toEqual({ credentials: "include", redirect: "error" });
    for (const url of [
      "https://disk.yandex.ru/public/api/download-url",
      "https://api.browser.yandex.ru/account/profile",
      "https://example.org/private",
      "http://127.0.0.1:8080/",
      "file:///etc/passwd",
      "https://api.browser.yandex.ru@attacker.example/video-translation/translate",
    ]) {
      expect(() => resolveRequestPolicy(url, "GET", sender)).toThrow(
        "Unsupported extension request destination",
      );
    }
  });

  test("allows only the translation API methods and paths without browser cookies", () => {
    expect(
      resolveRequestPolicy(
        "https://api.browser.yandex.ru/video-translation/translate",
        "POST",
        sender,
      ),
    ).toEqual({ credentials: "omit", redirect: "error" });
    expect(
      resolveRequestPolicy(
        "https://vot-worker.eu.cc/video-translation/audio",
        "PUT",
        sender,
      ).credentials,
    ).toBe("omit");
    expect(
      resolveRequestPolicy(
        "https://translate-backend.transly.eu.cc/v2/translate",
        "POST",
        sender,
      ).credentials,
    ).toBe("omit");
    expect(
      resolveRequestPolicy(
        "https://custom-proxy.timeweb.cloud/video-translation/translate",
        "POST",
        sender,
        "custom-proxy.timeweb.cloud",
      ).credentials,
    ).toBe("omit");
    expect(() =>
      resolveRequestPolicy(
        "https://custom-proxy.timeweb.cloud/video-translation/translate",
        "POST",
        sender,
      ),
    ).toThrow();
    for (const [url, method] of [
      ["https://api.browser.yandex.ru/video-translation/translate", "GET"],
      ["https://api.browser.yandex.ru/session/create", "DELETE"],
      ["https://vot-worker.eu.cc/account", "POST"],
      ["https://evil.eu.cc.attacker.example/video-translation/translate", "POST"],
    ]) {
      expect(() => resolveRequestPolicy(url, method, sender)).toThrow();
    }
  });

  test("permits known public media and locale files, but not other repository files", () => {
    for (const url of [
      "https://vtrans.s3-private.mds.yandex.net/tts/prod/test.webm",
      "https://brosubs.s3-private.mds.yandex.net/vtrans/test.json",
      "https://vot-worker.eu.cc/video-subtitles/subtitles-proxy/test.json",
      "https://rr1---sn.googlevideo.com/videoplayback?id=test",
      "https://raw.githubusercontent.com/ilyhalight/voice-over-translation/master/src/localization/locales/ru.json",
      "https://api.vimeo.com/videos/123/texttracks?per_page=100",
    ]) {
      expect(resolveRequestPolicy(url, "GET", sender).credentials).toBe("omit");
    }
    expect(() =>
      resolveRequestPolicy(
        "https://raw.githubusercontent.com/ilyhalight/voice-over-translation/master/src/config/config.ts",
        "GET",
        sender,
      ),
    ).toThrow();
    expect(
      resolveRequestPolicy(
        "https://player.vimeo.com/texttrack/123.vtt",
        "GET",
        "https://vimeo.com/123",
      ).credentials,
    ).toBe("omit");
  });

  test("rejects untrusted sender contexts and URL credentials", () => {
    for (const invalidSender of [undefined, "not a URL", "chrome-extension://abc/"]) {
      expect(() =>
        resolveRequestPolicy(
          "https://api.browser.yandex.ru/video-translation/translate",
          "POST",
          invalidSender,
        ),
      ).toThrow();
    }
    expect(() =>
      resolveRequestPolicy("https://user:pass@www.youtube.com/", "GET", sender),
    ).toThrow();
  });
});
