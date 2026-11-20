import { describe, expect, it } from "vitest";
import { formatDateRange, fromMonthInput } from "./sectionDetails";

const details = (overrides: Partial<Parameters<typeof formatDateRange>[0]>) => ({
  role: null,
  organization: null,
  location: null,
  start_date: null,
  end_date: null,
  current: false,
  ...overrides,
});

describe("formatDateRange", () => {
  it("shows Present for a current entry", () => {
    expect(formatDateRange(details({ start_date: "2022-03-01", current: true }))).toBe("Mar 2022 – Present");
  });

  it("shows both months for a finished entry", () => {
    expect(formatDateRange(details({ start_date: "2022-03-01", end_date: "2024-01-01" }))).toBe("Mar 2022 – Jan 2024");
  });

  it("shows one month when start and end match", () => {
    expect(formatDateRange(details({ start_date: "2022-03-01", end_date: "2022-03-01" }))).toBe("Mar 2022");
  });

  it("is empty without dates", () => {
    expect(formatDateRange(details({}))).toBe("");
  });
});

describe("fromMonthInput", () => {
  it("turns a month into the first of that month", () => {
    expect(fromMonthInput("2022-03")).toBe("2022-03-01");
  });

  it("is null for an empty value", () => {
    expect(fromMonthInput("")).toBeNull();
  });
});
