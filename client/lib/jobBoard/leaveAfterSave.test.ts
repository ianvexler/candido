import { describe, expect, it, vi } from "vitest";
import { leaveAfterSave } from "./leaveAfterSave";

const setup = (over: Partial<Parameters<typeof leaveAfterSave>[0]> = {}) => {
  const o = { hasUnsavedEdits: false, inFlight: null as Promise<boolean> | null, editedSinceInFlight: () => false, save: vi.fn(async () => true), run: vi.fn(), onBlocked: vi.fn(), ...over };
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

  it("waits for an in-flight save and saves again only for later edits", async () => {
    const order: string[] = [];
    const inFlight = new Promise<boolean>((r) => setTimeout(() => { order.push("flight"); r(true); }, 5));
    const o = setup({ inFlight, editedSinceInFlight: () => true, save: vi.fn(async () => { order.push("save"); return true; }) });
    await leaveAfterSave(o);
    expect(order).toEqual(["flight", "save"]);
    expect(o.run).toHaveBeenCalled();
  });

  it("doesn't save again when the in-flight save sent everything", async () => {
    const o = setup({ hasUnsavedEdits: true, inFlight: Promise.resolve(true) });
    await leaveAfterSave(o);
    expect(o.save).not.toHaveBeenCalled();
    expect(o.run).toHaveBeenCalled();
  });

  it("saves again when the in-flight save failed", async () => {
    const o = setup({ hasUnsavedEdits: true, inFlight: Promise.resolve(false) });
    await leaveAfterSave(o);
    expect(o.save).toHaveBeenCalled();
    expect(o.run).toHaveBeenCalled();
  });

  it("runs nothing and reports blocked when the save fails", async () => {
    const o = setup({ hasUnsavedEdits: true, save: vi.fn(async () => false) });
    await leaveAfterSave(o);
    expect(o.run).not.toHaveBeenCalled();
    expect(o.onBlocked).toHaveBeenCalled();
  });
});
