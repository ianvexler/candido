import { Editor } from "@tiptap/core";
import type { Editor as ReactEditor } from "@tiptap/react";
import { expect, it } from "vitest";
import { byEntry, showHiddenInEditor } from "./hiddenText";
import { mergeMarks } from "./HiddenTextMarks";
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

it("takes what belongs to one entry together", () =>
  expect(
    byEntry([
      { sectionId: 1, entryId: "a", itemIds: ["x"] },
      { sectionId: 2, entryId: "a", itemIds: ["y"] },
      { sectionId: 1, entryId: "a", itemIds: ["z"] },
    ])
  ).toEqual([
    { sectionId: 1, entryId: "a", itemIds: ["x", "z"] },
    { sectionId: 2, entryId: "a", itemIds: ["y"] },
  ]));

it("merges marks that would overlap, but not across columns", () => {
  const place = (id: string) => ({ sectionId: 1, entryId: "a", itemIds: [id] });
  const mark = (id: string, top: number, side: "left" | "right" = "left") => ({ top, side, places: [place(id)] });
  expect(mergeMarks([mark("c", 110), mark("a", 100), mark("b", 105, "right"), mark("d", 130)])).toEqual([
    { top: 100, side: "left", places: [place("a"), place("c")] },
    { top: 105, side: "right", places: [place("b")] },
    { top: 130, side: "left", places: [place("d")] },
  ]);
});
