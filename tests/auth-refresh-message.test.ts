import { expect, test } from "bun:test";
import {
  createAuthRefreshMessage,
  notifyAuthOpener,
} from "../src/core/authRefreshMessage";

test("notifies a cross-origin opener without disclosing account data", () => {
  const messages: unknown[][] = [];
  notifyAuthOpener({
    postMessage: (...args: unknown[]) => {
      messages.push(args);
    },
  });
  expect(messages).toEqual([[createAuthRefreshMessage(), "*"]]);
});

test("an absent opener does not prevent sign-in", () => {
  expect(() => notifyAuthOpener(null)).not.toThrow();
});
