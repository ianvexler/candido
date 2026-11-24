import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it } from "vitest";
import { contentExtensions } from "../review/replaceInContent";
import HiddenGuard from "./HiddenGuard";

let editor: Editor;

const H = (text: string) => `<span data-cv-hidden="true">${text}</span>`;
const make = (content: string) => (editor = new Editor({ extensions: [...contentExtensions, HiddenGuard], content }));
const html = () => editor.getHTML().replace(/ data-cv-item="[^"]*"/g, "");

/** Where the first such text starts. */
const at = (text: string) => {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text!.includes(text)) found = pos + node.text!.indexOf(text);
  });
  return found;
};
const caret = (pos: number) => editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)));
const type = (text: string) => editor.view.dispatch(editor.state.tr.insertText(text));
const remove = (from: number, to: number) => editor.view.dispatch(editor.state.tr.delete(from, to));
const press = (key: string) => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  editor.view.dom.dispatchEvent(event);
  return event.defaultPrevented;
};

afterEach(() => editor.destroy());

describe("a deletion with nothing selected", () => {
  it("keeps hidden text where it was, with the caret before it", () => {
    make(`<p>foo${H("secret")}bar</p>`);
    caret(at("bar"));
    remove(at("foo") + 2, at("bar"));
    expect(html()).toBe(`<p>fo${H("secret")}bar</p>`);
    expect(editor.state.selection.from).toBe(at("fo") + 2);

    remove(editor.state.selection.from - 1, editor.state.selection.from);
    type("x");
    expect(html()).toBe(`<p>fx${H("secret")}bar</p>`);
  });

  it("keeps it forwards too, and goes on past it", () => {
    make(`<p>foo${H("secret")}bar</p>`);
    caret(at("secret"));
    remove(at("secret"), at("bar") + 1);
    remove(at("secret"), at("ar") + 1);
    expect(html()).toBe(`<p>foo${H("secret")}r</p>`);
    expect(editor.state.selection.from).toBe(at("foo") + 3);
  });

  it("keeps its other marks and its order", () => {
    make(`<p>a${H("<strong>one</strong> two")}b${H("three")}c</p>`);
    const before = html();
    caret(at("c"));
    remove(at("a"), at("c"));
    expect(html()).toBe(before.replace("a<", "<").replace("</span>b<span data-cv-hidden=\"true\">", ""));
  });

  it("puts back part of it", () => {
    make(`<p>foo${H("secret")}bar</p>`);
    caret(at("bar"));
    remove(at("bar") - 2, at("bar"));
    expect(html()).toBe(`<p>foo${H("secret")}bar</p>`);
  });

  it("keeps it when all of the block's other text goes", () => {
    make(`<ul><li><p>${H("secret")}foo</p></li><li><p>bar</p></li></ul>`);
    caret(at("foo") + 3);
    remove(at("secret"), at("foo") + 3);
    expect(html()).toBe(`<ul><li><p>${H("secret")}</p></li><li><p>bar</p></li></ul>`);
    type("new");
    expect(html()).toBe(`<ul><li><p>new${H("secret")}</p></li><li><p>bar</p></li></ul>`);
  });

  it("keeps it when its block goes", () => {
    make(`<p>foo</p><p>${H("secret")}bar</p>`);
    caret(at("bar"));
    remove(at("foo") + 3, at("bar"));
    expect(html()).toBe(`<p>foo${H("secret")}bar</p>`);
  });

  it("leaves it alone when a block beside it goes", () => {
    make(`<p>${H("one")}a</p><p>b</p><p>c${H("two")}</p>`);
    caret(at("b"));
    remove(at("b") - 1, at("b") + 2);
    expect(html()).toBe(`<p>${H("one")}a</p><p>c${H("two")}</p>`);
  });

  it("keeps the item's id", () => {
    make(`<ul><li data-cv-item="x"><p>${H("secret")}foo</p></li></ul>`);
    caret(at("foo") + 3);
    remove(at("secret"), at("foo") + 3);
    expect(editor.getHTML()).toBe(`<ul><li data-cv-item="x"><p>${H("secret")}</p></li></ul>`);
  });

  it("keeps it on both sides of two items joined", () => {
    make(`<ul><li><p>a${H("one")}</p></li><li><p>${H("two")}b</p></li></ul>`);
    caret(at("b"));
    expect(press("Backspace")).toBe(true);
    expect(html()).toBe(`<ul><li><p>a${H("onetwo")}b</p></li></ul>`);
  });

  it("joins the next block from beside hidden text at the end", () => {
    make(`<p>a${H("one")}</p><p>${H("two")}b</p>`);
    caret(at("one"));
    expect(press("Delete")).toBe(true);
    expect(html()).toBe(`<p>a${H("onetwo")}b</p>`);
  });
});

describe("hidden text that is moved, or kept beside other that isn't", () => {
  it.each([
    ["a list above", `<ul><li><p>one</p></li></ul><p>a${H("secret")}b</p>`, "a"],
    ["a nested list above", `<ul><li><p>one</p><ul><li><p>in</p></li></ul></li></ul><p>a${H("secret")}b</p>`, "a"],
    ["a list above, at the start", `<ul><li><p>one</p></li></ul><p>${H("secret")}b</p>`, "b"],
    ["two runs", `<ul><li><p>one</p></li></ul><p>a${H("X")}b${H("X")}c</p>`, "a"],
  ])("isn't copied by joining %s", (_, content, text) => {
    make(content);
    caret(at(text));
    const before = editor.state.doc.textContent;
    press("Backspace");
    expect(editor.state.doc.textContent).toBe(before);
    press("Backspace");
    expect(editor.state.doc.textContent).toBe(before);
  });

  const replaced = (content: string, from: string, to: string, withText: string, kept: string) => {
    make(content);
    caret(at(from));
    const nodes = [editor.schema.text(withText), editor.schema.text(kept, [editor.schema.marks.hidden.create()])];
    editor.view.dispatch(editor.state.tr.replaceWith(at(from), at(to), nodes));
    return html();
  };

  it("keeps the one that a replacement dropped", () => {
    expect(replaced(`<p>a${H("H1")}b${H("H2")}c</p>`, "a", "c", "z", "H2")).toBe(`<p>z${H("H1H2")}c</p>`);
  });

  it("keeps both of two that are the same", () => {
    expect(replaced(`<p>a${H("X")}b${H("X")}c</p>`, "a", "c", "z", "X")).toBe(`<p>z${H("XX")}c</p>`);
  });

  it("isn't mistaken for part of another", () => {
    expect(replaced(`<p>a${H("cat")}b${H("a")}d</p>`, "a", "d", "z", "cat")).toBe(`<p>z${H("cata")}d</p>`);
  });

  it("keeps what is beside a selection", () => {
    make(`<p>foo${H("secret")}bar${H("end")}</p>`);
    editor.commands.setTextSelection({ from: at("foo") + 1, to: at("foo") + 3 });
    remove(at("foo") + 1, at("bar") + 1);
    expect(html()).toBe(`<p>f${H("secret")}ar${H("end")}</p>`);
  });

  it("lets a line break be put over a selection", () => {
    make(`<p>foo${H("secret")}</p>`);
    editor.commands.setTextSelection({ from: at("foo"), to: at("foo") + 2 });
    editor.commands.setHardBreak();
    expect(html()).toBe(`<p><br>o${H("secret")}</p>`);
  });
});

describe("formatting", () => {
  it("doesn't reveal hidden text as code", () => {
    make(`<p>foo${H("secret")}bar</p>`);
    editor.commands.selectAll();
    editor.commands.toggleCode();
    editor.commands.setCodeBlock();
    expect(html()).toBe(`<p>foo${H("secret")}bar</p>`);
  });

  it("undoes hiding together with typing", () => {
    make("<p>foo bar</p>");
    editor.commands.insertContentAt(8, "x");
    editor.commands.setTextSelection({ from: 5, to: 8 });
    editor.commands.setHidden();
    expect(html()).toBe(`<p>foo ${H("bar")}x</p>`);
    while (editor.can().undo()) editor.commands.undo();
    expect(html()).toBe("<p>foo bar</p>");
  });
});

describe("text replaced with nothing selected", () => {
  it("goes before hidden text that was after the caret", () => {
    make(`<p>foo${H("secret")}bar</p>`);
    caret(at("foo") + 1);
    editor.view.dispatch(editor.state.tr.insertText("food bar", at("foo"), at("bar") + 3));
    expect(html()).toBe(`<p>food bar${H("secret")}</p>`);
    expect(editor.state.selection.from).toBe(at("food bar") + 8);
  });

  it("goes after hidden text that was before the caret", () => {
    make(`<p>${H("secret")}teh</p>`);
    caret(at("teh") + 3);
    editor.view.dispatch(editor.state.tr.insertText("the", at("secret"), at("teh") + 3));
    expect(html()).toBe(`<p>${H("secret")}the</p>`);
    expect(editor.state.selection.from).toBe(at("the") + 3);
  });

  it("keeps what was kept as part of the replacement", () => {
    make(`<p>teh${H("secret")}bar</p>`);
    caret(at("bar"));
    const { schema } = editor;
    const hidden = schema.text("secret", [schema.marks.hidden.create()]);
    editor.view.dispatch(editor.state.tr.replaceWith(at("teh"), at("bar"), [schema.text("the"), hidden]));
    expect(html()).toBe(`<p>the${H("secret")}bar</p>`);
  });
});

it("keeps hidden text that an input method selects to replace", () => {
  make(`<p>foo${H("secret")}bar</p>`);
  caret(at("bar") + 1);
  editor.view.dom.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  editor.commands.setTextSelection({ from: at("foo") + 2, to: at("bar") + 1 });
  type("X");
  expect(html()).toBe(`<p>foX${H("secret")}ar</p>`);
});

it("takes hidden text selected before composing", () => {
  make(`<p>foo${H("secret")}bar</p>`);
  editor.commands.setTextSelection({ from: at("foo") + 2, to: at("bar") + 1 });
  editor.view.dom.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  type("X");
  expect(html()).toBe("<p>foXar</p>");
});

describe("a stray line break", () => {
  const withBreak = (from: number, to: number) =>
    editor.view.dispatch(editor.state.tr.replaceWith(from, to, editor.schema.nodes.hardBreak.create()));

  it("isn't left in place of deleted text", () => {
    make(`<p>foo${H("secret")}</p>`);
    caret(at("foo") + 3);
    withBreak(at("foo"), at("foo") + 3);
    expect(html()).toBe(`<p>${H("secret")}</p>`);
  });

  it("isn't left where hidden text went too", () => {
    make(`<p>foo${H("secret")}</p>`);
    caret(at("secret") + 6);
    withBreak(at("foo"), at("secret") + 6);
    expect(html()).toBe(`<p>${H("secret")}</p>`);
  });

  it("stays if it was typed", () => {
    make(`<p>foo${H("secret")}</p>`);
    caret(at("secret"));
    editor.commands.setHardBreak();
    expect(html()).toBe(`<p>foo<br>${H("secret")}</p>`);
  });
});

describe("what isn't kept", () => {
  it("takes hidden text that was selected", () => {
    make(`<p>foo${H("secret")}bar</p>`);
    editor.commands.setTextSelection({ from: at("foo") + 1, to: at("bar") + 1 });
    editor.commands.deleteSelection();
    expect(html()).toBe("<p>far</p>");
    editor.commands.undo();
    expect(html()).toBe(`<p>foo${H("secret")}bar</p>`);
    editor.commands.redo();
    expect(html()).toBe("<p>far</p>");
  });

  it("lets content be set", () => {
    make(`<p>foo${H("secret")}</p>`);
    editor.commands.setContent("<p>new</p>");
    expect(html()).toBe("<p>new</p>");
  });

  it("shows hidden text without copying it", () => {
    make(`<p>foo${H("secret")}bar</p>`);
    editor.commands.setTextSelection(at("foo"));
    editor.commands.command(({ tr, state }) => {
      tr.removeMark(0, state.doc.content.size, state.schema.marks.hidden);
      return true;
    });
    expect(html()).toBe("<p>foosecretbar</p>");
    editor.commands.undo();
    editor.commands.setTextSelection({ from: at("secret"), to: at("secret") + 6 });
    editor.commands.unsetHidden();
    expect(html()).toBe("<p>foosecretbar</p>");
    editor.commands.setTextSelection({ from: at("secret"), to: at("secret") + 6 });
    editor.commands.setHidden();
    expect(html()).toBe(`<p>foo${H("secret")}bar</p>`);
  });
});

describe("undo", () => {
  it("undoes a kept deletion in one step, exactly", () => {
    make(`<p>foo${H("secret")}bar</p>`);
    caret(at("bar"));
    remove(at("foo") + 2, at("bar"));
    const after = editor.state.doc;
    editor.commands.undo();
    expect(html()).toBe(`<p>foo${H("secret")}bar</p>`);
    expect(editor.state.selection.from).toBe(at("bar"));
    expect(editor.can().undo()).toBe(false);
    editor.commands.redo();
    expect(editor.state.doc.eq(after)).toBe(true);
  });

  it("undoes a lost item with its hidden text", () => {
    make(`<p>foo</p><p>${H("secret")}bar</p>`);
    caret(at("bar"));
    remove(at("foo") + 3, at("bar"));
    editor.commands.undo();
    expect(html()).toBe(`<p>foo</p><p>${H("secret")}bar</p>`);
  });
});

it("doesn't hide what is typed on either side", () => {
  make(`<p>foo${H("secret")}bar</p>`);
  caret(at("secret"));
  type("1");
  caret(at("bar"));
  type("2");
  expect(html()).toBe(`<p>foo1${H("secret")}2bar</p>`);
});

it("survives any deletion with all hidden text, and undoes it exactly", () => {
  const content = `<p data-cv-item="a">ab${H("H1")}c${H("H2")}</p><ul><li data-cv-item="b"><p>${H("H3")}</p></li><li data-cv-item="c"><p>d${H("H4")}e</p><ul><li><p>f${H("H5")}</p></li></ul></li></ul><blockquote data-cv-item="d"><p>${H("H6")}g</p></blockquote>`;
  make(content);
  const before = editor.state.doc;
  const size = before.content.size;
  for (let from = 1; from < size; from++) {
    for (let to = from + 1; to <= size; to++) {
      remove(from, to);
      const left = editor.state.doc.textContent;
      for (let n = 1; n <= 6; n++) expect(left.split(`H${n}`).length, `${from}-${to}: ${left}`).toBe(2);
      editor.commands.undo();
      expect(editor.state.doc.eq(before), `${from}-${to} undone`).toBe(true);
    }
  }
});
