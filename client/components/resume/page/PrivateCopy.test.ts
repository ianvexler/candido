import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { contentExtensions } from "../review/replaceInContent";
import HiddenGuard from "./HiddenGuard";
import PrivateCopy, { SLICE_TYPE } from "./PrivateCopy";

const H = (text: string) => `<span data-cv-hidden="true">${text}</span>`;
const editors: Editor[] = [];
const make = (content: string, extensions = [...contentExtensions, HiddenGuard, PrivateCopy]) => {
  const editor = new Editor({ extensions, content });
  editors.push(editor);
  return editor;
};
const html = (editor: Editor) => editor.getHTML().replace(/ data-cv-item="[^"]*"/g, "");

class Data {
  data: Record<string, string> = {};
  setData = (type: string, value: string) => void (this.data[type] = value);
  getData = (type: string) => this.data[type] ?? "";
  clearData = () => void (this.data = {});
}
const fire = (editor: Editor, type: "copy" | "cut" | "paste", clipboardData = new Data()) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clipboardData });
  editor.view.dom.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  return clipboardData;
};
const copyAll = (content: string, type: "copy" | "cut" = "copy") => {
  const editor = make(content);
  editor.commands.selectAll();
  return { editor, data: fire(editor, type) };
};

afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()));

const CONTENT = `<p data-cv-item="a">foo${H("secret")}bar</p><ul><li data-cv-item="b"><p>${H("all")}</p></li><li data-cv-item="c"><p>two<br>x</p></li></ul>`;

describe("copy", () => {
  it("puts hidden text in the private type only", () => {
    const { editor, data } = copyAll(CONTENT);
    expect(data.getData("text/plain")).toBe("foobar\n\ntwo\nx");
    expect(data.getData("text/html")).toContain("foobar");
    expect(data.getData("text/html")).not.toMatch(/secret|all|hidden/);
    expect(data.getData("text/html").match(/<li/g)).toHaveLength(1);
    expect(data.getData(SLICE_TYPE)).toContain(H("secret"));
    expect(editor.getHTML()).toBe(CONTENT);
  });

  it("puts part of a line", () => {
    const editor = make(`<p>foo${H("secret")}bar</p>`);
    editor.commands.setTextSelection({ from: 2, to: 12 });
    const data = fire(editor, "copy");
    expect(data.getData("text/plain")).toBe("ooba");
    expect(data.getData("text/html")).not.toContain("secret");
  });

  it("puts nothing of text that is all hidden", () => {
    const { data } = copyAll(`<p>${H("secret")}</p>`);
    expect(data.getData("text/plain")).toBe("");
    expect(data.getData("text/html")).not.toContain("secret");
  });

  it("leaves text without hidden text to the editor", () => {
    const { data } = copyAll("<p>one</p><p>two</p>");
    expect(Object.keys(data.data).sort()).toEqual(["text/html", "text/plain"]);
    expect(data.getData("text/plain")).toBe("one\n\ntwo");
  });
});

it("cut deletes the selection", () => {
  const { editor, data } = copyAll(CONTENT, "cut");
  expect(editor.getText()).toBe("");
  expect(data.getData("text/html")).not.toContain("secret");
  editor.commands.undo();
  expect(editor.getHTML()).toBe(CONTENT);
});

describe("paste", () => {
  it("brings hidden text along, with new ids", () => {
    const { data } = copyAll(CONTENT);
    const target = make("<p></p>");
    fire(target, "paste", data);
    expect(html(target)).toBe(CONTENT.replace(/ data-cv-item="[^"]*"/g, ""));
    expect(target.getHTML()).not.toMatch(/data-cv-item="[abc]"/);
  });

  it("moves part of a line within an editor", () => {
    const editor = make(`<p>foo${H("secret")}bar</p><p>end</p>`);
    editor.commands.setTextSelection({ from: 2, to: 12 });
    const data = fire(editor, "cut");
    expect(html(editor)).toBe("<p>fr</p><p>end</p>");
    editor.commands.setTextSelection(8);
    fire(editor, "paste", data);
    expect(html(editor)).toBe(`<p>fr</p><p>endoo${H("secret")}ba</p>`);
  });

  it("brings text that is all hidden", () => {
    const { data } = copyAll(`<p>${H("secret")}</p>`);
    const target = make("<p>x</p>");
    target.commands.setTextSelection(2);
    fire(target, "paste", data);
    expect(target.getHTML()).toContain(H("secret"));
  });

  it("uses a copy from elsewhere after one of ours", () => {
    const target = make("<p></p>");
    fire(target, "paste", copyAll(CONTENT).data);
    target.commands.setContent("<p></p>");
    const other = new Data();
    other.setData("text/html", "<p>other</p>");
    fire(target, "paste", other);
    expect(html(target)).toBe("<p>other</p>");
  });

  it("shows no hidden text elsewhere", () => {
    const { data } = copyAll(CONTENT);
    const target = make("<p></p>", contentExtensions);
    fire(target, "paste", data);
    expect(target.getText()).not.toMatch(/secret|all/);
    expect(target.getText()).toContain("foobar");
  });
});

it("leaves what is dragged whole", () => {
  const editor = make(CONTENT);
  editor.commands.selectAll();
  const { dom } = editor.view.serializeForClipboard(editor.state.selection.content());
  expect(dom.innerHTML).toContain(H("secret"));
});
