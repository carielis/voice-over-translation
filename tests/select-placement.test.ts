import { describe, expect, test } from "bun:test";
import { getSelectPlacement } from "../src/ui/selectPlacement";

const viewport = { left: 0, top: 0, width: 1000, height: 800 };

describe("select dropdown placement", () => {
  test("opens below the trigger with matching width", () => {
    expect(
      getSelectPlacement(
        { left: 100, top: 100, bottom: 140, width: 300 },
        viewport,
        200,
      ),
    ).toEqual({
      left: 100,
      top: 146,
      width: 300,
      maxHeight: 320,
      placement: "below",
    });
  });

  test("flips above when there is insufficient room below", () => {
    expect(
      getSelectPlacement(
        { left: 100, top: 700, bottom: 740, width: 150 },
        viewport,
        200,
      ),
    ).toMatchObject({ top: 494, width: 220, placement: "above" });
  });

  test("stays below when content already fits", () => {
    expect(
      getSelectPlacement(
        { left: 100, top: 550, bottom: 590, width: 200 },
        viewport,
        100,
      ).placement,
    ).toBe("below");
  });

  test("keeps the right edge inside a narrow viewport", () => {
    expect(
      getSelectPlacement(
        { left: 200, top: 40, bottom: 80, width: 380 },
        { left: 0, top: 0, width: 320, height: 480 },
        500,
      ),
    ).toMatchObject({ left: 8, top: 86, width: 304, maxHeight: 320 });
  });

  test("clamps an overflowing left edge", () => {
    expect(
      getSelectPlacement(
        { left: -30, top: 40, bottom: 80, width: 150 },
        viewport,
        100,
      ).left,
    ).toBe(8);
  });

  test("caps height to the available space in a short viewport", () => {
    expect(
      getSelectPlacement(
        { left: 20, top: 90, bottom: 130, width: 220 },
        { left: 0, top: 0, width: 320, height: 200 },
        320,
      ),
    ).toMatchObject({ top: 8, maxHeight: 76, placement: "above" });
  });

  test("respects the visual viewport offset when zoomed", () => {
    expect(
      getSelectPlacement(
        { left: 10, top: 190, bottom: 230, width: 120 },
        { left: 40, top: 100, width: 300, height: 400 },
        200,
      ),
    ).toMatchObject({ left: 48, top: 236, maxHeight: 256, placement: "below" });
  });

  test("does not produce negative dimensions for a collapsed viewport", () => {
    const result = getSelectPlacement(
      { left: 0, top: 0, bottom: 30, width: 220 },
      { left: 0, top: 0, width: 10, height: 10 },
      100,
    );
    expect(result.width).toBe(0);
    expect(result.maxHeight).toBe(0);
    expect(result.left).toBe(5);
    expect(result.top).toBe(5);
  });
});
