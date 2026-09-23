const LOGOUT_GESTURE_LIFETIME_MS = 1500;

type ClickLike = {
  isTrusted: boolean;
  composedPath: () => EventTarget[];
};

function isAccountLogoutButton(node: EventTarget): boolean {
  const candidate = node as {
    nodeType?: number;
    dataset?: { votAccountLogout?: string };
    closest?: (selector: string) => Element | null;
  };
  return (
    candidate.nodeType === 1 &&
    candidate.dataset?.votAccountLogout === "true" &&
    typeof candidate.closest === "function" &&
    candidate.closest(".vot-account") !== null
  );
}

export function createLogoutGestureGate(now: () => number = Date.now) {
  let gestureAt = -1;
  return {
    observeClick(event: ClickLike): void {
      if (event.isTrusted && event.composedPath().some(isAccountLogoutButton)) {
        gestureAt = now();
      }
    },
    consumeAccountDelete(): boolean {
      const allowed =
        gestureAt >= 0 && now() - gestureAt <= LOGOUT_GESTURE_LIFETIME_MS;
      gestureAt = -1;
      return allowed;
    },
  };
}
