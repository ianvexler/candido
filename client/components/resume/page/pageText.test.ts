import { act, createElement } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TextBinding } from "./PageEditing";
import { oneLine, PageText } from "./PageText";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const onChange = vi.fn();

const show = (value: string, binding: Partial<TextBinding> = {}) =>
  act(() =>
    root.render(
      createElement(PageText, { as: "h3", className: "rc-title", binding: { value, label: "Title", onChange, ...binding } })
    )
  );
const element = () => host.querySelector("h3")!;
const focus = () => act(() => element().focus());
const blur = () => act(() => element().blur());
const fire = (event: Event) => {
  act(() => void element().dispatchEvent(event));
  return event;
};
const input = (text: string) => {
  const node = element().firstChild;
  if (node) node.nodeValue = text;
  else element().append(text);
  fire(new InputEvent("input", { bubbles: true }));
};
const caretAt = (start: number, end = start) =>
  getSelection()!.setBaseAndExtent(element().firstChild!, start, element().firstChild!, end);
const key = (name: string, init: KeyboardEventInit = {}) =>
  fire(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...init }));
const transfer = (type: "paste" | "drop", data: Record<string, string>) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    [type === "paste" ? "clipboardData" : "dataTransfer"]: { getData: (kind: string) => data[kind] ?? "", types: Object.keys(data) },
  });
  return fire(event);
};

beforeEach(() => {
  onChange.mockReset();
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("oneLine", () => {
  it.each([
    ["One\ntwo", "One two"],
    ["One\r\n\r\n  two\tthree", "One two three"],
    ["One\u2028two", "One two"],
    ["Kept  double ", "Kept  double "],
  ])("%j", (text, expected) => expect(oneLine(text)).toBe(expected));
});

describe("PageText", () => {
  it("is the static element, editable and labelled", () => {
    show("Northwind");
    expect(element().className).toBe("rc-title page-text");
    expect(element().getAttribute("contenteditable")).toBe("plaintext-only");
    expect(element().getAttribute("aria-label")).toBe("Title");
    expect(element().innerHTML).toBe("Northwind");
  });

  it("shows text spaced as the printed element does", () => {
    show("  North\n wind ");
    expect(element().textContent).toBe("North wind");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("is text, never markup", () => {
    show("<b>x</b>");
    expect(element().children).toHaveLength(0);
  });

  it("keeps the caret and text node when its own change comes back", () => {
    show("North");
    focus();
    const node = element().firstChild;
    input("Northw");
    caretAt(3);
    show("Northw");
    expect(onChange.mock.calls).toEqual([["Northw"]]);
    expect(element().firstChild).toBe(node);
    expect(getSelection()!.focusOffset).toBe(3);
  });

  it("reports text as typed and keeps spaces until it loses focus", () => {
    show("North");
    focus();
    input("North  a ");
    show("North  a ");
    expect(onChange).toHaveBeenLastCalledWith("North  a ");
    expect(element().textContent).toBe("North  a ");
    blur();
    expect(element().textContent).toBe("North a");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("keeps spaces while focused when the saver trims them", () => {
    show("North");
    focus();
    input("North ");
    show("North");
    expect(element().textContent).toBe("North ");
  });

  it("takes an outside value at once when not focused", () => {
    show("North");
    show("South");
    expect(element().textContent).toBe("South");
  });

  it("takes an outside value on blur when focused", () => {
    show("North");
    focus();
    show("South");
    expect(element().textContent).toBe("North");
    blur();
    expect(element().textContent).toBe("South");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps typed text on blur while its value hasn't come back", () => {
    show("North");
    focus();
    input("Norths");
    blur();
    show("North");
    expect(element().textContent).toBe("Norths");
    show("Norths");
    show("North");
    expect(element().textContent).toBe("North");
  });

  it("leaves the text alone when only the window loses focus", () => {
    show("North");
    focus();
    input("North ");
    fire(new FocusEvent("focusout", { bubbles: true }));
    expect(element().textContent).toBe("North ");
  });

  it("moves on at Enter, and blurs without somewhere to go", () => {
    const onEnter = vi.fn();
    show("North", { onEnter });
    focus();
    expect(key("Enter").defaultPrevented).toBe(true);
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(element());
    show("North");
    key("Enter");
    expect(document.activeElement).not.toBe(element());
    expect(element().textContent).toBe("North");
  });

  it("takes an on-screen keyboard's Enter, and no formatting", () => {
    const onEnter = vi.fn();
    show("North", { onEnter });
    const before = (inputType: string) => fire(new InputEvent("beforeinput", { inputType, bubbles: true, cancelable: true }));
    expect(before("insertParagraph").defaultPrevented).toBe(true);
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(before("formatBold").defaultPrevented).toBe(true);
    expect(before("insertText").defaultPrevented).toBe(false);
  });

  it("blurs at Escape", () => {
    show("North");
    focus();
    key("Escape");
    expect(document.activeElement).not.toBe(element());
  });

  it("leaves Enter and Escape to a composition", () => {
    const onEnter = vi.fn();
    show("North", { onEnter });
    focus();
    key("Enter", { isComposing: true });
    key("Escape", { isComposing: true });
    key("Enter", { keyCode: 229 });
    expect(onEnter).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(element());
  });

  it("reports composed text once, at its end", () => {
    show("N");
    focus();
    fire(new CompositionEvent("compositionstart", { bubbles: true }));
    input("Nに");
    show("outside");
    input("Nにほ");
    expect(onChange).not.toHaveBeenCalled();
    fire(new CompositionEvent("compositionend", { bubbles: true }));
    // Safari's last input follows the end.
    input("Nにほ");
    expect(onChange.mock.calls).toEqual([["Nにほ"]]);
  });

  it("reports text still being composed when it loses focus", () => {
    show("N");
    focus();
    fire(new CompositionEvent("compositionstart", { bubbles: true }));
    input("Nに");
    blur();
    expect(onChange.mock.calls).toEqual([["Nに"]]);
  });

  it("pastes as one line of plain text, over the selection", () => {
    show("North wind");
    focus();
    caretAt(6, 10);
    const event = transfer("paste", { "text/plain": "big\r\nbad\tsea\n", "text/html": "<b>big</b>" });
    expect(event.defaultPrevented).toBe(true);
    expect(element().innerHTML).toBe("North big bad sea");
    expect(onChange.mock.calls).toEqual([["North big bad sea"]]);
  });

  it("pastes nothing when there is no text", () => {
    show("North");
    focus();
    caretAt(0, 5);
    expect(transfer("paste", { "image/png": "x" }).defaultPrevented).toBe(true);
    expect(element().textContent).toBe("North");
  });

  it("takes over a drop of several lines only", () => {
    show("North");
    expect(transfer("drop", { "text/plain": "a\nb" }).defaultPrevented).toBe(true);
    expect(transfer("drop", { "text/plain": "a" }).defaultPrevented).toBe(false);
  });

  it("renders nothing when empty, unless open", () => {
    show(" ");
    expect(host.innerHTML).toBe("");
    show("", { open: true, placeholder: "Add a title" });
    expect(element().dataset.placeholder).toBe("Add a title");
    expect(element().hasAttribute("data-empty")).toBe(true);
    input("N");
    expect(element().hasAttribute("data-empty")).toBe(false);
  });

  it("stays while its text is cleared, until it loses focus", () => {
    show("N");
    focus();
    input("");
    show("");
    expect(document.activeElement).toBe(element());
    blur();
    expect(host.innerHTML).toBe("");
  });

  it("shows text again after having been empty", () => {
    show("");
    show("North");
    expect(element().textContent).toBe("North");
  });
});

describe("PageText without plain-text editing", () => {
  it("falls back to ordinary editing", () => {
    const set = vi.fn((value: string) => {
      if (value === "plaintext-only") throw new SyntaxError();
    });
    Object.defineProperty(HTMLElement.prototype, "contentEditable", { configurable: true, set });
    show("North");
    Reflect.deleteProperty(HTMLElement.prototype, "contentEditable");
    expect(element().getAttribute("contenteditable")).toBe("true");
    expect(transfer("drop", { "text/plain": "a" }).defaultPrevented).toBe(true);
  });
});
