import { act, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DESIGN_DEFAULTS } from "@/lib/resume/design";
import { PagePaging, printsAsShown, usePaging } from "./usePaging";

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

it.each([
  ["Chrome", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36", true],
  ["headless Chrome", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0.0.0 Safari/537.36", true],
  ["Edge", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0", true],
  ["Firefox", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0", false],
  ["Safari", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15", false],
  ["Chrome on Android", "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36", false],
  ["Chrome on an Android tablet", "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36", false],
  ["Chrome on iOS", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1", false],
])("knows whether %s prints as shown", (_, userAgent, exact) => expect(printsAsShown(userAgent)).toBe(exact));
