import { render } from "lit-html";
import { localizationProvider } from "../../localization/localizationProvider";
import UI from "../../ui";
import { LIVE_VOICE_ICON, STANDARD_VOICE_ICON } from "../icons";
import {
  createDomId,
  isEventInside,
  setInteractiveHiddenState,
  UIComponentWithEvents,
} from "./componentShared";

export type VoiceType = "standard" | "live";

export interface VoicePopoverProps {
  activeVoice: VoiceType;
  /** Overlay root — popover positions in this element's coordinate space. */
  layoutRoot: HTMLElement;
  onTranslate?: () => void;
}

export default class VoicePopover extends UIComponentWithEvents<{
  voiceChange: [voice: VoiceType];
  openChange: [isOpen: boolean];
}> {
  private readonly id = createDomId("vot-voice-popover");
  private readonly layoutRoot: HTMLElement;
  private readonly searchInput: HTMLInputElement;
  private readonly options: HTMLElement;
  private readonly emptyStatus: HTMLElement;
  private _activeVoice: VoiceType;
  private readonly onTranslate?: () => void;
  private lastVisibilityState = false;

  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly SHOW_DELAY_MS = 80;
  private static readonly HIDE_DELAY_MS = 80;

  private positionRafId: number | null = null;
  private anchorEl: HTMLElement | null = null;
  private outsideTapHandler: ((e: PointerEvent) => void) | null = null;
  private layoutListening = false;

  private readonly onLayoutChangeBound = (): void => {
    if (this.isOpen && this.anchorEl) {
      this.schedulePositionUpdate(this.anchorEl);
    }
  };

  constructor({ activeVoice, layoutRoot, onTranslate }: VoicePopoverProps) {
    super(["openChange", "voiceChange"]);
    this._activeVoice = activeVoice;
    this.layoutRoot = layoutRoot;
    this.onTranslate = onTranslate;
    const elements = this.createElements();
    this.container = elements.container;
    this.searchInput = elements.searchInput;
    this.options = elements.options;
    this.emptyStatus = elements.emptyStatus;
  }

  get activeVoice(): VoiceType {
    return this._activeVoice;
  }

  set activeVoice(value: VoiceType) {
    this._activeVoice = value;
    this.updateActiveState();
  }

  override set hidden(isHidden: boolean) {
    setInteractiveHiddenState(this.container, isHidden);
  }

  override get hidden() {
    return super.hidden;
  }

  get isOpen(): boolean {
    return !this.hidden;
  }

  scheduleShow(anchor: HTMLElement): void {
    this.cancelHide();
    this.cancelShow();
    if (this.isOpen) {
      this.anchorEl = anchor;
      this.updatePosition(anchor);
      this.emitVisibilityChange(true);
      return;
    }
    this.showTimer = setTimeout(() => {
      this.showTimer = null;
      this.open(anchor);
    }, VoicePopover.SHOW_DELAY_MS);
  }

  scheduleHide(): void {
    this.cancelShow();
    this.cancelHide();
    if (this.hidden || this.container.matches(":focus-within")) return;
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      if (!this.container.matches(":focus-within")) this.close();
    }, VoicePopover.HIDE_DELAY_MS);
  }

  showNow(anchor: HTMLElement): void {
    this.cancelShow();
    this.cancelHide();
    this.open(anchor);
  }

  toggle(anchor: HTMLElement): void {
    if (this.isOpen) {
      this.hideNow();
    } else {
      this.showNow(anchor);
    }
  }

  toggleForTouch(anchor: HTMLElement): void {
    this.toggle(anchor);
  }

  cancelShow(): void {
    if (this.showTimer !== null) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
  }

  cancelHide(): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  hideNow(): void {
    this.cancelShow();
    this.cancelHide();
    this.close();
  }

  release(): void {
    this.cancelShow();
    this.cancelHide();
    this.close();
    this.container.remove();
    this.clearEventListeners();
  }

  protected createElements() {
    const container = UI.createEl("vot-block", ["vot-voice-popover"]);
    container.id = this.id;
    setInteractiveHiddenState(container, true);

    const options = UI.createEl("vot-block", ["vot-voice-popover__options"]);
    options.id = `${this.id}-options`;
    options.setAttribute("role", "menu");
    options.setAttribute("aria-label", "Voice type selection");

    const searchWrap = UI.createEl("vot-block", ["vot-select-search-wrap"]);
    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.className = "vot-select-search";
    searchInput.placeholder = localizationProvider.get("searchField");
    searchInput.setAttribute("aria-label", searchInput.placeholder);
    searchInput.setAttribute("aria-controls", options.id);
    searchInput.autocomplete = "off";
    searchInput.spellcheck = false;
    searchInput.addEventListener("input", () => this.filterOptions());
    searchWrap.append(searchInput);

    const emptyStatus = UI.createEl("vot-block", ["vot-select-status"]);
    emptyStatus.setAttribute("role", "status");
    emptyStatus.textContent = localizationProvider.get("notFound");
    emptyStatus.hidden = true;

    options.append(
      this.createItem(
        "standard",
        STANDARD_VOICE_ICON,
        localizationProvider.get("VOTStandardVoicesTitle"),
        localizationProvider.get("VOTStandardVoicesSubtitle"),
      ),
      this.createItem(
        "live",
        LIVE_VOICE_ICON,
        localizationProvider.get("VOTLiveVoicesTitle"),
        localizationProvider.get("VOTLiveVoicesSubtitle"),
      ),
    );
    container.append(searchWrap, options, emptyStatus);
    container.addEventListener("keydown", (event) => this.onKeyDown(event));

    container.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "touch") return;
      this.cancelHide();
    });
    container.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "touch") return;
      this.scheduleHide();
    });
    container.addEventListener("focusin", () => this.cancelHide());
    container.addEventListener("focusout", () => {
      queueMicrotask(() => {
        if (
          !container.matches(":focus-within, :hover") &&
          !this.anchorEl?.matches(":hover")
        )
          this.scheduleHide();
      });
    });

    return { container, searchInput, options, emptyStatus };
  }

  private createItem(
    voice: VoiceType,
    iconTemplate: unknown,
    title: string,
    subtitle: string,
  ): HTMLElement {
    const item = UI.createEl("vot-block", ["vot-voice-popover__item"]);
    item.setAttribute("role", "menuitemradio");
    item.setAttribute("tabindex", "0");
    item.dataset.voice = voice;
    item.dataset.searchText = `${title} ${subtitle}`.toLocaleLowerCase();
    item.title = subtitle;

    const iconWrap = UI.createEl("vot-block", [
      "vot-voice-popover__item-icon",
      `vot-voice-popover__item-icon--${voice}`,
    ]);
    render(iconTemplate, iconWrap);

    const textWrap = UI.createEl("vot-block", ["vot-voice-popover__item-text"]);
    const titleEl = UI.createEl("span", ["vot-voice-popover__item-title"]);
    titleEl.textContent = title;
    const subtitleEl = UI.createEl("span", [
      "vot-voice-popover__item-subtitle",
    ]);
    subtitleEl.textContent = subtitle;
    textWrap.append(titleEl, subtitleEl);

    item.append(iconWrap, textWrap);

    const select = () => this.handleSelect(voice);
    item.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.pointerType !== "touch") return;
      e.preventDefault();
      e.stopPropagation();
      select();
    });
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        select();
      }
    });

    return item;
  }

  private open(anchor: HTMLElement): void {
    if (this.isOpen) {
      this.anchorEl = anchor;
      this.updatePosition(anchor);
      this.emitVisibilityChange(true);
      return;
    }
    this.anchorEl = anchor;
    this.searchInput.value = "";
    this.filterOptions();
    this.hidden = false;
    this.updateActiveState();
    this.updatePosition(anchor);
    this.attachLayoutListeners();
    this.attachOutsideTapListener();
    this.emitVisibilityChange(true);
  }

  private close(): void {
    if (this.hidden) {
      this.emitVisibilityChange(false);
      return;
    }
    this.hidden = true;
    this.detachLayoutListeners();
    this.detachOutsideTapListener();
    this.anchorEl = null;
    if (this.positionRafId !== null) {
      cancelAnimationFrame(this.positionRafId);
      this.positionRafId = null;
    }
    this.emitVisibilityChange(false);
  }

  private emitVisibilityChange(isOpen: boolean): void {
    if (this.lastVisibilityState === isOpen) return;
    this.lastVisibilityState = isOpen;
    this.dispatch("openChange", isOpen);
  }

  private handleSelect(voice: VoiceType): void {
    const restoreFocus = this.container.matches(":focus-within");
    const anchor = this.anchorEl;
    this._activeVoice = voice;
    this.updateActiveState();
    this.cancelHide();
    this.dispatch("voiceChange", voice);
    this.onTranslate?.();
    this.hideNow();
    if (restoreFocus) anchor?.focus({ preventScroll: true });
  }

  private filterOptions(): void {
    const query = this.searchInput.value.trim().toLocaleLowerCase();
    for (const item of this.options.querySelectorAll<HTMLElement>(
      ".vot-voice-popover__item",
    )) {
      item.hidden = !item.dataset.searchText?.includes(query);
      item.tabIndex = item.hidden ? -1 : 0;
    }
    this.emptyStatus.hidden = this.visibleOptions().length > 0;
    if (this.isOpen && this.anchorEl) this.updatePosition(this.anchorEl);
  }

  private visibleOptions(): HTMLElement[] {
    return Array.from(
      this.options.querySelectorAll<HTMLElement>(
        ".vot-voice-popover__item:not([hidden])",
      ),
    );
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey)
      return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      const anchor = this.anchorEl;
      this.hideNow();
      anchor?.focus({ preventScroll: true });
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    event.stopPropagation();
    const items = this.visibleOptions();
    if (!items.length) return;
    const current = items.indexOf(event.target as HTMLElement);
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const next =
      current < 0
        ? direction > 0
          ? 0
          : items.length - 1
        : (current + direction + items.length) % items.length;
    items[next].focus({ preventScroll: true });
    items[next].scrollIntoView({ block: "nearest" });
  }

  private updateActiveState(): void {
    for (const item of this.container.querySelectorAll<HTMLElement>(
      ".vot-voice-popover__item",
    )) {
      const isActive = item.dataset.voice === this._activeVoice;
      item.classList.toggle("vot-voice-popover__item--active", isActive);
      item.setAttribute("aria-checked", isActive.toString());
    }
  }

  private schedulePositionUpdate(anchor: HTMLElement): void {
    if (this.positionRafId !== null) return;
    this.positionRafId = requestAnimationFrame(() => {
      this.positionRafId = null;
      this.updatePosition(anchor);
    });
  }

  private positionColumn(
    containerRect: DOMRect,
    rootRect: DOMRect,
    gap: number,
    position: string,
  ): { left: number; top: number; placement: "left" | "right" } {
    const spaceLeft = containerRect.left - rootRect.left - gap;
    const spaceRight = rootRect.right - containerRect.right - gap;
    const preferLeft = position === "right" || position === "rightCenter";
    const placement: "left" | "right" =
      (preferLeft && spaceLeft >= 160) || spaceLeft >= spaceRight
        ? "left"
        : "right";

    this.container.style.setProperty(
      "--vot-voice-popover-max-width",
      `${Math.max(160, Math.min(310, placement === "left" ? spaceLeft : spaceRight))}px`,
    );
    const popoverRect = this.container.getBoundingClientRect();
    const top =
      containerRect.top + containerRect.height / 2 - popoverRect.height / 2;
    const left =
      placement === "left"
        ? containerRect.left - popoverRect.width - gap
        : containerRect.right + gap;

    return { left, top, placement };
  }

  private positionRow(
    containerRect: DOMRect,
    rootRect: DOMRect,
    gap: number,
  ): { left: number; top: number; placement: "top" | "bottom" } {
    const spaceAbove = containerRect.top - rootRect.top - gap;
    const spaceBelow = rootRect.bottom - containerRect.bottom - gap;
    const placement: "top" | "bottom" =
      spaceAbove >= spaceBelow ? "top" : "bottom";
    this.container.style.setProperty(
      "--vot-voice-popover-max-height",
      `${Math.max(96, placement === "top" ? spaceAbove : spaceBelow)}px`,
    );
    const popoverRect = this.container.getBoundingClientRect();
    const left =
      containerRect.left + containerRect.width / 2 - popoverRect.width / 2;
    const top =
      placement === "top"
        ? containerRect.top - popoverRect.height - gap
        : containerRect.bottom + gap;

    return { left, top, placement };
  }

  private updatePosition(anchor: HTMLElement): void {
    if (!this.isOpen) return;

    const rootRect = this.layoutRoot.getBoundingClientRect();
    const gap = 8;
    const maxRootWidth = Math.max(160, rootRect.width - gap * 2);
    const maxRootHeight = Math.max(96, rootRect.height - gap * 2);

    this.container.style.setProperty(
      "--vot-voice-popover-max-width",
      `${Math.min(310, maxRootWidth)}px`,
    );
    this.container.style.setProperty(
      "--vot-voice-popover-max-height",
      `${maxRootHeight}px`,
    );

    const buttonContainer = anchor.closest("[data-direction]") ?? anchor;
    const containerRect = buttonContainer.getBoundingClientRect();
    const direction =
      (buttonContainer as HTMLElement).dataset?.direction ?? "row";
    const position =
      (buttonContainer as HTMLElement).dataset?.position ?? "default";

    const result =
      direction === "column"
        ? this.positionColumn(containerRect, rootRect, gap, position)
        : this.positionRow(containerRect, rootRect, gap);

    const popoverRect = this.container.getBoundingClientRect();
    let left = Math.max(
      rootRect.left + gap,
      Math.min(result.left, rootRect.right - popoverRect.width - gap),
    );
    let top = Math.max(
      rootRect.top + gap,
      Math.min(result.top, rootRect.bottom - popoverRect.height - gap),
    );

    left -= rootRect.left;
    top -= rootRect.top;

    this.container.dataset.placement = result.placement;
    this.container.style.left = `${left}px`;
    this.container.style.top = `${top}px`;
  }

  private attachLayoutListeners(): void {
    if (this.layoutListening) return;
    this.layoutListening = true;
    window.addEventListener("scroll", this.onLayoutChangeBound, true);
    window.addEventListener("resize", this.onLayoutChangeBound);
    window.visualViewport?.addEventListener("scroll", this.onLayoutChangeBound);
    window.visualViewport?.addEventListener("resize", this.onLayoutChangeBound);
  }

  private detachLayoutListeners(): void {
    if (!this.layoutListening) return;
    this.layoutListening = false;
    window.removeEventListener("scroll", this.onLayoutChangeBound, true);
    window.removeEventListener("resize", this.onLayoutChangeBound);
    window.visualViewport?.removeEventListener(
      "scroll",
      this.onLayoutChangeBound,
    );
    window.visualViewport?.removeEventListener(
      "resize",
      this.onLayoutChangeBound,
    );
  }

  private attachOutsideTapListener(): void {
    this.detachOutsideTapListener();
    this.outsideTapHandler = (e: PointerEvent) => {
      if (isEventInside(e, this.container)) return;
      if (this.anchorEl && isEventInside(e, this.anchorEl)) return;
      this.hideNow();
    };
    document.addEventListener("pointerdown", this.outsideTapHandler, {
      capture: true,
      passive: true,
    });
  }

  private detachOutsideTapListener(): void {
    if (!this.outsideTapHandler) return;
    document.removeEventListener("pointerdown", this.outsideTapHandler, {
      capture: true,
    });
    this.outsideTapHandler = null;
  }
}
