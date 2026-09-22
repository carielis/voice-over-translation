import { render } from "lit-html";
import { localizationProvider } from "../../localization/localizationProvider";
import type {
  LanguageSelectKey,
  SelectItem,
  SelectProps,
  SelectUpdateItemsOptions,
} from "../../types/components/select";
import type { Phrase } from "../../types/localization";
import UI from "../../ui";
import { CHEVRON_ICON } from "../icons";
import { createDomId, UIComponentWithEvents } from "./componentShared";
import SelectDropdown from "./selectDropdown";

export default class Select<
  T extends string = string,
  MultiSelect extends boolean = false,
> extends UIComponentWithEvents<{
  selectItem: MultiSelect extends true ? [values: T[]] : [value: T];
  beforeOpen: [dropdown: SelectDropdown];
}> {
  outer: HTMLElement;
  arrowIcon: HTMLElement;
  title: HTMLElement;
  // Retained for source compatibility; dropdowns stay in their owner's shadow root.
  dialogParent: HTMLElement;
  labelElement?: HTMLElement | string;
  private _selectTitle: string;
  private readonly _dialogTitle: string;
  private readonly multiSelect: MultiSelect;
  private baseItems: SelectItem<T>[];
  private _items: SelectItem<T>[];
  private readonly searchItemsProvider?: SelectProps<
    T,
    MultiSelect
  >["searchItemsProvider"];
  private readonly listId = createDomId("vot-select-list");
  private dropdown?: SelectDropdown;
  private contentList?: HTMLElement;
  private searchInput?: HTMLInputElement;
  private status?: HTMLElement;
  private searchLoader?: HTMLElement;
  private query = "";
  private searchRequestId = 0;
  private activeIndex = -1;
  selectedItems: HTMLElement[] = [];
  selectedValues: Set<T>;

  constructor({
    selectTitle,
    dialogTitle,
    items,
    searchItemsProvider,
    labelElement,
    dialogParent = document.documentElement,
    multiSelect,
  }: SelectProps<T, MultiSelect>) {
    super(["selectItem", "beforeOpen"]);
    this._selectTitle = selectTitle;
    this._dialogTitle = dialogTitle;
    this.baseItems = items.map((item) => ({ ...item }));
    this._items = items.map((item) => ({ ...item }));
    this.searchItemsProvider = searchItemsProvider;
    this.multiSelect = (multiSelect ?? false) as MultiSelect;
    this.labelElement = labelElement;
    this.dialogParent = dialogParent;
    this.selectedValues = this.calcSelectedValues();
    const elements = this.createElements();
    this.container = elements.container;
    this.outer = elements.outer;
    this.arrowIcon = elements.arrowIcon;
    this.title = elements.title;
  }

  static genLanguageItems<T extends LanguageSelectKey = LanguageSelectKey>(
    langs: readonly T[],
    conditionString?: string,
  ) {
    return langs.map<SelectItem<T>>((lang) => {
      const phrase = `langs.${lang}` satisfies Phrase;
      const label = localizationProvider.get(phrase);
      return {
        label: label === phrase ? lang.toUpperCase() : label,
        value: lang,
        selected: conditionString === lang,
      };
    });
  }

  protected createElements() {
    const container = UI.createEl("vot-block", ["vot-select"]);
    container.classList.add(
      this.labelElement ? "vot-select--labeled" : "vot-select--control-only",
    );
    if (this.labelElement) container.append(this.labelElement);
    const outer = UI.createEl("vot-block", ["vot-select-outer"]);
    outer.setAttribute("role", "combobox");
    outer.setAttribute("aria-label", this._dialogTitle);
    outer.setAttribute("aria-haspopup", "listbox");
    outer.setAttribute("aria-expanded", "false");
    outer.tabIndex = 0;
    const title = UI.createEl("vot-block", ["vot-select-title"]);
    title.textContent = this.visibleText;
    const arrowIcon = UI.createEl("vot-block", ["vot-select-arrow-icon"]);
    render(CHEVRON_ICON, arrowIcon);
    outer.append(title, arrowIcon);
    outer.addEventListener("click", () => {
      if (!this.disabled) this.dropdown ? this.close() : this.open();
    });
    outer.addEventListener("keydown", this.onKeyDown);
    container.append(outer);
    return { container, outer, arrowIcon, title };
  }

  private open() {
    if (this.disabled || this.dropdown || !this.outer.isConnected) return;
    this.query = "";
    const dropdown = new SelectDropdown({
      anchor: this.outer,
      label: this._dialogTitle,
    });
    this.dropdown = dropdown;
    this.container.append(dropdown.container);
    this.outer.setAttribute("aria-expanded", "true");
    this.outer.setAttribute("aria-controls", this.listId);
    const searchWrap = UI.createEl("vot-block", ["vot-select-search-wrap"]);
    const input = document.createElement("input");
    input.type = "search";
    input.className = "vot-select-search";
    input.placeholder = localizationProvider.get("searchField");
    input.setAttribute(
      "aria-label",
      `${this._dialogTitle}: ${input.placeholder}`,
    );
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-controls", this.listId);
    input.autocomplete = "off";
    input.spellcheck = false;
    input.addEventListener("input", () => {
      void this.search(input.value);
    });
    searchWrap.append(input);
    this.searchInput = input;
    this.contentList = UI.createEl("vot-block", ["vot-select-content-list"]);
    this.contentList.id = this.listId;
    this.contentList.setAttribute("role", "listbox");
    this.contentList.setAttribute("aria-label", this._dialogTitle);
    if (this.multiSelect)
      this.contentList.setAttribute("aria-multiselectable", "true");
    this.contentList.addEventListener("click", this.onOptionClick);
    this.contentList.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button === 0)
        event.preventDefault();
    });
    this.status = UI.createEl("vot-block", ["vot-select-status"]);
    this.status.setAttribute("role", "status");
    dropdown.bodyContainer.append(searchWrap, this.contentList, this.status);
    dropdown.container.addEventListener("keydown", this.onKeyDown);
    dropdown.addEventListener("close", () => {
      if (this.dropdown !== dropdown) return;
      ++this.searchRequestId;
      this.searchLoader?.remove();
      this.searchLoader = undefined;
      this.dropdown = undefined;
      this.contentList = undefined;
      this.searchInput = undefined;
      this.status = undefined;
      this.selectedItems = [];
      this.activeIndex = -1;
      this.query = "";
      this._items = this.baseItems.map((item) => ({ ...item }));
      this.syncItemsSelectionState();
      this.updateTitle();
      this.outer.setAttribute("aria-expanded", "false");
      this.outer.removeAttribute("aria-controls");
      this.outer.removeAttribute("aria-activedescendant");
    });
    this.renderOptions();
    void this.events.beforeOpen.dispatchAsync(dropdown);
    dropdown.open();
    this.setActive(this.activeIndex);
  }

  close() {
    this.dropdown?.close();
    return this;
  }

  private readonly onOptionClick = (event: Event) => {
    if (!(event.target instanceof Element)) return;
    const option = event.target.closest<HTMLElement>(
      ".vot-select-content-item",
    );
    if (!option || !this.contentList?.contains(option)) return;
    this.choose(Number(option.dataset.votIndex));
  };

  private choose(index: number) {
    const item = this._items[index];
    if (!item || item.disabled || this.selectedItems[index]?.hidden) return;
    if (this.multiSelect) {
      if (this.selectedValues.has(item.value)) {
        if (this.selectedValues.size <= 1) return;
        this.selectedValues.delete(item.value);
      } else this.selectedValues.add(item.value);
    } else this.selectedValues = new Set([item.value]);
    // Keep remote search selections when restoring the base list on close.
    if (!this.baseItems.some((base) => base.value === item.value))
      this.baseItems.push({ ...item });
    this.syncItemsSelectionState();
    this.syncItemsSelectionState(this.baseItems);
    this.updateSelectedState();
    if (this.multiSelect) {
      this.setActive(index);
      this.dispatch("selectItem", Array.from(this.selectedValues) as any);
    } else {
      this.close();
      this.dispatch("selectItem", item.value as any);
    }
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (
      this.disabled ||
      event.isComposing ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    const inSearch = event.target === this.searchInput;
    if (event.key === "Escape" && this.dropdown) {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    if (event.key === "Tab") {
      if (this.dropdown) this.close();
      return;
    }
    if (
      ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key) &&
      !(inSearch && event.key === " ")
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (!this.dropdown) {
        this.open();
        this.searchInput?.focus({ preventScroll: true });
        return;
      }
      if (event.key === "Enter" || event.key === " ")
        this.choose(this.activeIndex);
      else this.moveActive(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (
      !inSearch &&
      this.dropdown &&
      (event.key === "Home" || event.key === "End")
    ) {
      event.preventDefault();
      event.stopPropagation();
      const available = this.availableIndices();
      this.setActive(
        (event.key === "Home" ? available[0] : available.at(-1)) ?? -1,
      );
      return;
    }
    if (!inSearch && event.key.length === 1) {
      event.preventDefault();
      event.stopPropagation();
      this.open();
      if (this.searchInput) {
        this.searchInput.focus({ preventScroll: true });
        this.searchInput.value = event.key;
        void this.search(event.key);
      }
    }
  };

  private availableIndices() {
    return this.selectedItems.flatMap((option, index) =>
      !option.hidden && !this._items[index]?.disabled ? [index] : [],
    );
  }
  private moveActive(direction: number) {
    const available = this.availableIndices();
    if (!available.length) {
      this.setActive(-1);
      return;
    }
    const current = available.indexOf(this.activeIndex);
    const next =
      current < 0
        ? direction > 0
          ? 0
          : available.length - 1
        : (current + direction + available.length) % available.length;
    this.setActive(available[next]);
  }
  private setActive(index: number, scroll = true) {
    this.activeIndex = index;
    for (const [i, option] of this.selectedItems.entries())
      option.dataset.votActive = String(i === index);
    const active = this.selectedItems[index];
    for (const target of [this.outer, this.searchInput]) {
      if (active) target?.setAttribute("aria-activedescendant", active.id);
      else target?.removeAttribute("aria-activedescendant");
    }
    if (active && scroll && this.contentList) {
      const box = active.getBoundingClientRect();
      const list = this.contentList.getBoundingClientRect();
      if (box.top < list.top) this.contentList.scrollTop -= list.top - box.top;
      else if (box.bottom > list.bottom)
        this.contentList.scrollTop += box.bottom - list.bottom;
    }
  }

  private renderOptions() {
    if (!this.contentList) return;
    this.contentList.replaceChildren();
    this.selectedItems = this._items.map((item, index) => {
      const option = UI.createEl("vot-block", ["vot-select-content-item"]);
      option.id = `${this.listId}-${index}`;
      option.textContent = item.label;
      option.dataset.votIndex = String(index);
      option.dataset.votValue = item.value;
      option.setAttribute("role", "option");
      option.setAttribute("aria-disabled", String(!!item.disabled));
      this.contentList?.append(option);
      return option;
    });
    this.updateSelectedState();
    this.filterOptions();
  }
  private filterOptions() {
    const query = this.query.trim().toLocaleLowerCase();
    for (const [index, option] of this.selectedItems.entries())
      option.hidden = !this._items[index].label
        .toLocaleLowerCase()
        .includes(query);
    const available = this.availableIndices();
    const selected = available.find((index) =>
      this.selectedValues.has(this._items[index].value),
    );
    this.setActive(selected ?? available[0] ?? -1, false);
    if (this.status) {
      this.status.textContent = localizationProvider.get("notFound");
      this.status.hidden = this.selectedItems.some((option) => !option.hidden);
    }
    this.dropdown?.updatePosition();
    this.setActive(this.activeIndex);
  }
  private async search(query: string) {
    this.query = query;
    const requestId = ++this.searchRequestId;
    this.searchLoader?.remove();
    this.searchLoader = undefined;
    const dropdown = this.dropdown;
    if (!dropdown) return;
    this.filterOptions();
    if (!this.searchItemsProvider) return;
    this.contentList?.setAttribute("aria-busy", "true");
    const loader = UI.createInlineLoader();
    this.searchLoader = loader;
    dropdown.footerContainer.append(loader);
    try {
      const items = await this.searchItemsProvider(query);
      if (requestId !== this.searchRequestId || this.dropdown !== dropdown)
        return;
      this.updateItems(items, { persist: false });
    } catch {
      if (requestId !== this.searchRequestId || this.dropdown !== dropdown)
        return;
      this._items = this.baseItems.map((item) => ({ ...item }));
      this.syncItemsSelectionState();
      this.renderOptions();
    } finally {
      loader.remove();
      if (this.searchLoader === loader) this.searchLoader = undefined;
      if (requestId === this.searchRequestId)
        this.contentList?.removeAttribute("aria-busy");
    }
  }
  private syncItemsSelectionState(items = this._items) {
    for (const item of items)
      item.selected = this.selectedValues.has(item.value);
  }
  private calcSelectedValues() {
    return new Set(
      this._items.filter((item) => item.selected).map((item) => item.value),
    );
  }
  updateTitle() {
    this.title.textContent = this.visibleText;
    return this;
  }
  updateSelectedState() {
    for (const option of this.selectedItems) {
      const selected = this.selectedValues.has(option.dataset.votValue as T);
      option.dataset.votSelected = String(selected);
      option.setAttribute("aria-selected", String(selected));
    }
    this.updateTitle();
    return this;
  }
  setSelectedValue(value: typeof this.multiSelect extends true ? T[] : T) {
    const values = (Array.isArray(value) ? value : [value]) as T[];
    this.selectedValues = new Set(
      this.multiSelect ? values : values.slice(0, 1),
    );
    this.syncItemsSelectionState();
    this.syncItemsSelectionState(this.baseItems);
    this.updateSelectedState();
    return this;
  }
  /** Use chaining or reassign the result to get the updated item type. */
  updateItems<U extends string = string>(
    newItems: SelectItem<U>[],
    options: SelectUpdateItemsOptions = {},
  ): Select<U> {
    const { persist = true } = options;
    const items = newItems.map((item) => ({
      ...item,
    })) as unknown as SelectItem<T>[];
    this._items = items;
    if (persist) {
      ++this.searchRequestId;
      this.searchLoader?.remove();
      this.searchLoader = undefined;
      this.contentList?.removeAttribute("aria-busy");
      this.baseItems = items.map((item) => ({ ...item }));
      this.selectedValues = this.calcSelectedValues();
    } else this.syncItemsSelectionState();
    this.updateSelectedState();
    this.renderOptions();
    return this as unknown as Select<U>;
  }
  get visibleText() {
    const items = [
      ...this._items,
      ...this.baseItems.filter(
        (base) => !this._items.some((item) => item.value === base.value),
      ),
    ];
    if (!this.multiSelect)
      return (
        items.find((item) => this.selectedValues.has(item.value))?.label ??
        this._selectTitle
      );
    return (
      items
        .filter((item) => this.selectedValues.has(item.value))
        .map((item) => item.label)
        .join(", ") || this._selectTitle
    );
  }
  set selectTitle(title: string) {
    this._selectTitle = title;
    this.updateTitle();
  }
  get disabled() {
    return (
      this.outer.hasAttribute("disabled") ||
      this.outer.getAttribute("aria-disabled") === "true"
    );
  }
  set disabled(isDisabled: boolean) {
    if (isDisabled) this.outer.setAttribute("disabled", "true");
    else this.outer.removeAttribute("disabled");
    this.outer.setAttribute("aria-disabled", String(isDisabled));
    this.outer.tabIndex = isDisabled ? -1 : 0;
    if (isDisabled) this.dropdown?.close(false);
  }
}
