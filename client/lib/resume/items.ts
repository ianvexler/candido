/**
 * The items of an entry's content, as the server's CvItems sees them: each
 * top-level paragraph, heading or quote, and each direct item of a top-level
 * list. Whatever is nested in one belongs to it, and blank ones don't count.
 * These functions need a DOM.
 */
export type Item = {
  /** "" if the item has none yet. */
  id: string;
  text: string;
  /** Without the tick; equal to the server's html for stored content. */
  html: string;
  /** Left out of the CV. */
  off: boolean;
};

export const ITEM_ATTRIBUTE = "data-cv-item";
export const OFF_ATTRIBUTE = "data-cv-off";

const LISTS = ["ul", "ol"];
const BLOCKS = ["p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote"];
// Text on either side of one of these doesn't run together.
const SEPARATORS = [...LISTS, ...BLOCKS, "li", "br", "hr"];

/** Parsed in a document of its own, so nothing in it loads or runs. */
export const parseHtml = (html: string): HTMLElement => {
  const container = document.implementation.createHTMLDocument("").createElement("div");
  container.innerHTML = html;
  return container;
};

// Newer browsers escape < and > in attributes; older ones and the server don't.
const asServerHtml = (html: string) =>
  html.replace(/<[a-z][^>]*>/gi, (tag) => tag.replace(/&lt;/g, "<").replace(/&gt;/g, ">"));

const isOneOf = (names: string[], node: Node | null): node is Element =>
  node !== null && names.includes(node.nodeName.toLowerCase());

const isList = (node: Node | null): node is Element => isOneOf(LISTS, node);

/** A block, list, line break or rule: spaces next to it don't show. */
export const isSeparator = (node: Node) => isOneOf(SEPARATORS, node);

const words = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";

  const inner = Array.from(node.childNodes, words).join("");
  return isSeparator(node) ? ` ${inner} ` : inner;
};

// What Ruby's [[:space:]] matches. \s would also take U+FEFF and miss U+0085.
const SPACES = new RegExp("\\p{White_Space}+", "gu");

const textOf = (node: Node) => words(node).replace(SPACES, " ").replace(/^ | $/g, "");

const listElements = (list: Element) => Array.from(list.children).filter((child) => isOneOf(["li"], child));

const itemsIn = (container: Element): Element[] =>
  Array.from(container.children)
    .flatMap((node) => (isList(node) ? listElements(node) : isOneOf(BLOCKS, node) ? [node] : []))
    .filter((node) => textOf(node) !== "");

const isOff = (node: Element) => node.hasAttribute(OFF_ATTRIBUTE) && node.getAttribute(OFF_ATTRIBUTE) !== "false";

export const listItems = (html: string): Item[] =>
  itemsIn(parseHtml(html)).map((node) => {
    const off = isOff(node);
    node.removeAttribute(OFF_ATTRIBUTE);
    return { id: node.getAttribute(ITEM_ATTRIBUTE) ?? "", text: textOf(node), html: asServerHtml(node.outerHTML), off };
  });

export const setItemsOff = (html: string, ids: string[], off: boolean): string => {
  const container = parseHtml(html);
  itemsIn(container).forEach((node) => {
    const id = node.getAttribute(ITEM_ATTRIBUTE);
    if (!id || !ids.includes(id)) return;
    if (off) node.setAttribute(OFF_ATTRIBUTE, "true");
    else node.removeAttribute(OFF_ATTRIBUTE);
  });
  return asServerHtml(container.innerHTML);
};

/** Without unticked items, and without lists that leaves empty. */
export const visibleContent = (html: string): string => {
  const container = parseHtml(html);
  itemsIn(container)
    .filter(isOff)
    .forEach((node) => {
      const parent = node.parentElement;
      node.remove();
      if (isList(parent) && parent.children.length === 0 && textOf(parent) === "") parent.remove();
    });
  return asServerHtml(container.innerHTML);
};

/** What content is made of, in order: list items, and top-level nodes that aren't lists. */
const unitsIn = (container: Element): ChildNode[] =>
  Array.from(container.childNodes).flatMap((node): ChildNode[] => {
    const items = isList(node) ? listElements(node) : [];
    return items.length > 0 ? items : [node];
  });

/** Moves what follows a list item into a list of its own. Returns the first list. */
const splitAfter = (item: Element): Element => {
  const first = item.parentElement!;
  if (item.nextElementSibling) {
    const second = first.cloneNode(false) as Element;
    while (item.nextSibling) second.append(item.nextSibling);
    first.after(second);
  }
  return first;
};

/** Puts an item after a unit, or first. `list` is what a list item was in. */
const insertAfter = (container: Element, item: Element, list: Element | null, after: ChildNode | null) => {
  const afterList = isList(after?.parentElement ?? null) ? after!.parentElement! : null;
  const joins = (other: Element | null) => list !== null && other?.nodeName === list.nodeName;

  if (after && joins(afterList)) return after.after(item);

  const lastInList = !(after as Element | null)?.nextElementSibling;
  const following = !after
    ? container.firstElementChild
    : afterList
      ? lastInList ? afterList.nextElementSibling : null
      : (after as Element).nextElementSibling;
  if (following && joins(following)) return following.prepend(item);

  let block = item;
  if (list) {
    block = list.cloneNode(false) as Element;
    block.append(item);
  }
  if (!after) container.prepend(block);
  else (afterList ? splitAfter(after as Element) : after).after(block);
};

/**
 * The edited visible content with the unticked items of `full` back in it. Each
 * goes after its nearest preceding item that is still there, else first, and
 * unticked items keep their order. An item that is also visible stays as it is
 * there, but that only stands for one item of `full`, a ticked one if there is one.
 */
export const mergeVisible = (full: string, visible: string): string => {
  const fullContent = parseHtml(full);
  const items = itemsIn(fullContent);
  if (!items.some(isOff)) return visible;

  const result = parseHtml(visible);
  const visibleItems = itemsIn(result);
  // Blank ones too: an item whose text was just cleared still marks a place.
  const places = new Map<string, Element>();
  unitsIn(result).forEach((unit) => {
    const id = unit instanceof Element ? unit.getAttribute(ITEM_ATTRIBUTE) : null;
    if (!id) return;
    const held = places.get(id);
    if (!held || (!visibleItems.includes(held) && visibleItems.includes(unit as Element))) places.set(id, unit as Element);
  });

  const unticked = (unit: ChildNode): unit is Element =>
    unit instanceof Element && items.includes(unit) && isOff(unit);
  // The unit of `full` that each visible id stands for.
  const shown = new Map<string, ChildNode>();
  unitsIn(fullContent).forEach((unit) => {
    const id = unit instanceof Element ? unit.getAttribute(ITEM_ATTRIBUTE) : null;
    if (!id) return;
    const held = shown.get(id);
    if (!held || (unticked(held) && !unticked(unit))) shown.set(id, unit);
  });

  let after: ChildNode | null = null;
  let lastRestored: ChildNode | null = null;
  // Rules and blank blocks passed in `full` since `after`.
  let between: ChildNode[] = [];

  unitsIn(fullContent).forEach((unit) => {
    const id = unit instanceof Element ? (unit.getAttribute(ITEM_ATTRIBUTE) ?? "") : "";
    const place = places.get(id);
    const restore = unticked(unit);

    if (place && (!restore || (shown.get(id) === unit && visibleItems.includes(place)))) {
      after = place;
      between = [];
      return;
    }
    if (!restore) {
      between.push(unit);
      return;
    }

    const units = unitsIn(result);
    let index = after ? units.indexOf(after) : -1;
    between.forEach((node) => {
      if (units[index + 1]?.isEqualNode(node)) index += 1;
    });
    // The visible items may have been reordered since.
    if (lastRestored) index = Math.max(index, units.indexOf(lastRestored));

    const list = isList(unit.parentElement) ? unit.parentElement : null;
    const copy = unit.cloneNode(true) as Element;
    insertAfter(result, copy, list, units[index] ?? null);
    after = copy;
    lastRestored = copy;
    between = [];
  });

  return asServerHtml(result.innerHTML);
};

/**
 * mergeVisible for an editor loaded without the items in `hidden`. Ticks stay as
 * they are in `full`, even if they changed after loading.
 */
export const mergeEdited = (full: string, visible: string, hidden: string[]): string => {
  const off = listItems(full).filter((item) => item.off).map((item) => item.id);
  const tickedSince = hidden.filter((id) => !off.includes(id));
  const untickedSince = off.filter((id) => !hidden.includes(id));
  if (tickedSince.length === 0 && untickedSince.length === 0) return mergeVisible(full, visible);

  const merged = mergeVisible(setItemsOff(full, tickedSince, true), visible);
  return setItemsOff(setItemsOff(merged, tickedSince, false), untickedSince, true);
};
