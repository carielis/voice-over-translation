import { expect, test } from "bun:test";

import { createVideoLifecycleHost } from "../src/core/videoLifecycleHost";

test("changing video ID clears the language pair tied to the previous audio", () => {
  const handler: any = {
    videoData: { videoId: "previous" },
    downloadTranslation: { videoId: "previous", url: "https://audio.test" },
    activeTranslationLanguages: {
      videoId: "previous",
      from: "de",
      to: "ru",
    },
  };
  const host = createVideoLifecycleHost(handler, () => ({}) as any);

  host.videoData = { videoId: "previous" } as any;
  expect(handler.activeTranslationLanguages?.from).toBe("de");

  host.videoData = { videoId: "next" } as any;
  expect(handler.downloadTranslation).toBeNull();
  expect(handler.activeTranslationLanguages).toBeNull();
});
