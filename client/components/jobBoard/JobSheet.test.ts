import { JobBoardEntry, JobStatus } from "@/lib/types";
import { act, createElement, useEffect, useState } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import JobSheet from "./JobSheet";

const panel = vi.hoisted(() => ({ initial: [] as string[], mounted: 0, title: "" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/jobBoard/useNotes", () => ({ useNotes: () => ({ notes: {}, addNote: vi.fn() }) }));
// Like the real panel, starts its fields from the job it's mounted with.
vi.mock("./JobPanel", () => ({
  default: function JobPanel({ entry }: { entry: JobBoardEntry }) {
    const [status] = useState(entry.status);
    useEffect(() => {
      panel.title = entry.title;
    });
    useEffect(() => {
      panel.initial.push(status);
      panel.mounted += 1;
      return () => {
        panel.mounted -= 1;
      };
    }, [status]);
    return null;
  },
}));

const job = { id: 7, title: "Designer", status: JobStatus.PENDING } as JobBoardEntry;
let root: Root;

const render = (jobs: JobBoardEntry[], openId?: number) =>
  act(async () =>
    root.render(
      createElement(JobSheet, {
        entry: jobs.find(({ id }) => id === openId), allEntries: jobs,
        onClose: () => {}, onPatchJob: () => {}, onDelete: () => {},
      })
    )
  );
const wait = (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  Object.assign(panel, { initial: [], mounted: 0, title: "" });
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
});

describe("JobSheet", () => {
  it("starts afresh when a job is reopened, so a move made on the board isn't undone", async () => {
    await render([job], 7);
    await render([job]);
    await wait(300);
    const moved = { ...job, status: JobStatus.APPLIED };
    await render([moved]);
    await render([moved], 7);
    expect(panel.initial).toEqual([JobStatus.PENDING, JobStatus.APPLIED]);
  });

  it("stays while it slides out, with the job as it was last saved, then goes", async () => {
    await render([job], 7);
    await render([{ ...job, title: "Lead" }]);
    expect(panel).toMatchObject({ mounted: 1, title: "Lead" });
    await wait(300);
    expect(panel.mounted).toBe(0);
  });
});
