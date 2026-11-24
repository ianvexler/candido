import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Slice } from "@tiptap/pm/model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listItems } from "@/lib/resume/items";
import CvItem from "./CvItem";
import HiddenMark from "./HiddenMark";
import { SuggestionHighlight } from "./review/SuggestionHighlight";

let editor: Editor | null = null;

const make = (content: string) => {
  editor?.destroy();
  editor = new Editor({ extensions: [StarterKit, HiddenMark, SuggestionHighlight, CvItem], content });
  return editor;
};

afterEach(() => {
  editor?.destroy();
  editor = null;
});

const p = (id: string, text = id) => `<p data-cv-item="${id}">${text}</p>`;
const li = (id: string, text = id, more = "") => `<li data-cv-item="${id}"><p>${text}</p>${more}</li>`;
const ul = (...items: string[]) => `<ul>${items.join("")}</ul>`;
const ids = (e: Editor) => listItems(e.getHTML()).map((item) => item.id);
const pairs = (e: Editor) => listItems(e.getHTML()).map((item) => `${item.text}:${item.id}`);
const every = (e: Editor) => Array.from(e.getHTML().matchAll(/data-cv-item="([^"]*)"/g), (match) => match[1]);

/** Position in the text `offset` characters into the textblock reading `text`. */
const at = (e: Editor, text: string, offset = 0) => {
  let found = -1;
  e.state.doc.descendants((node, pos) => {
    if (found < 0 && node.isTextblock && node.textContent === text) found = pos + 1 + offset;
  });
  if (found < 0) throw new Error(`no "${text}"`);
  return found;
};
const cursor = (e: Editor, text: string, offset = 0) => e.commands.setTextSelection(at(e, text, offset));
const key = (e: Editor, name: string) => e.commands.keyboardShortcut(name);
const paste = (e: Editor, html: string) => {
  // jsdom has no ClipboardEvent.
  const event = new Event("paste") as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    value: { getData: (type: string) => (type === "text/html" ? html : ""), files: [], items: [] },
  });
  e.view.pasteHTML(html, event);
};
const type = (e: Editor, text: string) => {
  for (const char of text) {
    const { from, to } = e.state.selection;
    if (!e.view.someProp("handleTextInput", (f) => f(e.view, from, to, char, () => e.state.tr.insertText(char, from, to)))) {
      e.view.dispatch(e.state.tr.insertText(char, from, to));
    }
  }
};

const expectValid = (e: Editor) => {
  const all = every(e);
  expect(new Set(all).size).toBe(all.length);
  expect(ids(e).every((id) => /^[\w-]{1,64}$/.test(id))).toBe(true);
  // Nothing that isn't an item has an id.
  e.state.doc.descendants((node, pos, parent) => {
    const isItem =
      parent === e.state.doc || (node.type.name === "listItem" && e.state.doc.resolve(pos).depth === 1);
    if (!isItem) expect(node.attrs.cvItem ?? null).toBeNull();
  });
};

describe("loading", () => {
  it("changes nothing", () => {
    const html = `<h3 data-cv-item="h">h</h3>${p("a")}${ul(li("b"))}<blockquote data-cv-item="q"><p>q</p></blockquote>`;
    const e = make(html);
    const onTransaction = vi.fn();
    e.on("transaction", onTransaction);
    expect(e.getHTML()).toBe(html);
    cursor(e, "a", 1);
    expect(onTransaction.mock.calls.some(([{ transaction }]) => transaction.docChanged)).toBe(false);
  });

  it("gives ids with the first edit only, to items only", () => {
    const e = make(`<p>a</p>${ul("<li><p>b</p><ul><li><p>n</p></li></ul></li>")}<blockquote><p>q</p></blockquote><p></p>`);
    expect(every(e)).toEqual([]);
    cursor(e, "a", 1);
    type(e, "x");
    expect(every(e)).toHaveLength(3);
    expect(ids(e)).toHaveLength(3);
    expectValid(e);
  });

  it("ignores ids the server wouldn't keep", () => {
    const e = make(p("not valid", "a"));
    type(e, "x");
    expectValid(e);
  });

  it("removes ids from nested content on an edit", () => {
    const e = make(ul(li("a", "a", ul(li("n")))));
    cursor(e, "a", 1);
    type(e, "x");
    expect(every(e)).toEqual(["a"]);
  });
});

describe("splitting and joining", () => {
  it("gives the second half of a split item a new id, and undo restores the original", () => {
    const html = ul(li("a", "one two"), li("b"));
    const e = make(html);
    cursor(e, "one two", 3);
    key(e, "Enter");
    expect(ids(e)).toHaveLength(3);
    expect(ids(e)[0]).toBe("a");
    expect(ids(e)[2]).toBe("b");
    expectValid(e);
    const after = e.getHTML();

    e.commands.undo();
    // The editor may keep its trailing paragraph.
    expect(e.getHTML().replace(/<p><\/p>$/, "")).toBe(html);
    e.commands.redo();
    expect(e.getHTML()).toBe(after);
  });

  it("splits a paragraph the same way", () => {
    const e = make(p("a", "one two"));
    cursor(e, "one two", 3);
    key(e, "Enter");
    expect(ids(e)[0]).toBe("a");
    expectValid(e);
  });

  it.each([[ul(li("z"), li("a", "text"))], [p("z") + p("a", "text")]])("leaves the id with the text on Enter at its start", (html) => {
    const e = make(html);
    cursor(e, "text");
    key(e, "Enter");
    expect(pairs(e)).toEqual(["z:z", "text:a"]);
    expectValid(e);
    e.commands.undo();
    expect(pairs(e)).toEqual(["z:z", "text:a"]);
    expect(e.getHTML()).toContain(html.slice(-20));
  });

  it("gives a new paragraph an id once it has text, in the same undo step", () => {
    const e = make(p("a"));
    cursor(e, "a", 1);
    key(e, "Enter");
    expect(every(e)).toEqual(["a"]);
    type(e, "new");
    expect(ids(e)).toHaveLength(2);
    expectValid(e);
    e.commands.undo();
    expect(every(e)).toEqual(["a"]);
  });

  it.each([[p("a", "one") + p("b", "two") + p("c")], [ul(li("a", "one"), li("b", "two"), li("c"))]])(
    "keeps the first id when deleting across two items, unless all its text went", (html) => {
    const middle = make(html);
    middle.commands.setTextSelection({ from: at(middle, "one", 1), to: at(middle, "two", 1) });
    key(middle, "Backspace");
    expect(pairs(middle)).toEqual(["owo:a", "c:c"]);
    middle.commands.undo();
    expect(pairs(middle)).toEqual(["one:a", "two:b", "c:c"]);

    const fromStart = make(html);
    fromStart.commands.setTextSelection({ from: at(fromStart, "one"), to: at(fromStart, "two", 1) });
    key(fromStart, "Backspace");
    expect(pairs(fromStart)).toEqual(["wo:b", "c:c"]);
  });

  it("keeps the id of an item that is emptied and retyped", () => {
    const e = make(ul(li("a", "one"), li("b")));
    e.commands.setTextSelection({ from: at(e, "one"), to: at(e, "one", 3) });
    key(e, "Backspace");
    expect(every(e)).toEqual(["a", "b"]);
    type(e, "x");
    expect(pairs(e)).toEqual(["x:a", "b:b"]);
  });
});

describe("pasting and dragging", () => {
  it.each([[ul(li("a"))], [p("a")], [`<blockquote data-cv-item="a"><p>a</p></blockquote>`]])(
    "gives a pasted copy a new id", (html) => {
    const e = make(html + p("end"));
    e.commands.setTextSelection({ from: 0, to: e.state.doc.child(0).nodeSize });
    const copied = e.view.serializeForClipboard(e.state.doc.slice(0, e.state.doc.child(0).nodeSize)).dom.innerHTML;
    cursor(e, "end", 3);
    key(e, "Enter");
    paste(e, copied);
    expect(pairs(e).slice(0, 2)).toEqual(["a:a", "end:end"]);
    expect(ids(e)).toHaveLength(3);
    expectValid(e);
  });

  it("pasting above the original, or into another editor, never brings an id", () => {
    const above = make(ul(li("z"), li("a")));
    cursor(above, "z");
    paste(above, ul(li("a"), li("k", "k", ul(li("n")))));
    expect(pairs(above)).toContain("a:a");
    expect(ids(above).filter((id) => id === "a")).toHaveLength(1);
    expect(every(above)).not.toContain("k");
    expectValid(above);

    const other = make("<p></p>");
    paste(other, p("a") + p("b"));
    expect(ids(other)).toHaveLength(2);
    expect(every(other)).not.toContain("a");
  });

  const dropped = (e: Editor, slice: Slice) => {
    let result = slice;
    e.view.someProp("transformPasted", (f) => {
      result = f(result, e.view, false);
    });
    return result;
  };

  it("keeps the id of an item moved by dragging", () => {
    const e = make(p("a") + p("b"));
    const slice = e.state.doc.slice(3, 6);
    e.view.dragging = { slice, move: true };
    e.view.dispatch(e.state.tr.delete(3, 6).insert(0, dropped(e, slice).content));
    expect(pairs(e)).toEqual(["b:b", "a:a"]);
  });

  it("leaves the id with the original when a copy is dropped above it", () => {
    const e = make(p("a") + p("b"));
    const slice = e.state.doc.slice(3, 6);
    e.view.dragging = { slice, move: false };
    e.view.dispatch(e.state.tr.insert(0, dropped(e, slice).content));
    expect(pairs(e).slice(1)).toEqual(["a:a", "b:b"]);
    expectValid(e);
  });

  it("strips what is dragged in from elsewhere", () => {
    const e = make(p("a"));
    const slice = make(p("k")).state.doc.slice(0, 3);
    expect(dropped(editor!, slice).content.firstChild!.attrs.cvItem).toBeNull();
    expect(e.isDestroyed).toBe(true);
  });
});

describe("changing the kind of block", () => {
  it("keeps the id on the list item when typing '- '", () => {
    const e = make(p("a", "text") + p("b"));
    cursor(e, "text");
    type(e, "- ");
    expect(e.getHTML()).toContain(ul(li("a", "text")));
    expectValid(e);
  });

  it("keeps it when the paragraph is empty but for the dash", () => {
    const e = make(p("a", "x"));
    e.commands.setTextSelection({ from: 1, to: 2 });
    key(e, "Backspace");
    type(e, "- y");
    expect(pairs(e)).toEqual(["y:a"]);
    expectValid(e);
  });

  it.each(["toggleBulletList", "toggleOrderedList", "toggleBlockquote"] as const)("keeps ids through %s and back", (name) => {
    const e = make(p("a") + p("b"));
    cursor(e, "a", 1);
    e.commands[name]();
    expect(pairs(e)).toEqual(["a:a", "b:b"]);
    expectValid(e);
    e.commands[name]();
    expect(pairs(e)).toEqual(["a:a", "b:b"]);
    expectValid(e);
    expect(e.state.doc.firstChild!.type.name).toBe("paragraph");
  });

  it("keeps ids of several blocks made a list, heading or paragraph", () => {
    const e = make(p("a") + p("b"));
    e.commands.setTextSelection({ from: 1, to: 5 });
    e.commands.toggleBulletList();
    expect(pairs(e)).toEqual(["a:a", "b:b"]);
    e.commands.toggleOrderedList();
    expect(pairs(e)).toEqual(["a:a", "b:b"]);
    e.commands.toggleOrderedList();
    expect(pairs(e)).toEqual(["a:a", "b:b"]);
    e.commands.setTextSelection({ from: 1, to: 5 });
    e.commands.toggleHeading({ level: 3 });
    expect(pairs(e)).toEqual(["a:a", "b:b"]);
    e.commands.toggleBulletList();
    expect(pairs(e)).toEqual(["a:a", "b:b"]);
    expectValid(e);
  });

  it("keeps the id of a list item lifted from the middle of a list", () => {
    const e = make(ul(li("a"), li("b"), li("c")));
    cursor(e, "b");
    e.commands.liftListItem("listItem");
    expect(pairs(e)).toEqual(["a:a", "b:b", "c:c"]);
    expectValid(e);
  });

  it("drops the id of a nested item and gives one again when it's lifted", () => {
    const e = make(ul(li("a"), li("b")));
    cursor(e, "b");
    e.commands.sinkListItem("listItem");
    expect(every(e)).toEqual(["a"]);
    cursor(e, "b");
    e.commands.liftListItem("listItem");
    expect(ids(e)[0]).toBe("a");
    expect(ids(e)).toHaveLength(2);
    expectValid(e);
    e.commands.undo();
    expectValid(e);
  });

  it("keeps ids apart when a quote is split in two", () => {
    const e = make('<blockquote data-cv-item="q"><p>one</p><p>two</p><p>three</p></blockquote>');
    cursor(e, "two");
    e.commands.lift("blockquote");
    expect(ids(e)).toHaveLength(3);
    expect(ids(e)[0]).toBe("q");
    expectValid(e);
  });
});

it("keeps formatting chosen before typing", () => {
  const e = make(ul(li("a", "a", ul(li("n")))));
  cursor(e, "a", 1);
  e.view.dispatch(e.state.tr.insertText("x").addStoredMark(e.schema.marks.bold.create()));
  expect(e.state.storedMarks?.map((mark) => mark.type.name)).toEqual(["bold"]);
});

it("gives no id while text is being composed, then once it's done", () => {
  vi.useFakeTimers();
  try {
    const e = make(`${p("a")}<p></p>`);
    e.commands.setTextSelection(e.state.doc.content.size - 1);
    const composing = vi.spyOn(e.view, "composing", "get").mockReturnValue(true);
    e.view.dispatch(e.state.tr.insertText("n"));
    expect(every(e)).toEqual(["a"]);
    composing.mockReturnValue(false);
    e.view.dom.dispatchEvent(new Event("compositionend"));
    vi.advanceTimersByTime(100);
    expect(ids(e)).toHaveLength(2);
    expectValid(e);
    e.commands.undo();
    expect(every(e)).toEqual(["a"]);
  } finally {
    vi.useRealTimers();
  }
});
