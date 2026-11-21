import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";
import { SuggestionHighlight, replaceQuote, suggestionRanges } from "./SuggestionHighlight";

let editor: Editor | null = null;

const makeEditor = (content: string) => {
  editor = new Editor({ extensions: [StarterKit, SuggestionHighlight], content });
  return editor;
};

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe("suggestionRanges", () => {
  it("maps a quote to its range in a bullet", () => {
    const e = makeEditor("<ul><li>Built APIs</li></ul>");
    const range = suggestionRanges(e.state.doc, [{ id: 1, quote: "APIs" }]).get(1);
    expect(range).not.toBeNull();
    expect(e.state.doc.textBetween(range!.from, range!.to)).toBe("APIs");
  });

  it("returns null for a quote no longer present", () => {
    const e = makeEditor("<p>Built APIs</p>");
    expect(suggestionRanges(e.state.doc, [{ id: 1, quote: "Led teams" }]).get(1)).toBeNull();
  });

  it("finds a quote in a later block, whitespace-insensitive", () => {
    const e = makeEditor("<p>First line</p><ul><li><p>Shipped the app</p></li></ul>");
    const range = suggestionRanges(e.state.doc, [{ id: 2, quote: "the \n app" }]).get(2);
    expect(e.state.doc.textBetween(range!.from, range!.to)).toBe("the app");
  });

  it("does not match across a hard break", () => {
    const e = makeEditor("<p>Built<br>APIs</p>");
    expect(suggestionRanges(e.state.doc, [{ id: 1, quote: "BuiltAPIs" }]).get(1)).toBeNull();
    const after = suggestionRanges(e.state.doc, [{ id: 2, quote: "APIs" }]).get(2);
    expect(e.state.doc.textBetween(after!.from, after!.to)).toBe("APIs");
  });

  it("maps across marks within a block", () => {
    const e = makeEditor("<p>Built <strong>fast</strong> APIs</p>");
    const range = suggestionRanges(e.state.doc, [{ id: 1, quote: "fast APIs" }]).get(1);
    expect(e.state.doc.textBetween(range!.from, range!.to)).toBe("fast APIs");
  });
});

describe("replaceQuote", () => {
  it("inserting a replacement with HTML keeps it as text", () => {
    const e = makeEditor("<p>Built APIs</p>");
    expect(replaceQuote(e, "APIs", "<b>x</b>")).toBe(true);
    expect(e.getHTML()).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("keeps bold on replaced text", () => {
    const e = makeEditor("<p><strong>Built APIs</strong></p>");
    replaceQuote(e, "APIs", "services");
    expect(e.getHTML()).toBe("<p><strong>Built services</strong></p>");
  });

  it("returns false and leaves the text when the quote is gone", () => {
    const e = makeEditor("<p>Built APIs</p>");
    expect(replaceQuote(e, "Led teams", "x")).toBe(false);
    expect(e.getHTML()).toBe("<p>Built APIs</p>");
  });
});

describe("SuggestionHighlight", () => {
  it("decorates the quote without changing the content", () => {
    const e = makeEditor("<p>Built APIs</p>");
    const before = e.getHTML();
    e.commands.setSuggestions([{ id: 7, quote: "APIs" }], 7);
    const span = e.view.dom.querySelector('[data-suggestion-id="7"]');
    expect(span?.textContent).toBe("APIs");
    expect(span?.classList.contains("cv-suggestion")).toBe(true);
    expect(span?.classList.contains("cv-suggestion-active")).toBe(true);
    expect(e.getHTML()).toBe(before);
  });

  it("drops the highlight once the quote is edited away", () => {
    const e = makeEditor("<p>Built APIs</p>");
    e.commands.setSuggestions([{ id: 7, quote: "APIs" }], null);
    e.commands.setContent("<p>Built services</p>");
    expect(e.view.dom.querySelector("[data-suggestion-id]")).toBeNull();
  });
});
