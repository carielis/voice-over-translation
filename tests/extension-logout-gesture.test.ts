import { describe, expect, test } from "bun:test";
import { createLogoutGestureGate } from "../src/extension/bridge/logout-gesture";

const logoutButton = {
  nodeType: 1,
  dataset: { votAccountLogout: "true" },
  closest: (selector: string) =>
    selector === ".vot-account" ? ({} as Element) : null,
} as unknown as EventTarget;

function click(isTrusted: boolean, path: EventTarget[] = [logoutButton]) {
  return { isTrusted, composedPath: () => path };
}

describe("account logout gesture gate", () => {
  test("only a real click on the visible account action authorizes one deletion", () => {
    let time = 100;
    const gate = createLogoutGestureGate(() => time);
    expect(gate.consumeAccountDelete()).toBe(false);
    gate.observeClick(click(false));
    expect(gate.consumeAccountDelete()).toBe(false);
    gate.observeClick(click(true, []));
    expect(gate.consumeAccountDelete()).toBe(false);
    gate.observeClick(click(true));
    expect(gate.consumeAccountDelete()).toBe(true);
    expect(gate.consumeAccountDelete()).toBe(false);
    gate.observeClick(click(true));
    time += 1501;
    expect(gate.consumeAccountDelete()).toBe(false);
  });

  test("ignores an account button that is currently in login mode", () => {
    const gate = createLogoutGestureGate();
    gate.observeClick(
      click(true, [
        {
          ...logoutButton,
          dataset: { votAccountLogout: "false" },
        } as EventTarget,
      ]),
    );
    expect(gate.consumeAccountDelete()).toBe(false);
  });
});
