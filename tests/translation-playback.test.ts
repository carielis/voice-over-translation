import { describe, expect, mock, test } from "bun:test";

(globalThis as typeof globalThis & { DEBUG_MODE: boolean }).DEBUG_MODE = false;
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: { getItem: () => null, setItem() {}, removeItem() {} },
});

const { CacheManager } = await import("../src/core/cacheManager");
const {
  refreshTranslationAudio,
  translateFunc,
  updateTranslation,
} = await import("../src/videoHandler/modules/translationPlayback");

function createTranslationHandler() {
  const cacheManager = new CacheManager();
  const requestedLanguages: string[] = [];
  const handler: any = {
    videoData: {
      videoId: "video",
      detectedLanguage: "de",
      responseLanguage: "ru",
      translationHelp: null,
      isStream: false,
    },
    video: { paused: true },
    data: {},
    uiManager: { votOverlayView: { votButton: { loading: false } } },
    actionsAbortController: new AbortController(),
    actionsGeneration: 0,
    activeTranslation: null,
    activeTranslationLanguages: null,
    isRefreshingTranslation: false,
    translateFromLang: "auto",
    translateToLang: "ru",
    cacheManager,
    getTranslationCacheKey: (id: string, from: string, to: string) =>
      `${id}_${from}_${to}`,
    hasActiveSource: () => true,
    isActionStale: () => false,
    waitForPendingStopTranslate: async () => {},
    videoValidator: async () => true,
    getVideoVolume: () => 1,
    getPreferredSubtitlesLanguage: () => undefined,
    translationHandler: {
      translateVideoImpl: async (_video: unknown, from: string) => {
        requestedLanguages.push(from);
        return { url: `https://audio.test/${from}.mp3`, usedLivelyVoice: false };
      },
    },
    updateTranslation: mock(async () => true),
  };
  return { handler, cacheManager, requestedLanguages };
}

describe("translation playback cache and language", () => {
  test("does not recache an expired URL when replacement playback fails", async () => {
    const { handler, cacheManager } = createTranslationHandler();
    handler.translateFromLang = "en";
    handler.downloadTranslation = {
      url: "https://audio.test/expired.mp3",
      videoId: "video",
    };
    const player = {
      src: "https://audio.test/expired.mp3",
      currentSrc: "https://audio.test/expired.mp3",
      clear: async () => {},
    };
    handler.audioPlayer = {
      player,
      init: async () => {
        throw new Error("new audio unavailable");
      },
    };
    handler.proxifyAudio = (url: string) => url;
    handler.unproxifyAudio = (url: string) => url;
    handler.transformBtn = mock(() => {});
    handler.updateTranslation = (...args: any[]) =>
      updateTranslation.call(handler, ...args);

    await refreshTranslationAudio.call(handler);

    expect(cacheManager.getTranslation("video_en_ru")).toBeUndefined();
    expect(handler.transformBtn).toHaveBeenCalledWith(
      "error",
      "new audio unavailable",
    );
    expect(player.src).toBe("");
  });

  test("evicts a cached URL when applying it fails", async () => {
    const { handler, cacheManager } = createTranslationHandler();
    cacheManager.setTranslation("video_de_ru", {
      videoId: "video",
      from: "de",
      to: "ru",
      url: "https://audio.test/expired.mp3",
      useLivelyVoice: false,
    });
    handler.updateTranslation = mock(async () => false);

    await translateFunc.call(handler, "video", false, "de", "ru", null);

    expect(cacheManager.getTranslation("video_de_ru")).toBeUndefined();
    expect(handler.activeTranslationLanguages).toBeNull();
  });

  test("refreshes using the language of the active audio when the menu stays on Auto", async () => {
    const { handler, cacheManager, requestedLanguages } =
      createTranslationHandler();

    await translateFunc.call(handler, "video", false, "de", "ru", null);
    expect(handler.activeTranslationLanguages).toEqual({
      videoId: "video",
      from: "de",
      to: "ru",
    });

    handler.translateFromLang = "auto";
    await refreshTranslationAudio.call(handler);

    expect(requestedLanguages).toEqual(["de", "de"]);
    expect(cacheManager.getTranslation("video_de_ru")?.from).toBe("de");
    expect(cacheManager.getTranslation("video_auto_ru")).toBeUndefined();
  });
});
