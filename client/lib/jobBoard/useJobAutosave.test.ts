import { JobBoardEntry, JobStatus } from "@/lib/types";
import { act, createElement, useLayoutEffect } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitForSaves } from "@/lib/resume/saveTracker";
import { jobFieldsOf, JobFieldValues } from "./jobFields";
import { JobAutosave, useJobAutosave } from "./useJobAutosave";

const api = vi.hoisted(() => ({ update: vi.fn(), remove: vi.fn() }));
vi.mock("@/api/resources/jobBoardEntries/updateJobBoardEntry", () => ({ updateJobBoardEntry: api.update }));
vi.mock("@/api/resources/jobBoardEntries/deleteJobBoardEntry", () => ({ deleteJobBoardEntry: api.remove }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const job = {
  id: 7, number: 2, title: "Designer", company: "Fernway", location: "", salary: "", url: "", description: "",
  status: JobStatus.PENDING, job_board_tags: [],
} as unknown as JobBoardEntry;

const setField = vi.fn();
let root: Root;
let form: JobAutosave;
let fields: JobFieldValues;

const Harness = ({ values }: { values: JobFieldValues }) => {
  const current = useJobAutosave({
    entry: job, allEntries: [{ ...job, id: 8, number: 5, status: JobStatus.APPLIED }], fields: values,
    setField, reset: () => {}, onPatchJob: () => {},
  });
  useLayoutEffect(() => {
    form = current;
  });
  return null;
};

const render = (changes: Partial<JobFieldValues> = {}) => {
  fields = { ...fields, ...changes };
  return act(async () => root.render(createElement(Harness, { values: fields })));
};
const titles = () => api.update.mock.calls.map((call) => call[1]);
const deferred = () => {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve: () => resolve({ job_board_entry: job }) };
};

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  api.update.mockReset().mockResolvedValue({ job_board_entry: job });
  setField.mockReset();
  api.remove.mockReset().mockResolvedValue({});
  fields = jobFieldsOf(job);
  root = createRoot(document.createElement("div"));
  await render();
});
afterEach(() => vi.useRealTimers());

const unmount = () => act(async () => root.unmount());

describe("useJobAutosave", () => {
  it("saves after a pause, once, and not without edits", async () => {
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(api.update).not.toHaveBeenCalled();

    await render({ title: "Lead" });
    await render({ title: "Lead designer" });
    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(titles()).toEqual(["Lead designer"]);
  });

  it("saves what was typed when the form goes away, and nothing otherwise", async () => {
    await render({ title: "Lead" });
    await unmount();
    expect(titles()).toEqual(["Lead"]);
  });

  it("saves nothing when an unedited form goes away", async () => {
    await unmount();
    expect(api.update).not.toHaveBeenCalled();
  });

  it("waits for the save in flight before sending a newer one", async () => {
    const first = deferred();
    api.update.mockReturnValueOnce(first.promise);
    await render({ title: "One" });
    await act(async () => vi.advanceTimersByTimeAsync(600));
    await render({ title: "Two" });
    await unmount();
    expect(titles()).toEqual(["One"]);

    let idle = false;
    void waitForSaves(60_000).then((done) => (idle = done));
    await act(async () => first.resolve());
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(titles()).toEqual(["One", "Two"]);
    expect(idle).toBe(true);
  });

  it("leaves only after saving, and asks when it can't", async () => {
    const go = vi.fn();
    await render({ title: "Lead" });
    await act(async () => form.beforeLeave(go));
    expect(titles()).toEqual(["Lead"]);
    expect(go).toHaveBeenCalledOnce();

    await render({ title: " " });
    await act(async () => form.beforeLeave(go));
    expect(form.isLeaveBlocked).toBe(true);
    expect(form.incomplete).toBe(true);
    expect(go).toHaveBeenCalledOnce();

    await act(async () => form.discardAndLeave());
    expect(go).toHaveBeenCalledTimes(2);
  });

  it("says a title and company are needed instead of saving without them", async () => {
    await render({ company: "" });
    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(api.update).not.toHaveBeenCalled();
    expect(form.status).toBe("incomplete");

    await render({ company: "Fernway" });
    expect(form.status).not.toBe("incomplete");
  });

  it("doesn't save what was discarded", async () => {
    await render({ title: " " });
    await act(async () => form.beforeLeave(() => root.unmount()));
    api.update.mockClear();
    await act(async () => form.discardAndLeave());
    expect(api.update).not.toHaveBeenCalled();
  });

  it("still saves later edits after a discard that stayed on the page", async () => {
    await render({ title: " " });
    await act(async () => form.beforeLeave(() => {}));
    await act(async () => {
      form.discardAndLeave();
      form.keepEditing();
    });
    await render({ title: "Later" });
    await unmount();
    expect(titles()).toEqual(["Later"]);
  });

  it("doesn't retry the same failed save by itself", async () => {
    api.update.mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await render({ title: "Lead" });
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(api.update).toHaveBeenCalledOnce();
    expect(form.status).toBe("failed");
  });

  it("moves to the end of the column with unsaved edits, then leaves without saving again", async () => {
    await render({ title: "Lead" });
    await act(async () => form.moveTo(JobStatus.APPLIED, () => root.unmount()));
    expect(api.update).toHaveBeenCalledOnce();
    expect(api.update.mock.calls[0].slice(0, 2)).toEqual([7, "Lead"]);
    expect(api.update.mock.calls[0].slice(7, 9)).toEqual([JobStatus.APPLIED, 6]);
  });

  it("keeps a move when the form goes away before it's saved", async () => {
    const move = deferred();
    api.update.mockReturnValueOnce(move.promise);
    await act(async () => void form.moveTo(JobStatus.ARCHIVED, () => {}));
    expect(setField).toHaveBeenCalledWith("status", JobStatus.ARCHIVED);
    await render({ status: JobStatus.ARCHIVED });
    await unmount();
    await act(async () => move.resolve());
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(api.update).toHaveBeenCalledOnce();
  });

  it("doesn't send a saved edit again when leaving before the saved job shows", async () => {
    await render({ title: "Lead" });
    await act(async () => form.beforeLeave(() => root.unmount()));
    expect(titles()).toEqual(["Lead"]);
  });

  it("doesn't keep saving when the server stored something else", async () => {
    await render({ title: "Lead " });
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(titles()).toEqual(["Lead "]);
  });

  it("saves nothing when the form goes away while the job is deleted", async () => {
    const deletion = deferred();
    api.remove.mockReturnValueOnce(deletion.promise);
    await render({ title: "Lead" });
    await act(async () => void form.remove(() => {}));
    await unmount();
    await act(async () => deletion.resolve());
    expect(api.update).not.toHaveBeenCalled();
  });

  it("saves nothing after the job is deleted", async () => {
    await render({ title: "Lead" });
    await act(async () => form.remove(() => root.unmount()));
    expect(api.remove).toHaveBeenCalledWith(7);
    expect(api.update).not.toHaveBeenCalled();
  });
});
