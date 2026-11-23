import { describe, expect, it } from "vitest";
import type { CvSuggestion } from "@/lib/types";
import { apiErrorMessage, isConflict, progressStep, reviewGroups, sectionLabel, statusForAction, stillMissing } from "./reviewPanel";

const suggestion = (id: number, overrides: Partial<CvSuggestion> = {}): CvSuggestion => ({
  id,
  curriculum_section_id: 1,
  kind: "rewrite",
  field: "content",
  quote: "Built APIs",
  replacement: "Built APIs serving 2M requests/day",
  reason: "Name the scale.",
  status: "pending",
  position: id,
  ...overrides,
});

describe("sectionLabel", () => {
  it("joins type and title", () => {
    expect(sectionLabel({ section_type: "Experience", title: "Acme" })).toBe("Experience · Acme");
  });

  it("uses the type alone when the title is empty or repeats it", () => {
    expect(sectionLabel({ section_type: "Skills", title: "  " })).toBe("Skills");
    expect(sectionLabel({ section_type: "Skills", title: "skills" })).toBe("Skills");
  });

  it("falls back when the section is unknown", () => {
    expect(sectionLabel(undefined)).toBe("Section");
  });
});

describe("progressStep", () => {
  it("rotates through the steps and stays on the last", () => {
    expect(progressStep(0)).toBe("Reading the posting…");
    expect(progressStep(1)).toBe("Comparing with your CV…");
    expect(progressStep(2)).toBe("Writing suggestions…");
    expect(progressStep(9)).toBe("Writing suggestions…");
  });
});

describe("statusForAction", () => {
  it("maps card actions to saved statuses", () => {
    expect(statusForAction("accept")).toBe("accepted");
    expect(statusForAction("edit")).toBe("edited");
    expect(statusForAction("reject")).toBe("rejected");
  });
});

describe("reviewGroups", () => {
  it("splits open, stale and done, and counts what's left", () => {
    const list = [
      suggestion(3, { status: "accepted" }),
      suggestion(2),
      suggestion(1),
      suggestion(4, { status: "rejected" }),
    ];
    const groups = reviewGroups(list, new Set([2]), new Set([1]));
    expect(groups.open.map((s) => s.id)).toEqual([1]);
    expect(groups.stale.map((s) => s.id)).toEqual([2]);
    expect(groups.done.map((s) => s.id)).toEqual([3, 4]);
    expect(groups.left).toBe(2);
  });

  it("leaves out suggestions for removed sections", () => {
    const groups = reviewGroups([suggestion(1, { curriculum_section_id: 9 })], new Set(), new Set([1]));
    expect(groups.open).toEqual([]);
    expect(groups.left).toBe(0);
  });
});

describe("apiErrorMessage", () => {
  it("reads the API's error message", () => {
    expect(apiErrorMessage({ response: { data: { error: "Daily limit reached" } } }, "x")).toBe("Daily limit reached");
  });

  it("falls back when there is none", () => {
    expect(apiErrorMessage(new Error("Network"), "Try again")).toBe("Try again");
    expect(apiErrorMessage({ response: { data: { error: "" } } }, "Try again")).toBe("Try again");
  });
});

describe("isConflict", () => {
  it("is true only for a 409 response", () => {
    expect(isConflict({ response: { status: 409 } })).toBe(true);
    expect(isConflict({ response: { status: 422 } })).toBe(false);
    expect(isConflict(new Error("network"))).toBe(false);
    expect(isConflict(undefined)).toBe(false);
  });
});

describe("stillMissing", () => {
  const report = {
    missing_sections: [
      { section: "Education" as const, reason: "Add your degree" },
      { section: "Skills" as const, reason: "List your tools" },
    ],
  };

  it("keeps sections the CV has none of", () => {
    expect(stillMissing(report, [{ section_type: "Experience", title: "Acme" }]).map((m) => m.section)).toEqual([
      "Education",
      "Skills",
    ]);
  });
  it("drops one once a section of that kind exists, by type or title", () => {
    expect(stillMissing(report, [{ section_type: "Education", title: "Education" }]).map((m) => m.section)).toEqual(["Skills"]);
    expect(stillMissing(report, [{ section_type: "custom", title: "Technical skills" }]).map((m) => m.section)).toEqual([
      "Education",
    ]);
  });
  it("is empty for reviews from before missing sections existed", () => {
    expect(stillMissing({}, [])).toEqual([]);
    expect(stillMissing(null, [])).toEqual([]);
  });
});
