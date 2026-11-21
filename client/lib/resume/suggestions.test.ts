import { describe, expect, it } from "vitest";
import type { CvSuggestion, CvTailoring } from "@/lib/types";
import { findQuote, isTailoringActive, splitSuggestions, openSuggestionId } from "./suggestions";

describe("findQuote", () => {
  it("finds an exact quote", () => expect(findQuote("Built APIs for tools", "APIs")).toEqual({ from: 6, to: 10 }));
  it("matches across irregular whitespace", () =>
    expect(findQuote("Built  APIs", "Built APIs")).toEqual({ from: 0, to: 11 }));
  it("matches non-breaking spaces in either side", () => {
    expect(findQuote("Built APIs", "Built APIs")).toEqual({ from: 0, to: 10 });
    expect(findQuote("Built APIs", "Built APIs")).toEqual({ from: 0, to: 10 });
  });
  it("returns the first of two matches", () => expect(findQuote("Go and Go", "Go")).toEqual({ from: 0, to: 2 }));
  it("returns null when the text changed", () => expect(findQuote("Built services", "Built APIs")).toBeNull());
  it("returns null for a blank quote", () => expect(findQuote("abc", "  ")).toBeNull());
  it("ignores surrounding whitespace in the quote", () =>
    expect(findQuote("a Built APIs b", " Built APIs ")).toEqual({ from: 2, to: 12 }));
  it("treats regex characters literally", () => expect(findQuote("a (b) c", "(b)")).toEqual({ from: 2, to: 5 }));
});

const suggestion = (id: number, position: number, status: CvSuggestion["status"]): CvSuggestion => ({
  id,
  curriculum_section_id: 1,
  kind: "rewrite",
  field: "content",
  quote: `q${id}`,
  replacement: "r",
  reason: "because",
  status,
  position,
});

describe("splitSuggestions", () => {
  it("separates open, stale and done, ordered by position", () => {
    const all = [
      suggestion(1, 4, "pending"),
      suggestion(2, 1, "accepted"),
      suggestion(3, 3, "pending"),
      suggestion(4, 2, "rejected"),
      suggestion(5, 0, "pending"),
    ];
    const result = splitSuggestions(all, (s) => s.id === 3);
    expect(result.open.map((s) => s.id)).toEqual([5, 1]);
    expect(result.stale.map((s) => s.id)).toEqual([3]);
    expect(result.done.map((s) => s.id)).toEqual([2, 4]);
  });

  it("does not run the stale check on done suggestions", () => {
    const result = splitSuggestions([suggestion(1, 0, "edited")], () => true);
    expect(result.done).toHaveLength(1);
    expect(result.stale).toHaveLength(0);
  });
});

describe("isTailoringActive", () => {
  const base = { status: "pending" } as CvTailoring;
  it("is false for null", () => expect(isTailoringActive(null)).toBe(false));
  it("is true while pending or processing", () => {
    expect(isTailoringActive({ ...base, status: "pending" })).toBe(true);
    expect(isTailoringActive({ ...base, status: "processing" })).toBe(true);
  });
  it("is false once finished", () => {
    expect(isTailoringActive({ ...base, status: "succeeded" })).toBe(false);
    expect(isTailoringActive({ ...base, status: "failed" })).toBe(false);
  });
});

describe("openSuggestionId", () => {
  const all = (id: number) => [5, 7].includes(id);

  it("follows the parent's id when it controls the card", () => {
    expect(openSuggestionId(5, 7, all)).toBe(5);
    expect(openSuggestionId(null, 7, all)).toBeNull();
  });

  it("reopens a card the parent closed and selects again", () => {
    // 5 opens, closing sets null, selecting 5 again opens it.
    expect(openSuggestionId(5, null, all)).toBe(5);
    expect(openSuggestionId(null, null, all)).toBeNull();
    expect(openSuggestionId(5, null, all)).toBe(5);
    // 5 → 7 → 5
    expect(openSuggestionId(7, null, all)).toBe(7);
    expect(openSuggestionId(5, null, all)).toBe(5);
  });

  it("falls back to the local id when nothing controls it", () => {
    expect(openSuggestionId(undefined, 7, all)).toBe(7);
    expect(openSuggestionId(undefined, null, all)).toBeNull();
  });

  it("opens nothing for an id that isn't openable (another section, stale, resolved)", () => {
    expect(openSuggestionId(9, null, all)).toBeNull();
    expect(openSuggestionId(undefined, 9, all)).toBeNull();
  });
});
