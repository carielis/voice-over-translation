import { describe, expect, test } from "bun:test";
import { parseBinaryResponse } from "../src/extension/background/xhr-handler";

const makeBase = (readyState: number) => ({
  finalUrl: "https://example.test/audio",
  readyState,
  status: 200,
  statusText: "OK",
  responseHeaders: "",
});

describe("native binary response transfer", () => {
  test.each([null, "invalid", "-1", ""])(
    "streams an unknown content length (%s)",
    async (length) => {
      const response = new Response(new Uint8Array(1024));
      if (length !== null) response.headers.set("content-length", length);
      const progress: any[] = [];
      const result = await parseBinaryResponse(response, makeBase, (message) =>
        progress.push(message),
      );
      expect(result.response).toBeUndefined();
      expect(result.responseB64).toBeUndefined();
      expect(progress).toHaveLength(1);
      expect(progress[0].progress).toMatchObject({
        loaded: 1024,
        total: 0,
        lengthComputable: false,
      });
      expect(response.body?.locked).toBe(false);
    },
  );

  test("keeps known small responses inline", async () => {
    const response = new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-length": "3" },
    });
    const progress: unknown[] = [];
    const result = await parseBinaryResponse(response, makeBase, (message) =>
      progress.push(message),
    );
    expect(progress).toHaveLength(0);
    expect(result.responseB64).toBe("AQID");
  });

  test("streams known large responses and reports their length", async () => {
    const size = 600 * 1024;
    const response = new Response(new Uint8Array(size), {
      headers: { "content-length": String(size) },
    });
    const progress: any[] = [];
    await parseBinaryResponse(response, makeBase, (message) =>
      progress.push(message),
    );
    expect(progress.at(-1).progress).toMatchObject({
      loaded: size,
      total: size,
      lengthComputable: true,
    });
  });

  test("releases the reader when the stream fails", async () => {
    const response = new Response(
      new ReadableStream({
        pull(controller) {
          controller.error(new Error("stream failed"));
        },
      }),
    );
    await expect(
      parseBinaryResponse(response, makeBase, () => {}),
    ).rejects.toThrow("stream failed");
    expect(response.body?.locked).toBe(false);
  });
});
