import { describe, expect, it } from "vitest";
import { sheetCvMenu } from "./sheetCvMenu";

const none = { cv_curriculum: null, cv_key: undefined, cv_text: undefined };
const copy = { id: 9, title: "Main – Acme", updated_at: "2026-11-22T00:00:00Z", fit: null };

describe("sheetCvMenu", () => {
  it("offers Upload when empty", () => {
    expect(sheetCvMenu(none).items.map((i) => i.action)).toEqual(["upload"]);
  });
  it("offers Download and Replace, unconfirmed, for a file", () => {
    const menu = sheetCvMenu({ ...none, cv_key: "k" });
    expect(menu.items.map((i) => i.action)).toEqual(["download", "replace"]);
    expect(menu.items.every((i) => !i.confirm)).toBe(true);
  });
  it("offers Open and a confirmed replace for a copy, titled by the copy", () => {
    const menu = sheetCvMenu({ ...none, cv_curriculum: copy, cv_key: "k" });
    expect(menu.heading).toBe("Main – Acme");
    expect(menu.items.map((i) => i.action)).toEqual(["open", "replace-with-file"]);
    expect(menu.items[1].confirm?.description).toBe(
      "The copy is deleted from your resumes, along with its review. Your original CV isn't changed.",
    );
    expect(menu.items[1].confirm?.destructive).toBe(true);
  });
  it("falls back to 'CV copy' without a title", () => {
    expect(sheetCvMenu({ ...none, cv_curriculum: { ...copy, title: "" } }).heading).toBe("CV copy");
  });
  it("confirms before replacing pasted text", () => {
    const menu = sheetCvMenu({ ...none, cv_text: "hello" });
    expect(menu.items.map((i) => i.action)).toEqual(["replace-with-file"]);
    expect(menu.items[0].confirm?.title).toBe("Replace the pasted CV?");
    expect(menu.items[0].confirm?.description).toBe("The current text is deleted.");
    expect(menu.items[0].confirm?.destructive).toBe(true);
  });
});
