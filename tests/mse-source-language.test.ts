import { expect, test } from "bun:test";

(globalThis as unknown as { DEBUG_MODE: boolean }).DEBUG_MODE = false;

const { createAudioChunkStream } = await import(
  "../src/audioDownloader/strategies/mseProxyHandler"
);

test("MSE fallback refuses an explicit audio language before loading the player", async () => {
  let playerAccessed = false;
  const targetWindow = {
    get document() {
      playerAccessed = true;
      throw new Error("player must not be loaded");
    },
  } as unknown as Parameters<typeof createAudioChunkStream>[0];

  const stream = createAudioChunkStream(
    targetWindow,
    "video-id",
    new AbortController().signal,
    undefined,
    "EN_us",
  );

  await expect(stream.getReader().read()).rejects.toThrow(
    "MSE fallback cannot verify source language en-us",
  );
  expect(playerAccessed).toBe(false);
});
