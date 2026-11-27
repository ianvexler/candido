import { describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { pageExtensions } from "../page/pageExtensions";
import { contentExtensions, replaceInContent } from "./replaceInContent";

const x = '<li data-cv-item="x"><p>Led</p></li>';

describe("replaceInContent", () => {
  it("replaces the text of an unticked item, which stays unticked", () =>
    expect(
      replaceInContent(`<ul>${x}<li data-cv-item="y" data-cv-off="true"><p>Built <strong>APIs fast</strong></p></li></ul>`, "APIs", "REST <APIs>")
    ).toBe(`<ul>${x}<li data-cv-item="y" data-cv-off="true"><p>Built <strong>REST &lt;APIs&gt; fast</strong></p></li></ul>`));

  it("takes a ticked item first", () =>
    expect(
      replaceInContent('<p data-cv-item="x" data-cv-off="true">Same</p><p data-cv-item="y">Same</p>', "Same", "New")
    ).toBe('<p data-cv-item="x" data-cv-off="true">Same</p><p data-cv-item="y">New</p>'));

  it("is null for text that is gone or hidden", () => {
    expect(replaceInContent(`<ul>${x}</ul>`, "Gone", "New")).toBeNull();
    expect(replaceInContent('<p data-cv-item="x"><span data-cv-hidden="true">Led</span></p>', "Led", "New")).toBeNull();
  });
});

it.each([
  ["cards", contentExtensions],
  ["the page", pageExtensions],
])("doesn't open a link pressed while editing on %s", (_, extensions) => {
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  const editor = new Editor({ extensions, content: '<p><a href="https://example.com">Link</a></p>' });
  const target = editor.view.dom.querySelector("a")!;
  const press = new MouseEvent("click", { button: 0 });
  Object.defineProperty(press, "target", { value: target });
  editor.view.someProp("handleClick", (handle) => void handle(editor.view, 2, press));
  expect(open).not.toHaveBeenCalled();
  editor.destroy();
});
