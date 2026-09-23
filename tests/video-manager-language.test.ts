import { describe, expect, test } from "bun:test";

(globalThis as typeof globalThis & { DEBUG_MODE: boolean }).DEBUG_MODE = false;

const { VOTVideoManager } = await import("../src/core/videoManager");

describe("automatic source language after manual selection", () => {
  test("restores the previously detected language instead of the manual choice", async () => {
    const videoId = "manual-auto-with-detection";
    const handler = { site: { host: "vimeo" }, translateFromLang: "auto" };
    const manager = new VOTVideoManager(handler as any);
    manager.rememberDetectedLanguage(videoId, "fr");
    manager.rememberUserLanguageSelection(videoId, "de");
    manager.rememberUserLanguageSelection(videoId, "auto");
    const videoData = {
      videoId,
      detectedLanguage: "auto",
      isStream: false,
      title: "A French interview",
      description: "",
    };

    await manager.ensureDetectedLanguageForTranslation(videoData as any);

    expect(videoData.detectedLanguage).toBe("fr");
  });

  test("does not treat a manual language as an automatic detection", async () => {
    const videoId = "manual-auto-without-detection";
    const handler = { site: { host: "vimeo" }, translateFromLang: "auto" };
    const manager = new VOTVideoManager(handler as any);
    manager.rememberUserLanguageSelection(videoId, "de");
    manager.rememberUserLanguageSelection(videoId, "auto");
    const videoData = {
      videoId,
      detectedLanguage: "auto",
      isStream: false,
      title: "Short title",
      description: "",
    };

    await manager.ensureDetectedLanguageForTranslation(videoData as any);

    expect(videoData.detectedLanguage).toBe("auto");
  });
});
