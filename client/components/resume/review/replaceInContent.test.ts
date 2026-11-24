import { describe, expect, it } from "vitest";
import { replaceInContent } from "./replaceInContent";

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
