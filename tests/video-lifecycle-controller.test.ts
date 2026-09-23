import { afterEach, describe, expect, mock, test } from "bun:test";
import { VideoService } from "@vot.js/ext/types/service";

import type { VideoLifecycleHost } from "../src/core/videoLifecycleController";
import type { VideoData } from "../src/types/videoHandler";

async function loadGetYouTubeSourceKey() {
  (globalThis as unknown as { DEBUG_MODE: boolean }).DEBUG_MODE = false;
  const { getYouTubeSourceKey } = await import(
    "../src/core/videoLifecycleController"
  );
  return getYouTubeSourceKey;
}

describe("getYouTubeSourceKey", () => {
  test("ignores timestamp parameters", async () => {
    const getYouTubeSourceKey = await loadGetYouTubeSourceKey();
    const beforeSeek = getYouTubeSourceKey(
      new URL("https://www.youtube.com/watch?v=video-id&t=60"),
      "0",
    );
    const afterSeek = getYouTubeSourceKey(
      new URL(
        "https://www.youtube.com/watch?v=video-id&t=120&start=120&time_continue=120",
      ),
      "0",
    );

    expect(afterSeek).toBe(beforeSeek);
  });

  test("changes when the video changes", async () => {
    const getYouTubeSourceKey = await loadGetYouTubeSourceKey();
    const firstVideo = getYouTubeSourceKey(
      new URL("https://www.youtube.com/watch?v=first-video"),
      "0",
    );
    const secondVideo = getYouTubeSourceKey(
      new URL("https://www.youtube.com/watch?v=second-video"),
      "0",
    );

    expect(secondVideo).not.toBe(firstVideo);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createVideoData(videoId = "video-id"): VideoData {
  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    host: VideoService.youtube,
    detectedLanguage: "en",
    responseLanguage: "ru",
    downloadTitle: "Video",
    duration: 30,
    isStream: false,
    translationHelp: null,
  };
}

function createHost(getVideoData: VideoLifecycleHost["getVideoData"]) {
  const container = {} as HTMLElement;
  const host = {
    video: {
      src: "https://example.com/video.mp4",
      currentSrc: "https://example.com/video.mp4",
      srcObject: null,
      parentElement: container,
    } as HTMLVideoElement,
    site: { host: VideoService.youtube, url: "https://youtu.be/" },
    container,
    firstPlay: false,
    stopTranslation: mock(() => {}),
    resetSubtitlesWidget: mock(() => {}),
    uiManager: {
      votOverlayView: {
        votButton: { container: { hidden: true } as HTMLElement, opacity: 0 },
        votMenu: { container: {} as HTMLElement, hidden: true },
      },
    },
    getVideoData: mock(getVideoData),
    cacheManager: { getSubtitles: () => undefined },
    updateSubtitlesLangSelect: mock(async () => {}),
    setSelectMenuValues: mock(() => {}),
    translateToLang: "ru",
    data: { autoSubtitles: true },
    subtitles: [],
    subtitlesCacheKey: null,
    videoData: undefined as VideoData | undefined,
    actionsAbortController: new AbortController(),
    getSubtitlesCacheKey: () => "subtitles-key",
    getPreferredSubtitlesLanguage: () => "ru",
    translationOrchestrator: {
      reset: mock(() => {}),
      runAutoTranslationIfEligible: mock(async () => {}),
    },
    enableSubtitlesForCurrentLangPair: mock(async () => {}),
  } satisfies VideoLifecycleHost;
  return host;
}

describe("VideoLifecycleController metadata lookup", () => {
  const originalLocation = Object.getOwnPropertyDescriptor(
    globalThis,
    "location",
  );

  afterEach(() => {
    if (originalLocation) {
      Object.defineProperty(globalThis, "location", originalLocation);
    } else {
      Reflect.deleteProperty(globalThis, "location");
    }
  });

  async function createController(host: VideoLifecycleHost) {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      writable: true,
      value: { href: "https://www.youtube.com/watch?v=video-id" },
    });
    (globalThis as unknown as { DEBUG_MODE: boolean }).DEBUG_MODE = false;
    const { VideoLifecycleController } = await import(
      "../src/core/videoLifecycleController"
    );
    return new VideoLifecycleController(host);
  }

  test("ignores the first metadata result after teardown", async () => {
    const lookup = deferred<VideoData>();
    const host = createHost(() => lookup.promise);
    const controller = await createController(host);

    const pending = controller.setCanPlay();
    controller.teardown();
    lookup.resolve(createVideoData());
    await pending;

    expect(host.videoData).toBeUndefined();
    expect(host.uiManager.votOverlayView.votButton.container.hidden).toBe(true);
    expect(host.stopTranslation).not.toHaveBeenCalled();
    expect(host.updateSubtitlesLangSelect).not.toHaveBeenCalled();
    expect(host.enableSubtitlesForCurrentLangPair).not.toHaveBeenCalled();
    expect(
      host.translationOrchestrator.runAutoTranslationIfEligible,
    ).not.toHaveBeenCalled();
  });

  test("ignores metadata errors after teardown without clearing current state", async () => {
    const lookup = deferred<VideoData>();
    const host = createHost(() => lookup.promise);
    const controller = await createController(host);

    const pending = controller.setCanPlay();
    controller.teardown();
    const currentVideoData = createVideoData("current-video");
    host.videoData = currentVideoData;
    host.uiManager.votOverlayView.votButton.container.hidden = false;
    host.uiManager.votOverlayView.votMenu.hidden = false;
    lookup.reject(new Error("stale metadata failure"));
    await pending;

    expect(host.videoData).toBe(currentVideoData);
    expect(host.uiManager.votOverlayView.votButton.container.hidden).toBe(
      false,
    );
    expect(host.uiManager.votOverlayView.votMenu.hidden).toBe(false);
  });

  test("ignores metadata errors after the source changes", async () => {
    const lookup = deferred<VideoData>();
    const host = createHost(() => lookup.promise);
    const controller = await createController(host);

    const pending = controller.setCanPlay();
    globalThis.location.href = "https://www.youtube.com/watch?v=current-video";
    const currentVideoData = createVideoData("current-video");
    host.videoData = currentVideoData;
    host.uiManager.votOverlayView.votButton.container.hidden = false;
    lookup.reject(new Error("previous source failed"));
    await pending;

    expect(host.videoData).toBe(currentVideoData);
    expect(host.uiManager.votOverlayView.votButton.container.hidden).toBe(
      false,
    );
  });

  test("allows a fresh request for the same source after teardown", async () => {
    const lookup = deferred<VideoData>();
    const currentVideoData = createVideoData();
    let lookups = 0;
    const host = createHost(() => {
      lookups += 1;
      return lookups === 1 ? lookup.promise : Promise.resolve(currentVideoData);
    });
    const controller = await createController(host);

    const pending = controller.setCanPlay();
    controller.teardown();
    const rebound = controller.setCanPlay();
    lookup.resolve(createVideoData("stale-video"));
    await Promise.all([pending, rebound]);

    expect(host.getVideoData).toHaveBeenCalledTimes(2);
    expect(host.videoData).toBe(currentVideoData);
    expect(host.updateSubtitlesLangSelect).toHaveBeenCalledTimes(1);
    expect(host.enableSubtitlesForCurrentLangPair).toHaveBeenCalledTimes(1);
    expect(
      host.translationOrchestrator.runAutoTranslationIfEligible,
    ).toHaveBeenCalledTimes(1);
  });

  test("still clears metadata and hides the overlay on a current lookup failure", async () => {
    const host = createHost(async () => {
      throw new Error("metadata unavailable");
    });
    const controller = await createController(host);
    host.videoData = createVideoData();
    host.uiManager.votOverlayView.votButton.container.hidden = false;
    host.uiManager.votOverlayView.votMenu.hidden = false;

    await controller.setCanPlay();

    expect(host.videoData).toBeUndefined();
    expect(host.uiManager.votOverlayView.votButton.container.hidden).toBe(true);
    expect(host.uiManager.votOverlayView.votMenu.hidden).toBe(true);
    expect(host.stopTranslation).toHaveBeenCalledTimes(1);
    expect(host.resetSubtitlesWidget).toHaveBeenCalledTimes(1);
  });

  test("stops old audio when current metadata lookup resolves without video data", async () => {
    const host = createHost(async () => undefined);
    const controller = await createController(host);
    host.videoData = createVideoData("previous-video");
    host.uiManager.votOverlayView.votButton.container.hidden = false;

    await controller.setCanPlay();

    expect(host.videoData).toBeUndefined();
    expect(host.stopTranslation).toHaveBeenCalledTimes(1);
    expect(host.uiManager.votOverlayView.votButton.container.hidden).toBe(true);
  });
});
