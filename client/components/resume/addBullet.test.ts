import { Editor } from "@tiptap/core";
import { redo, undo, undoDepth } from "@tiptap/pm/history";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withoutBlankEnd } from "@/lib/resume/items";
import { addBullet, caretAtItem } from "./addBullet";
import { contentExtensions } from "./review/replaceInContent";

let editor: Editor;
let outside: HTMLButtonElement;
const onLost = vi.fn();

const open = (content: string) => {
  editor = new Editor({ element: document.body.appendChild(document.createElement("div")), extensions: contentExtensions, content });
};
const html = () => editor.getHTML();
const type = (text: string) => editor.view.dispatch(editor.state.tr.insertText(text));
const add = () => addBullet(editor, onLost);
/** Pressing elsewhere or Tab. */
const leave = () => {
  outside.focus();
  vi.advanceTimersByTime(100);
};

beforeEach(() => {
  vi.useFakeTimers();
  onLost.mockReset();
  document.hasFocus = () => true;
  Element.prototype.scrollIntoView = () => {};
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  outside = document.body.appendChild(document.createElement("button"));
});
afterEach(() => {
  editor.destroy();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("where a bullet goes", () => {
  it.each([
    ["the end of the last list", "<ul><li><p>A</p></li></ul><p>B</p>", "<ul><li><p>A</p></li><li><p>new</p></li></ul><p>B</p>"],
    ["the last of two lists", "<ul><li><p>A</p></li></ul><p>B</p><ol><li><p>C</p></li></ol>", "<ul><li><p>A</p></li></ul><p>B</p><ol><li><p>C</p></li><li><p>new</p></li></ol>"],
    ["after a nested list", "<ul><li><p>A</p><ul><li><p>B</p></li></ul></li></ul>", "<ul><li><p>A</p><ul><li><p>B</p></li></ul></li><li><p>new</p></li></ul>"],
    ["a new list at the end", "<p>A</p>", "<p>A</p><ul><li><p>new</p></li></ul>"],
    ["instead of an empty paragraph", "<p></p>", "<ul><li><p>new</p></li></ul>"],
    ["a bullet left empty", "<ul><li><p>A</p></li><li><p></p></li></ul>", "<ul><li><p>A</p></li><li><p>new</p></li></ul>"],
  ])("%s", (_, content, wanted) => {
    open(content);
    add();
    expect(editor.view.hasFocus()).toBe(true);
    type("new");
    expect(html().replace(/ data-cv-item="[^"]*"/g, "").replace(/<(ol)[^>]*>/, "<$1>")).toBe(wanted);
  });

  it("is undone in one step, apart from what was typed around it", () => {
    open(`<ul><li data-cv-item="a"><p>A</p></li></ul>`);
    const before = html();
    type("x");
    const typed = html();
    add();
    const added = html();
    type("y");
    undo(editor.state, editor.view.dispatch);
    expect(html()).toBe(added);
    undo(editor.state, editor.view.dispatch);
    expect(html()).toBe(typed);
    undo(editor.state, editor.view.dispatch);
    expect(html()).toBe(before);
  });
});

describe("a bullet left empty", () => {
  it("goes when the editor is left, and takes its undo step along", () => {
    open("<p></p>");
    type("A");
    const before = html();
    const depth = undoDepth(editor.state);
    add();
    leave();
    expect(html()).toBe(before);
    expect(undoDepth(editor.state)).toBe(depth);
    redo(editor.state, editor.view.dispatch);
  });

  it("goes with its typing, which one undo brings back", () => {
    open(`<ul><li data-cv-item="a"><p>A</p></li></ul>`);
    const before = html();
    add();
    type("xy");
    const typed = html();
    vi.advanceTimersByTime(1000);
    editor.commands.deleteRange({ from: editor.state.selection.from - 2, to: editor.state.selection.from });
    leave();
    expect(html()).toBe(before);
    undo(editor.state, editor.view.dispatch);
    expect(html()).toBe(typed);
  });

  it("empties the document if it was all", () => {
    open("<p></p>");
    add();
    type("x");
    editor.commands.deleteRange({ from: editor.state.selection.from - 1, to: editor.state.selection.from });
    leave();
    expect(html()).toBe("<p></p>");
  });

  it("goes after it was indented", () => {
    open(`<ul><li data-cv-item="a"><p>A</p></li></ul>`);
    const before = html();
    add();
    editor.commands.sinkListItem("listItem");
    expect(html()).not.toBe(before);
    leave();
    expect(html()).toBe(before);
  });

  it("is kept with text, or where another item was emptied", () => {
    open("<ul><li><p>A</p></li><li><p></p></li><li><p>B</p></li></ul>");
    add();
    type("C");
    leave();
    expect(html()).toContain(">C<");
    expect(editor.state.doc.firstChild!.childCount).toBe(4);
  });

  it("goes too if it was there already, in a step of its own", () => {
    open(`<ul><li data-cv-item="a"><p>A</p></li><li data-cv-item="b"><p></p></li></ul>`);
    const before = html();
    type("x");
    const typed = html();
    add();
    leave();
    expect(html()).not.toContain("<p></p></li>");
    expect(editor.state.doc.firstChild!.childCount).toBe(1);
    undo(editor.state, editor.view.dispatch);
    expect(html()).toBe(typed);
    undo(editor.state, editor.view.dispatch);
    expect(html()).toBe(before);
  });

  it("is undone as one if it is asked for twice", () => {
    open(`<ul><li data-cv-item="a"><p>A</p></li></ul>`);
    const before = html();
    const depth = undoDepth(editor.state);
    add();
    outside.focus();
    add();
    leave();
    expect(html()).toBe(before);
    expect(undoDepth(editor.state)).toBe(depth);
  });

  it("stays while another window has the focus, or a toolbar", () => {
    open(`<ul><li data-cv-item="a"><p>A</p></li></ul>`);
    add();
    document.hasFocus = () => false;
    leave();
    expect(editor.state.doc.firstChild!.childCount).toBe(2);
    document.hasFocus = () => true;
    editor.view.focus();
    const bar = document.body.appendChild(document.createElement("div"));
    bar.setAttribute("data-floating-ui-portal", "");
    bar.append(outside);
    leave();
    expect(editor.state.doc.firstChild!.childCount).toBe(2);
  });

  it("goes only once a press elsewhere has ended", () => {
    open(`<ul><li data-cv-item="a"><p>A</p></li></ul>`);
    add();
    document.dispatchEvent(new Event("pointerdown"));
    leave();
    expect(editor.state.doc.firstChild!.childCount).toBe(2);
    document.dispatchEvent(new Event("pointerup"));
    vi.advanceTimersByTime(1);
    expect(editor.state.doc.firstChild!.childCount).toBe(1);
  });

  it("is reported if its editor goes first", () => {
    open(`<ul><li data-cv-item="a"><p>A</p></li></ul>`);
    add();
    editor.destroy();
    vi.advanceTimersByTime(1);
    expect(onLost).toHaveBeenCalledTimes(1);
  });
});

it.each([
  ["<ul><li><p>A</p></li><li><p></p></li></ul>", "<ul><li><p>A</p></li></ul>"],
  ["<p>A</p><ul><li><p></p></li></ul>", "<p>A</p>"],
  ["<ul><li><p></p></li></ul>", ""],
  ["<ul><li><p>A</p></li></ul>", "<ul><li><p>A</p></li></ul>"],
  ["<ul><li><p>A</p><ul><li><p></p></li></ul></li></ul>", "<ul><li><p>A</p></li></ul>"],
  ["<ul><li><p>A</p><ul><li><p>B</p></li><li><p></p></li></ul></li></ul>", "<ul><li><p>A</p><ul><li><p>B</p></li></ul></li></ul>"],
])("withoutBlankEnd(%s)", (content, wanted) => expect(withoutBlankEnd(content)).toBe(wanted));

describe("caretAtItem", () => {
  it.each([
    ["<ul><li data-cv-item=\"a\"><p>One</p></li></ul><p data-cv-item=\"b\">Two</p>", "b", "Two"],
    ["<ul><li data-cv-item=\"a\"><p>One</p><ul><li><p>In</p></li></ul></li></ul>", "a", "In"],
    ["<p data-cv-item=\"a\">Seen <span data-cv-hidden=\"true\">not</span></p>", "a", "Seen "],
  ])("is after the item's last text that shows", (content, id, text) => {
    open(content);
    const pos = caretAtItem(editor.state.doc, id)!;
    expect(editor.state.doc.resolve(pos).nodeBefore?.text).toBe(text);
  });

  it("is nowhere without the item", () => {
    open("<p data-cv-item=\"a\">A</p>");
    expect(caretAtItem(editor.state.doc, "b")).toBeNull();
  });
});
