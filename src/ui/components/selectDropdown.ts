import UI from "../../ui";
import { getSelectPlacement } from "../selectPlacement";
import {
  createDomId,
  isEventInside,
  UIComponentWithEvents,
} from "./componentShared";

export default class SelectDropdown extends UIComponentWithEvents<{
  close: [];
}> {
  private static activeDropdown?: SelectDropdown;

  bodyContainer: HTMLElement;
  footerContainer: HTMLElement;

  private readonly anchor: HTMLElement;
  private readonly label: string;
  private isOpen = false;
  private usesPopover = false;
  private resizeObserver?: ResizeObserver;
  private ancestorObserver?: MutationObserver;
  private eventRoot?: Node;
  private positionFrame: number | null = null;
  private readonly ancestors: Node[] = [];

  constructor({ anchor, label }: { anchor: HTMLElement; label: string }) {
    super(["close"]);
    this.anchor = anchor;
    this.label = label;
    const { container, bodyContainer, footerContainer } = this.createElements();
    this.container = container;
    this.bodyContainer = bodyContainer;
    this.footerContainer = footerContainer;
  }

  protected createElements() {
    const container = UI.createEl("vot-block", ["vot-select-dropdown"]);
    container.id = createDomId("vot-select-dropdown");
    container.hidden = true;
    container.setAttribute("aria-label", this.label);
    const bodyContainer = UI.createEl("vot-block", [
      "vot-select-dropdown-body",
    ]);
    const footerContainer = UI.createEl("vot-block", [
      "vot-select-dropdown-footer",
    ]);
    container.append(bodyContainer, footerContainer);
    return { container, bodyContainer, footerContainer };
  }

  open(): this {
    if (this.isOpen) return this;
    SelectDropdown.activeDropdown?.close(false);
    SelectDropdown.activeDropdown = this;
    this.isOpen = true;
    this.collectAncestors();
    if (!this.isAnchorAvailable() || !this.container.isConnected) {
      return this.close(false);
    }

    this.container.hidden = false;
    this.usesPopover =
      typeof this.container.showPopover === "function" &&
      typeof this.container.hidePopover === "function";
    if (this.usesPopover) {
      this.container.setAttribute("popover", "manual");
      try {
        this.container.showPopover();
      } catch {
        // Older implementations may expose an incomplete Popover API.
        this.usesPopover = false;
      }
    }
    if (!this.usesPopover) {
      this.container.removeAttribute("popover");
      this.container.dataset.inline = "true";
    }

    this.attachObservers();
    this.updatePosition();
    return this;
  }

  close(restoreFocus = true): this {
    if (!this.isOpen) return this;
    this.isOpen = false;
    if (SelectDropdown.activeDropdown === this) {
      SelectDropdown.activeDropdown = undefined;
    }
    this.detachObservers();
    if (this.usesPopover && this.container.matches(":popover-open")) {
      this.container.hidePopover();
    }
    this.container.hidden = true;
    this.container.remove();
    if (restoreFocus && this.isAnchorAvailable()) {
      this.anchor.focus({ preventScroll: true });
    }
    this.ancestors.length = 0;
    this.dispatch("close");
    return this;
  }

  updatePosition(): void {
    if (!this.isOpen) return;
    if (!this.container.isConnected || !this.isAnchorAvailable()) {
      this.close(false);
      return;
    }
    if (!this.usesPopover) return;

    const viewport = globalThis.visualViewport;
    const borderHeight =
      this.container.offsetHeight - this.container.clientHeight;
    // The options list scrolls inside the body. Include its clipped content so
    // an already-constrained panel does not shrink its own placement estimate.
    const contentOverflow = Array.from(this.bodyContainer.children).reduce(
      (height, child) =>
        height + Math.max(0, child.scrollHeight - child.clientHeight),
      0,
    );
    const desiredHeight =
      this.container.scrollHeight +
      Math.max(
        0,
        this.bodyContainer.scrollHeight - this.bodyContainer.clientHeight,
      ) +
      contentOverflow +
      borderHeight;
    const placement = getSelectPlacement(
      this.anchor.getBoundingClientRect(),
      {
        left: viewport?.offsetLeft ?? 0,
        top: viewport?.offsetTop ?? 0,
        width: viewport?.width ?? globalThis.innerWidth,
        height: viewport?.height ?? globalThis.innerHeight,
      },
      desiredHeight,
    );
    this.container.style.left = `${placement.left}px`;
    this.container.style.top = `${placement.top}px`;
    this.container.style.width = `${placement.width}px`;
    this.container.style.maxHeight = `${placement.maxHeight}px`;
    this.container.dataset.placement = placement.placement;
  }

  private collectAncestors(): void {
    this.ancestors.length = 0;
    let node: Node | null = this.anchor;
    while (node) {
      this.ancestors.push(node);
      node = node instanceof ShadowRoot ? node.host : node.parentNode;
    }
  }

  private isAnchorAvailable(): boolean {
    if (!this.anchor.isConnected || this.anchor.getClientRects().length === 0) {
      return false;
    }
    for (const [index, node] of this.ancestors.entries()) {
      const parent = node instanceof ShadowRoot ? node.host : node.parentNode;
      if (parent !== (this.ancestors[index + 1] ?? null)) return false;
      if (!(node instanceof HTMLElement)) continue;
      if (
        node.hidden ||
        node.inert ||
        node.getAttribute("aria-hidden") === "true"
      ) {
        return false;
      }
      const style = getComputedStyle(node);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.visibility === "collapse"
      ) {
        return false;
      }
    }
    return true;
  }

  private readonly schedulePosition = (): void => {
    if (!this.isOpen || this.positionFrame !== null) return;
    this.positionFrame = requestAnimationFrame(() => {
      this.positionFrame = null;
      this.updatePosition();
    });
  };

  private readonly handleOutsideEvent = (event: Event): void => {
    if (
      isEventInside(event, this.anchor) ||
      isEventInside(event, this.container)
    ) {
      return;
    }
    this.close(false);
  };

  private readonly handleScroll = (event: Event): void => {
    if (!isEventInside(event, this.container)) this.schedulePosition();
  };

  private readonly handleMotionEnd = (event: Event): void => {
    if (isEventInside(event, this.container)) return;
    const target = event.composedPath()[0] ?? event.target;
    if (target instanceof Node && this.ancestors.includes(target)) {
      this.schedulePosition();
    }
  };

  private attachObservers(): void {
    const ownerDocument = this.anchor.ownerDocument;
    ownerDocument.addEventListener(
      "pointerdown",
      this.handleOutsideEvent,
      true,
    );
    ownerDocument.addEventListener("focusin", this.handleOutsideEvent, true);
    ownerDocument.addEventListener("scroll", this.handleScroll, {
      capture: true,
      passive: true,
    });
    ownerDocument.addEventListener("transitionend", this.handleMotionEnd, true);
    ownerDocument.addEventListener("animationend", this.handleMotionEnd, true);
    // Scroll does not cross a shadow boundary, even during capture.
    const root = this.anchor.getRootNode();
    if (root !== ownerDocument) {
      this.eventRoot = root;
      root.addEventListener("scroll", this.handleScroll, {
        capture: true,
        passive: true,
      });
      root.addEventListener("transitionend", this.handleMotionEnd, true);
      root.addEventListener("animationend", this.handleMotionEnd, true);
    }
    globalThis.addEventListener("resize", this.schedulePosition, {
      passive: true,
    });
    globalThis.visualViewport?.addEventListener(
      "resize",
      this.schedulePosition,
      {
        passive: true,
      },
    );
    globalThis.visualViewport?.addEventListener(
      "scroll",
      this.schedulePosition,
      {
        passive: true,
      },
    );

    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(this.schedulePosition);
      this.resizeObserver.observe(this.anchor);
      this.resizeObserver.observe(this.bodyContainer);
      this.resizeObserver.observe(this.footerContainer);
    }
    if (typeof MutationObserver !== "undefined") {
      this.ancestorObserver = new MutationObserver(() => {
        if (!this.container.isConnected || !this.isAnchorAvailable()) {
          this.close(false);
        } else {
          this.schedulePosition();
        }
      });
      for (const node of this.ancestors) {
        this.ancestorObserver.observe(
          node,
          node instanceof Element
            ? {
                attributeFilter: [
                  "hidden",
                  "inert",
                  "class",
                  "style",
                  "aria-hidden",
                  "open",
                ],
                childList: true,
              }
            : { childList: true },
        );
      }
    }
  }

  private detachObservers(): void {
    const ownerDocument = this.anchor.ownerDocument;
    ownerDocument.removeEventListener(
      "pointerdown",
      this.handleOutsideEvent,
      true,
    );
    ownerDocument.removeEventListener("focusin", this.handleOutsideEvent, true);
    ownerDocument.removeEventListener("scroll", this.handleScroll, true);
    ownerDocument.removeEventListener(
      "transitionend",
      this.handleMotionEnd,
      true,
    );
    ownerDocument.removeEventListener(
      "animationend",
      this.handleMotionEnd,
      true,
    );
    this.eventRoot?.removeEventListener("scroll", this.handleScroll, true);
    this.eventRoot?.removeEventListener(
      "transitionend",
      this.handleMotionEnd,
      true,
    );
    this.eventRoot?.removeEventListener(
      "animationend",
      this.handleMotionEnd,
      true,
    );
    this.eventRoot = undefined;
    globalThis.removeEventListener("resize", this.schedulePosition);
    globalThis.visualViewport?.removeEventListener(
      "resize",
      this.schedulePosition,
    );
    globalThis.visualViewport?.removeEventListener(
      "scroll",
      this.schedulePosition,
    );
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.ancestorObserver?.disconnect();
    this.ancestorObserver = undefined;
    if (this.positionFrame !== null) {
      cancelAnimationFrame(this.positionFrame);
      this.positionFrame = null;
    }
  }
}
