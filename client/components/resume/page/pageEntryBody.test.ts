import { act, createElement, createRef, RefObject } from "react";
import { createRoot, Root } from "react-dom/client";
import type { Editor } from "@tiptap/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildResumeDocument } from "@/lib/resume/exportDocument";
import { emptyEntry } from "@/lib/resume/sectionEntries";
import type { SectionEntry } from "@/lib/types";
import PageEntryBody from "./PageEntryBody";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

vi.mock("../EditorControls", () => ({ BlockToolbar: () => null, FormatBubble: () => null }));

let host: HTMLDivElement;
let root: Root;
let editors: RefObject<Map<string, Editor>>;
const onEntryChange = vi.fn();

const entryWith = (content: string): SectionEntry => ({ ...emptyEntry(), id: "e", title: "T", content });
const show = (content: string, props: { near?: boolean; open?: boolean; version?: number } = {}) =>
  act(() =>
    root.render(createElement(PageEntryBody, { entry: entryWith(content), version: 0, onEntryChange, editors, near: false, ...props }))
  );
const exported = (content: string) =>
  buildResumeDocument({
    title: "t",
    header: { name: "", headline: "", email: "", phone: "", location: "", links: [] },
    sections: [{ id: 1, section_type: "X", entries: [entryWith(content)] }],
  }).sections[0].entries[0].html;
const body = () => host.querySelector<HTMLElement>("[role=textbox]:not(.ProseMirror)");
const editor = () => editors.current.get("e");

beforeEach(() => {
  onEntryChange.mockReset();
  editors = createRef() as RefObject<Map<string, Editor>>;
  editors.current = new Map();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("before its editor loads", () => {
  it.each([
    ["hidden text", '<p data-cv-item="a">Led <span data-cv-hidden="true">quietly</span> work</p>'],
    ["an item all hidden", '<ul><li data-cv-item="a"><p><span data-cv-hidden="true">x</span></p></li><li data-cv-item="b"><p>Kept</p></li></ul>'],
    ["unticked items", '<ul><li data-cv-item="a" data-cv-off="true"><p>Out</p></li><li data-cv-item="b"><p>In</p></li></ul><p data-cv-off="true" data-cv-item="c">Out</p>'],
    ["empty blocks", "<p>One</p><p></p><ul><li><p></p></li></ul><p>Two</p>"],
  ])("shows what is exported: %s", (_, content) => {
    show(content);
    expect(body()!.innerHTML).toBe(exported(content));
    expect(editor()).toBeUndefined();
  });

  it.each(["", "<p></p>", '<p data-cv-item="a" data-cv-off="true">Out</p>', '<p><span data-cv-hidden="true">x</span></p>'])(
    "shows nothing for %j",
    (content) => {
      expect(exported(content)).toBe("");
      show(content, { near: true });
      expect(host.innerHTML).toBe("");
    }
  );

  it("shows an empty editor if open", () => {
    show("", { near: true, open: true });
    expect(editor()!.isEmpty).toBe(true);
  });
});

describe("loading", () => {
  it("loads near the screen, and stays", () => {
    show("<p>Text</p>", { near: true });
    const loaded = editor();
    expect(loaded!.getText()).toBe("Text");
    show("<p>Text</p>", { near: false });
    expect(editor()).toBe(loaded);
  });

  it("loads at once when pressed", () => {
    show("<p>Text</p>");
    act(() => void body()!.firstElementChild!.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(editor()!.getText()).toBe("Text");
    expect(body()).toBeNull();
  });

  it("loads and takes focus by keyboard", () => {
    show("<p>Text</p>");
    expect(body()!.tabIndex).toBe(0);
    act(() => body()!.focus());
    expect(document.activeElement).toBe(editor()!.view.dom);
  });

  it("loads again for a new version", () => {
    show("<p>One</p>", { near: true });
    show("<p>Two</p>", { near: true, version: 1 });
    expect(editor()!.getText()).toBe("Two");
  });
});

describe("editing", () => {
  it("reports content with unticked items kept", () => {
    const content = '<p data-cv-item="a">In</p><p data-cv-item="b" data-cv-off="true">Out</p>';
    show(content, { near: true, version: 3 });
    act(() => void editor()!.commands.insertContentAt(1, "Put "));
    const [id, change, version] = onEntryChange.mock.calls[0];
    expect([id, version]).toEqual(["e", 3]);
    expect(change(entryWith(content))).toEqual({
      content: '<p data-cv-item="a">Put In</p><p data-cv-item="b" data-cv-off="true">Out</p>',
    });
  });

  it("stays while focused after its text is cleared", () => {
    show("<p>Text</p>", { near: true });
    act(() => editor()!.view.dom.focus());
    const loaded = editor();
    show("", { near: true });
    expect(editor()).toBe(loaded);
    act(() => editor()!.view.dom.blur());
    expect(host.innerHTML).toBe("");
  });

  it("keeps hidden text", () => {
    show('<p>foo<span data-cv-hidden="true">x</span>bar</p>', { near: true });
    const { view } = editor()!;
    act(() => view.dispatch(view.state.tr.delete(3, 5)));
    expect(editor()!.getHTML()).toContain('fo<span data-cv-hidden="true">x</span>bar');
  });
});

it("isn't unloaded, if emptied, by a switch to another window", () => {
  show("<p>Text</p>", { near: true });
  act(() => editor()!.view.dom.focus());
  const loaded = editor();
  show("", { near: true });
  // The document keeps its focused element.
  act(() => void editor()!.view.dom.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
  expect(editor()).toBe(loaded);
});

describe("code", () => {
  const CODE = '<pre><code class="language-js">a  b\n c</code></pre>';

  it("shows and keeps what is there", () => {
    show(CODE, { near: true });
    expect(editor()!.getHTML()).toBe(CODE);
  });

  it("isn't offered", () => {
    show("<p>Text</p>", { near: true });
    expect(editor()!.commands.setCodeBlock).toBeUndefined();
    act(() => void editor()!.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "c", ctrlKey: true, altKey: true, bubbles: true })));
    expect(editor()!.getHTML()).toContain("<p");
  });
});

describe("laid out as it prints", () => {
  const classOf = (selector: string) => [...host.querySelectorAll(selector)].map((node) => node.textContent);

  it("gives no room to blocks that had nothing to print", () => {
    show('<p>One</p><p></p><ul><li><p><span data-cv-hidden="true">x</span></p></li></ul><p>Two</p>', { near: true });
    expect(classOf(".page-skipped")).toEqual(["", "x"]);
    expect(host.querySelector("ul.page-skipped")).not.toBeNull();
    act(() => void editor()!.commands.setTextSelection(6));
    expect(classOf(".page-skipped")).toEqual(["x"]);
  });

  it("gives a line to a block emptied since", () => {
    show('<p>One<span data-cv-hidden="true">x</span></p><p>Two</p>', { near: true });
    const { view } = editor()!;
    act(() => view.dispatch(view.state.tr.delete(1, 4)));
    expect(classOf(".page-skipped")).toEqual([]);
    expect(classOf(".page-held")).toEqual(["x"]);
  });

  it("collapses the spaces around hidden text", () => {
    show('<p>Led <span data-cv-hidden="true">x</span> work</p><p><span data-cv-hidden="true">y</span> start</p>', { near: true });
    expect(classOf(".page-collapsed")).toEqual([" ", " "]);
    expect(editor()!.getText()).toBe("Led x work\n\ny start");
  });

  it("doesn't collapse a space after a hidden line break", () => {
    show('<p>foo<span data-cv-hidden="true"><br></span> bar</p>', { near: true });
    expect(classOf(".page-collapsed")).toEqual([]);
  });

  it("collapses typed spaces once the caret is elsewhere", () => {
    show("<p>ab</p><p>c</p>", { near: true });
    act(() => {
      editor()!.view.dom.focus();
      editor()!.view.dispatch(editor()!.state.tr.insertText("  ", 2));
    });
    expect(classOf(".page-collapsed")).toEqual([]);
    act(() => void editor()!.commands.setTextSelection(7));
    expect(classOf(".page-collapsed")).toEqual([" "]);
  });
});
