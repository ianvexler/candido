import { describe, expect, it } from "vitest";
import { chosenFilter, parseFilter, serialise } from "./PurposeList";

const labels = [
  { id: 3, name: "Data" },
  { id: 7, name: "Teaching" },
];

describe("the stored purpose", () => {
  it("round-trips each kind", () => {
    for (const filter of [{ kind: "all" }, { kind: "none" }, { kind: "label", id: 7 }] as const) {
      expect(parseFilter(serialise(filter))).toEqual(filter);
    }
  });

  it("is All content when missing or not understood", () => {
    expect(parseFilter(null)).toEqual({ kind: "all" });
    expect(parseFilter("")).toEqual({ kind: "all" });
    expect(parseFilter("folder")).toEqual({ kind: "all" });
    expect(parseFilter("-2")).toEqual({ kind: "all" });
    expect(parseFilter("1.5")).toEqual({ kind: "all" });
  });

  it("falls back to All content when its label no longer exists", () => {
    expect(chosenFilter({ kind: "label", id: 9 }, labels, true)).toEqual({ kind: "all" });
    expect(chosenFilter({ kind: "label", id: 7 }, labels, true)).toEqual({ kind: "label", id: 7 });
    expect(chosenFilter({ kind: "none" }, [], true)).toEqual({ kind: "none" });
  });

  it("is kept until the labels are known", () => {
    expect(chosenFilter({ kind: "label", id: 9 }, [], false)).toEqual({ kind: "label", id: 9 });
  });
});
