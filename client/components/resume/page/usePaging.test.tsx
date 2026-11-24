import { act, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DESIGN_DEFAULTS } from "@/lib/resume/design";
import { PagePaging, usePaging } from "./usePaging";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  vi.stubGlobal("CSSStyleSheet", class { disabled = false; replaceSync() {} });
  Object.assign(document, { adoptedStyleSheets: [] });
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: Object.assign(new EventTarget(), { status: "loaded", ready: Promise.resolve() }),
  });
});
afterEach(() => vi.unstubAllGlobals());

type Report = (paging: PagePaging) => void;

const Paged = ({ onPaging }: { onPaging: Report }) => {
  const ref = useRef<HTMLDivElement>(null);
  const paging = usePaging(ref, { pageId: "p", design: { ...DESIGN_DEFAULTS }, paper: "a4", scale: 1 });
  useEffect(() => onPaging(paging), [onPaging, paging]);
  return <div ref={ref} />;
};

it("settles with a design that is new on each render", async () => {
  const reports: PagePaging[] = [];
  const Owner = () => {
    const [, setPaging] = useState<PagePaging | null>(null);
    const onPaging = useCallback<Report>((paging) => {
      reports.push(paging);
      if (reports.length < 20) setPaging(paging);
    }, []);
    return <Paged onPaging={onPaging} />;
  };
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Owner />));
  await act(() => new Promise((done) => setTimeout(done, 100)));
  expect(reports.at(-1)?.ready).toBe(true);
  expect(reports.length).toBeLessThan(4);
  act(() => root.unmount());
});
