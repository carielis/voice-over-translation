export type SelectAnchorRect = {
  left: number;
  top: number;
  bottom: number;
  width: number;
};

export type SelectViewport = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Position against the visual viewport, including its offset when zoomed. */
export function getSelectPlacement(
  anchor: SelectAnchorRect,
  viewport: SelectViewport,
  desiredHeight: number,
  minWidth = 220,
) {
  const margin = 8;
  const gap = 6;
  const viewportWidth = Math.max(0, viewport.width - margin * 2);
  const viewportHeight = Math.max(0, viewport.height - margin * 2);
  const leftEdge = viewport.left + Math.min(margin, viewport.width / 2);
  const topEdge = viewport.top + Math.min(margin, viewport.height / 2);
  const bottomEdge = topEdge + viewportHeight;
  const width = Math.min(Math.max(minWidth, anchor.width), viewportWidth);
  const left = Math.min(
    Math.max(anchor.left, leftEdge),
    leftEdge + viewportWidth - width,
  );
  const below = Math.min(
    viewportHeight,
    Math.max(0, bottomEdge - anchor.bottom - gap),
  );
  const above = Math.min(
    viewportHeight,
    Math.max(0, anchor.top - gap - topEdge),
  );
  const height = Math.min(320, Math.max(0, desiredHeight));
  const placement = height > below && above > below ? "above" : "below";
  const maxHeight = Math.min(320, placement === "above" ? above : below);
  const visibleHeight = Math.min(height, maxHeight);
  const targetTop =
    placement === "above"
      ? anchor.top - gap - visibleHeight
      : anchor.bottom + gap;
  const top = Math.min(
    Math.max(targetTop, topEdge),
    bottomEdge - visibleHeight,
  );

  return { left, top, width, maxHeight, placement };
}
