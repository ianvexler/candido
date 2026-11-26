import { Editor } from "@tiptap/core";
import { redo, undo, undoDepth } from "@tiptap/pm/history";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withoutBlankAt, withoutBlankEnd } from "@/lib/resume/items";
import { addBullet, caretAtItem, insertBlock } from "./addBullet";
import { editInEditor } from "./placeCaret";
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

  it("is reported if its editor goes first, with how to drop it from the saved text", () => {
    open(`<ul><li data-cv-item="a"><p>A</p></li></ul>`);
    add();
    const saved = html();
    editor.destroy();
    vi.advanceTimersByTime(1);
    expect(onLost).toHaveBeenCalledTimes(1);
    expect(onLost.mock.calls[0][0](saved)).toBe('<ul><li data-cv-item="a"><p>A</p></li></ul>');
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

describe("a block put at a place", () => {
  const LIST = '<ul><li data-cv-item="b1"><p>One</p></li><li data-cv-item="b2"><p>Two</p></li></ul>';
  const insert = (after: string | null, kind: "bullet" | "paragraph") => insertBlock(editor, after, kind, onLost);
  /** Where the caret is, without the server's ids. */
  const plain = () => html().replace(/ data-cv-item="[^"]*"/g, "");
  const caretIn = () => editor.state.selection.$head.node(editor.state.selection.$head.depth - 1).type.name;

  it("is a bullet right after a bullet, in its list", () => {
    open(LIST);
    expect(insert("b1", "bullet")).toBe(true);
    expect(editor.view.hasFocus()).toBe(true);
    expect(caretIn()).toBe("listItem");
    type("new");
    expect(plain()).toBe("<ul><li><p>One</p></li><li><p>new</p></li><li><p>Two</p></li></ul>");
  });

  it("is a paragraph that splits the list around it", () => {
    open(LIST);
    expect(insert("b1", "paragraph")).toBe(true);
    expect(editor.state.selection.$head.parent.type.name).toBe("paragraph");
    expect(caretIn()).toBe("doc");
    type("new");
    expect(plain()).toBe("<ul><li><p>One</p></li></ul><p>new</p><ul><li><p>Two</p></li></ul>");
  });

  it("is a paragraph after the list, after its last bullet", () => {
    open(LIST);
    insert("b2", "paragraph");
    type("new");
    expect(plain()).toBe("<ul><li><p>One</p></li><li><p>Two</p></li></ul><p>new</p>");
  });

  it.each([
    ["a bullet in a new list after a paragraph", "p1", "bullet", "<p>Intro</p><ul><li><p>new</p></li></ul>"],
    ["a bullet in a new list at the top", null, "bullet", "<ul><li><p>new</p></li></ul><p>Intro</p>"],
    ["a paragraph at the top", null, "paragraph", "<p>new</p><p>Intro</p>"],
    ["a paragraph after a paragraph", "p1", "paragraph", "<p>Intro</p><p>new</p>"],
  ] as const)("is %s", (_, after, kind, wanted) => {
    open('<p data-cv-item="p1">Intro</p>');
    expect(insert(after, kind)).toBe(true);
    type("new");
    expect(plain()).toBe(wanted);
  });

  it("is a bullet in place of an empty body", () => {
    open("<p></p>");
    insert(null, "bullet");
    type("new");
    expect(plain()).toBe("<ul><li><p>new</p></li></ul>");
  });

  it("is nowhere without the item, which leaves the text as it is", () => {
    open(LIST);
    const before = html();
    expect(insert("missing", "bullet")).toBe(false);
    expect(html()).toBe(before);
  });

  it.each(["bullet", "paragraph"] as const)("goes as a %s when the editor is left with it empty", (kind) => {
    open(LIST);
    const before = html();
    insert("b1", kind);
    leave();
    expect(html()).toBe(before);
  });

  it("goes after it was written in and emptied, with the list it split joined again", () => {
    open(LIST);
    const before = html();
    insert("b1", "paragraph");
    type("x");
    editor.commands.deleteRange({ from: editor.state.selection.from - 1, to: editor.state.selection.from });
    leave();
    expect(html()).toBe(before);
  });

  it.each([
    ["bullet", '<ul><li data-cv-item="b1"><p>One</p></li><li data-cv-item="b2"><p>Two</p></li></ul>'],
    ["paragraph", '<ul><li data-cv-item="b1"><p>One</p></li><li data-cv-item="b2"><p>Two</p></li></ul>'],
  ] as const)("is reported as a %s in the middle if its editor goes first, and dropped from the saved text", (kind, wanted) => {
    open(LIST);
    insert("b1", kind);
    const saved = html();
    editor.destroy();
    vi.advanceTimersByTime(1);
    expect(onLost).toHaveBeenCalledTimes(1);
    expect(onLost.mock.calls[0][0](saved)).toBe(wanted);
  });

  it("is dropped from saved text that has left out items the editor doesn't", () => {
    open('<p data-cv-item="p1">Intro</p><ul><li data-cv-item="b2"><p>Two</p></li></ul>');
    insert("p1", "bullet");
    editor.destroy();
    vi.advanceTimersByTime(1);
    const saved =
      '<p data-cv-item="z" data-cv-off="true">Out</p><p data-cv-item="p1">Intro</p><ul><li><p></p></li></ul><ul><li data-cv-item="b2"><p>Two</p></li></ul>';
    expect(onLost.mock.calls[0][0](saved)).toBe(
      '<p data-cv-item="z" data-cv-off="true">Out</p><p data-cv-item="p1">Intro</p><ul><li data-cv-item="b2"><p>Two</p></li></ul>'
    );
  });

  it("stays with text", () => {
    open(LIST);
    insert("b1", "paragraph");
    type("x");
    leave();
    expect(plain()).toContain("<p>x</p>");
  });

  it("is asked for as a place to edit", () => {
    open(LIST);
    const target = { sectionId: 1, what: "insert", entryId: "a", after: "b2", kind: "bullet" } as const;
    expect(editInEditor(editor, target, onLost)).toBe(true);
    type("new");
    expect(plain()).toBe("<ul><li><p>One</p></li><li><p>Two</p></li><li><p>new</p></li></ul>");
    expect(editInEditor(editor, { ...target, after: "gone" }, onLost)).toBe(false);
  });
});

describe("withoutBlankAt", () => {
  it.each([
    ["a bullet", "<ul><li><p>A</p></li><li><p></p></li><li><p>B</p></li></ul>", 1, "<ul><li><p>A</p></li><li><p>B</p></li></ul>"],
    ["a list it was alone in", "<p>A</p><ul><li><p></p></li></ul>", 1, "<p>A</p>"],
    ["a paragraph, joining the list it split", "<ul><li><p>A</p></li></ul><p></p><ul><li><p>B</p></li></ul>", 1, "<ul><li><p>A</p></li><li><p>B</p></li></ul>"],
    ["nothing with text", "<p>A</p><p>B</p>", 1, "<p>A</p><p>B</p>"],
    ["nothing that isn't there", "<p>A</p>", 3, "<p>A</p>"],
    ["what shows, past left out items", '<p data-cv-off="true">X</p><p></p><p>A</p>', 0, '<p data-cv-off="true">X</p><p>A</p>'],
  ])("drops %s", (_, content, shown, wanted) => expect(withoutBlankAt(content, shown)).toBe(wanted));
});

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
