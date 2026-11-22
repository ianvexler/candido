import { describe, expect, it, vi } from "vitest";
import { leaveAfterSave } from "./leaveAfterSave";

const setup = (over: Partial<Parameters<typeof leaveAfterSave>[0]> = {}) => {
  const o = { hasUnsavedEdits: false, inFlight: null, save: vi.fn(async () => true), run: vi.fn(), onBlocked: vi.fn(), ...over };
  return o;
};

describe("leaveAfterSave", () => {
  it("runs at once when nothing is unsaved", async () => {
    const o = setup();
    await leaveAfterSave(o);
    expect(o.save).not.toHaveBeenCalled();
    expect(o.run).toHaveBeenCalled();
  });

  it("saves then runs when there are edits", async () => {
    const o = setup({ hasUnsavedEdits: true });
    await leaveAfterSave(o);
    expect(o.save).toHaveBeenCalled();
    expect(o.run).toHaveBeenCalled();
    expect(o.onBlocked).not.toHaveBeenCalled();
  });

  it("waits for an in-flight save before saving again", async () => {
    const order: string[] = [];
    const inFlight = new Promise<void>((r) => setTimeout(() => { order.push("flight"); r(); }, 5));
    const o = setup({ inFlight, save: vi.fn(async () => { order.push("save"); return true; }) });
    await leaveAfterSave(o);
    expect(order).toEqual(["flight", "save"]);
    expect(o.run).toHaveBeenCalled();
  });

  it("runs nothing and reports blocked when the save fails", async () => {
    const o = setup({ hasUnsavedEdits: true, save: vi.fn(async () => false) });
    await leaveAfterSave(o);
    expect(o.run).not.toHaveBeenCalled();
    expect(o.onBlocked).toHaveBeenCalled();
  });
});
