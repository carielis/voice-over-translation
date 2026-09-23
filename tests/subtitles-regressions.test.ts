import { afterEach, describe, expect, mock, test } from "bun:test";

Object.defineProperty(globalThis, "DEBUG_MODE", {
  configurable: true,
  value: false,
});

let fetchMode: "ok" | "offline" | "http-error" = "ok";
mock.module("../src/utils/gm.ts", () => ({
  GM_fetch: async () => {
    if (fetchMode === "offline") throw new Error("offline");
    if (fetchMode === "http-error") return { ok: false, status: 503 };
    return {
      ok: true,
      json: async () => ({ format: "json", subtitles: [] }),
    };
  },
}));

const { SubtitlesProcessor } = await import("../src/subtitles/processor");
const { changeSubtitlesLang, loadSubtitles } = await import(
  "../src/videoHandler/modules/subtitles"
);
const originalGetSubtitles = SubtitlesProcessor.getSubtitles;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function descriptor(videoId: string) {
  return {
    source: "yandex",
    format: "json" as const,
    language: "ru",
    url: `https://example.invalid/${videoId}.json`,
  };
}

function createListHandler() {
  const cache = new Map<string, ReturnType<typeof descriptor>[]>();
  const updates: string[] = [];
  const handler = {
    site: { host: "vk" },
    videoData: {
      videoId: "A",
      detectedLanguage: "en",
      responseLanguage: "ru",
    },
    getPreferredSubtitlesLanguage: () => "ru",
    translateToLang: "ru",
    getSubtitlesCacheKey: (id: string, from: string, to: string) =>
      `${id}:${from}:${to}`,
    cacheManager: {
      getSubtitles: (key: string) => cache.get(key),
      setSubtitles: (key: string, value: ReturnType<typeof descriptor>[]) => {
        cache.set(key, value);
      },
    },
    subtitlesLoadPromises: new Map(),
    votClient: {},
    subtitles: [] as ReturnType<typeof descriptor>[],
    subtitlesCacheKey: null as string | null,
    async updateSubtitlesLangSelect() {
      updates.push(this.subtitlesCacheKey ?? "none");
    },
  };
  return { handler, cache, updates };
}

afterEach(() => {
  SubtitlesProcessor.getSubtitles = originalGetSubtitles;
  fetchMode = "ok";
});

describe("subtitle list request ordering", () => {
  test("a late list is cached but cannot replace the current video's list", async () => {
    const a = deferred<ReturnType<typeof descriptor>[]>();
    const b = deferred<ReturnType<typeof descriptor>[]>();
    SubtitlesProcessor.getSubtitles = async (_client, videoData) =>
      videoData.videoId === "A" ? a.promise : b.promise;

    const { handler, cache, updates } = createListHandler();
    const first = loadSubtitles.call(handler as never);
    handler.videoData = { ...handler.videoData, videoId: "B" };
    const second = loadSubtitles.call(handler as never);

    b.resolve([descriptor("B")]);
    await second;
    a.resolve([descriptor("A")]);
    await first;

    expect(handler.subtitles).toEqual([descriptor("B")]);
    expect(handler.subtitlesCacheKey).toBe("B:en:ru");
    expect(updates).toEqual(["B:en:ru"]);
    expect(cache.get("A:en:ru")).toEqual([descriptor("A")]);
  });

  test("a late failure cannot clear the current video's list", async () => {
    const a = deferred<ReturnType<typeof descriptor>[]>();
    const b = deferred<ReturnType<typeof descriptor>[]>();
    SubtitlesProcessor.getSubtitles = async (_client, videoData) =>
      videoData.videoId === "A" ? a.promise : b.promise;

    const { handler, updates } = createListHandler();
    const first = loadSubtitles.call(handler as never);
    handler.videoData = { ...handler.videoData, videoId: "B" };
    const second = loadSubtitles.call(handler as never);
    b.resolve([descriptor("B")]);
    await second;
    a.reject(new Error("A failed"));
    await first;

    expect(handler.subtitles).toEqual([descriptor("B")]);
    expect(handler.subtitlesCacheKey).toBe("B:en:ru");
    expect(updates).toEqual(["B:en:ru"]);
  });
});

describe("selected subtitle fetch failures", () => {
  test("network and HTTP failures reject instead of masquerading as an empty track", async () => {
    fetchMode = "offline";
    await expect(
      SubtitlesProcessor.fetchSubtitles(descriptor("A")),
    ).rejects.toThrow("offline");
    fetchMode = "http-error";
    await expect(
      SubtitlesProcessor.fetchSubtitles(descriptor("A")),
    ).rejects.toThrow("HTTP 503");
  });

  test("a failed selection is disabled and can be retried", async () => {
    let selected = "disabled";
    let active = false;
    let rendered = 0;
    const downloadButton = { hidden: true };
    const handler = {
      videoData: { videoId: "A" },
      uiManager: {
        votOverlayView: {
          subtitlesSelect: {
            setSelectedValue(value: string) {
              selected = value;
            },
          },
          downloadSubtitlesButton: downloadButton,
          syncSubtitlesButtonState(value: boolean) {
            active = value;
          },
        },
      },
      subtitles: [descriptor("A")],
      data: {},
      yandexSubtitles: null,
      hasSubtitlesWidget: () => false,
      getSubtitlesWidget: () => ({
        setContent: () => {
          rendered += 1;
        },
      }),
    };

    fetchMode = "offline";
    await changeSubtitlesLang.call(handler as never, "0");
    expect({
      selected,
      active,
      downloadHidden: downloadButton.hidden,
      rendered,
    }).toEqual({
      selected: "disabled",
      active: false,
      downloadHidden: true,
      rendered: 0,
    });

    fetchMode = "ok";
    await changeSubtitlesLang.call(handler as never, "0");
    expect(selected).toBe("0");
    expect(active).toBe(true);
    expect(downloadButton.hidden).toBe(false);
    expect(rendered).toBe(1);
  });
});
