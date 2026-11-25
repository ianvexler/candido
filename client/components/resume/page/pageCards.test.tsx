import { emptyEntry } from "@/lib/resume/sectionEntries";
import { TooltipProvider } from "@/components/ui/Tooltip";
import type { CurriculumSection, SectionEntry } from "@/lib/types";
import { act, useRef, useState } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEntryMonths } from "../EntryDetails";
import { entryAt } from "./cardPlace";
import { PageCards } from "./PageCards";
import { usePageCards } from "./usePageCards";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has none.
vi.stubGlobal("CSS", { escape: (text: string) => text });

const entry = (id: string, changes: Partial<SectionEntry> = {}) => ({ ...emptyEntry(), id, title: id, ...changes });
const place = (entryId: string) => ({ kind: "entry" as const, sectionId: 1, entryId });

let host: HTMLDivElement;
let root: Root;
let cards: ReturnType<typeof usePageCards>;
let setEntries: (entries: SectionEntry[]) => void;
let sections: CurriculumSection[];

const Owner = () => {
  const [now, setSections] = useState([{ id: 1, hidden: false, entries: [entry("a"), entry("b")] } as CurriculumSection]);
  const rootRef = useRef<HTMLDivElement>(null);
  const state = usePageCards(rootRef, now);
  Object.assign(globalThis, {
    owned: { cards: state, sections: now, setEntries: (entries: SectionEntry[]) => setSections([{ ...now[0], entries }]) },
  });
  return (
    <TooltipProvider>
      <div ref={rootRef}>
        <section data-section-id="1">
          <div data-entry-id="a">
            <div data-block="head">
              <p id="title">Title</p>
              <p className="page-line" aria-haspopup="dialog" id="line" />
            </div>
          </div>
        </section>
      </div>
      <PageCards
        cards={state}
        rootRef={rootRef}
        sections={now}
        versions={{}}
        onSectionChange={(id, change) =>
          setSections((all) => all.map((each) => ({ ...each, ...(typeof change === "function" ? change(each) : change) })))
        }
        contact={null}
      />
    </TooltipProvider>
  );
};
const take = () =>
  ({ cards, sections, setEntries } = (globalThis as unknown as { owned: { cards: typeof cards; sections: typeof sections; setEntries: typeof setEntries } }).owned);
const run = async (change: () => void) => {
  await act(async () => change());
  take();
};
const open = (id: string) => run(() => cards.openCard(place(id), "dates"));
const escape = (prevented = false) =>
  run(() => {
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    if (prevented) event.preventDefault();
    document.activeElement!.dispatchEvent(event);
  });
const point = (type: string, target: Element) => run(() => void target.dispatchEvent(new MouseEvent(type, { bubbles: true })));
const start = () => document.querySelector<HTMLInputElement>('[aria-label="Start month"]')!;
const half = (is: boolean) => Object.defineProperty(start(), "validity", { configurable: true, value: { badInput: is } });
const type = (value: string) =>
  run(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(start(), value);
    start().dispatchEvent(new Event("input", { bubbles: true }));
  });
const alerts = () => document.querySelectorAll('[role="alert"]').length;

beforeEach(async () => {
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  await run(() => root.render(<Owner />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("a month being picked", () => {
  it("keeps the card open once, says so, and is kept", async () => {
    await open("a");
    start().focus();
    half(true);
    await escape();
    expect(cards.open?.key).toBe("1:a");
    expect(alerts()).toBe(1);
    await escape();
    expect(cards.open).toBeNull();
    expect(cards.unfinished).toEqual([place("a")]);
    expect(start()).not.toBeNull();
  });

  it("doesn't keep it open once finished, though its field wasn't left", async () => {
    await open("a");
    start().focus();
    half(true);
    await run(() => start().blur());
    expect(cards.unfinished).toHaveLength(1);
    start().focus();
    half(false);
    await type("2022-03");
    expect(cards.unfinished).toHaveLength(0);
    await escape();
    expect(cards.open).toBeNull();
    expect(alerts()).toBe(0);
  });

  it("is dropped with its entry", async () => {
    await open("a");
    half(true);
    await run(() => start().focus());
    await run(() => start().blur());
    await run(() => setEntries([entry("b")]));
    expect(cards.unfinished).toEqual([]);
    expect(cards.open).toBeNull();
    await run(() => setEntries([entry("a"), entry("b")]));
    expect(cards.open).toBeNull();
  });
});

describe("another card", () => {
  it("waits for the first refusal, and starts its warning anew", async () => {
    await open("a");
    start().focus();
    half(true);
    await open("b");
    expect(cards.open?.key).toBe("1:a");
    expect(alerts()).toBe(1);
    await open("b");
    expect(cards.open?.key).toBe("1:b");
    expect(alerts()).toBe(0);
  });

  it("is refused for all of the press that was, however late its click", async () => {
    await open("a");
    start().focus();
    half(true);
    const other = document.createElement("button");
    host.append(other);
    other.addEventListener("click", () => cards.openCard(place("b"), "role"));
    await point("pointerdown", other);
    await point("pointerup", other);
    await act(() => new Promise((done) => setTimeout(done, 30)));
    await point("click", other);
    expect(cards.open?.key).toBe("1:a");
    await point("pointerdown", other);
    await point("pointerup", other);
    await point("click", other);
    expect(cards.open?.key).toBe("1:b");
  });
});

describe("a press", () => {
  it("is inside on what opened it, but not on what is near that", async () => {
    await open("a");
    const press = async (target: Element) => {
      await point("pointerdown", target);
      await point("pointerup", target);
      await point("click", target);
    };
    const line = document.querySelector("#line")!;
    await press(line);
    expect(cards.open).not.toBeNull();
    line.remove();
    await run(() => setEntries([...sections[0].entries]));
    await press(document.querySelector("#title")!);
    expect(cards.open).toBeNull();
  });

  it("closes without a click, as when text is selected", async () => {
    await open("a");
    await point("pointerdown", document.body);
    await point("pointerup", document.body);
    await act(() => new Promise((done) => setTimeout(done, 500)));
    take();
    expect(cards.open).toBeNull();
  });
});

it("leaves a handled Escape alone", async () => {
  await open("a");
  await escape(true);
  expect(cards.open).not.toBeNull();
});

describe("useEntryMonths", () => {
  it("keeps what is typed until the date is changed elsewhere", async () => {
    let months: ReturnType<typeof useEntryMonths>;
    const Months = ({ of }: { of: SectionEntry }) => {
      const now = useEntryMonths(of);
      Object.assign(globalThis, { ownedMonths: now });
      return null;
    };
    const show = async (of: SectionEntry) => {
      await act(async () => root.render(<Months of={of} />));
      months = (globalThis as unknown as { ownedMonths: typeof months }).ownedMonths;
    };
    await show(entry("a"));
    await act(async () => months.set("start", "2022-"));
    await show(entry("a", { title: "other" }));
    expect([months!.start, months!.unfinished]).toEqual(["2022-", true]);
    await act(async () => months.setHalfPicked("start", true));
    await show(entry("a", { start_date: "2020-01-01" }));
    expect([months!.start, months!.unfinished]).toEqual(["2020-01", false]);
  });
});

it("finds an entry as changed through its card", async () => {
  await open("a");
  await type("2022-03");
  expect(entryAt(sections, 1, "a")?.start_date).toBe("2022-03-01");
});
