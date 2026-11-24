import { describe, expect, it } from "vitest";
import { offerableItem } from "./LeaveOutArea";

const item = (html: string, inner = "p") => {
  const root = document.createElement("div");
  root.innerHTML = html;
  return offerableItem(root.querySelector(inner));
};

describe("offerableItem", () => {
  it("finds the item something is in", () =>
    expect(item('<ul><li data-cv-item="a"><p>Text</p></li></ul>')?.getAttribute("data-cv-item")).toBe("a"));
  it.each(['<p data-cv-item="a"></p>', '<p data-cv-item="a"><br></p>', '<p data-cv-item="a"> &nbsp;</p>'])(
    "has none in a blank one: %s",
    (html) => expect(item(html)).toBeNull()
  );
  it("has none outside items", () => {
    expect(item("<p>Text</p>")).toBeNull();
    expect(offerableItem(null)).toBeNull();
  });
});
