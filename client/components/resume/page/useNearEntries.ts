import type { ResumeDocument } from "@/lib/resume/exportDocument";
import { RefObject, useEffect, useRef, useState } from "react";
import { createNearStore, entryKey, NearStore } from "./nearStore";
import { placeOf } from "./pagePlace";
import { scrollParent } from "./scrolling";

/** Which of the page's entries are within a screen of what shows. */
export const useNearEntries = (
  rootRef: RefObject<HTMLElement | null>,
  shown: ResumeDocument,
  template: string
): NearStore => {
  const [near] = useState(createNearStore);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const observed = useRef(new Set<Element>());

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    observerRef.current ??= new IntersectionObserver(
      (entries) =>
        entries.forEach(({ target, isIntersecting }) => {
          const place = placeOf(target);
          if (place?.entryId && target.isConnected) near.set(entryKey(place.sectionId, place.entryId), isIntersecting);
        }),
      { root: scrollParent(root), rootMargin: "100% 0px" }
    );
    const observer = observerRef.current;
    const elements = new Set(root.querySelectorAll("[data-entry-id]"));
    observed.current.forEach((element) => !elements.has(element) && observer.unobserve(element));
    elements.forEach((element) => !observed.current.has(element) && observer.observe(element));
    observed.current = elements;
  }, [rootRef, shown, template, near]);

  useEffect(
    () => () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      observed.current = new Set();
    },
    []
  );

  return near;
};
