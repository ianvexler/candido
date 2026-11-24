import { Editor } from "@tiptap/core";
import type { Editor as ReactEditor } from "@tiptap/react";
import { expect, it } from "vitest";
import { showHiddenInEditor } from "./hiddenText";
import { pageExtensions } from "./pageExtensions";

const item = (id: string, text: string) => `<li data-cv-item="${id}"><p>${text}</p></li>`;
const hidden = '<span data-cv-hidden="true">two</span>';

it("shows the hidden text of the items asked for, and undo hides it again", () => {
  const content = `<ul>${item("a", `One ${hidden}`)}${item("b", `Other ${hidden}`)}</ul><p data-cv-item="c">Last ${hidden}</p>`;
  const editor = new Editor({ extensions: pageExtensions, content });
  showHiddenInEditor(editor as ReactEditor, ["a", "c"]);
  expect(editor.getHTML()).toBe(
    `<ul>${item("a", "One two")}${item("b", `Other ${hidden}`)}</ul><p data-cv-item="c">Last two</p>`
  );
  editor.commands.undo();
  expect(editor.getHTML()).toBe(content);
  editor.destroy();
});
