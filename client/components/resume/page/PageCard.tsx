"use client";

import { cn } from "@/lib/utils";
import { autoUpdate, flip, FloatingPortal, offset, shift, size, useFloating } from "@floating-ui/react";
import { KeyboardEvent, ReactNode, RefObject, useEffect, useEffectEvent, useLayoutEffect, useRef } from "react";

const FOCUSABLE = 'input, button:not([disabled]), textarea, select, a[href], [tabindex]:not([tabindex="-1"])';

const focusablesIn = (element: Element) =>
  [...element.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((each) => each.getClientRects().length > 0);

/** Where to put the focus. A new one is a new request, for the same field too. */
export type CardFocus = { field: string };

interface PageCardProps {
  /** What it belongs to, if that is on the page now. A press on it isn't one outside. */
  anchor: () => Element | null;
  label: string;
  focus: CardFocus;
  /** Keeps what is in it, as a half-picked month is nowhere else. */
  hidden?: boolean;
  /** Something in it needs attention before it closes. */
  isBlocked?: () => boolean;
  /** It stayed open for that. The next time it closes. */
  onBlocked?: () => void;
  /** `byKey`: the focus goes back; after a press it is where that was. */
  onClose: (byKey: boolean) => void;
  /** Set to what says whether another card may take its place now. */
  gateRef?: RefObject<(() => boolean) | null>;
  children: ReactNode;
}

const onScrollbar = ({ target, clientX, clientY }: PointerEvent) => {
  if (!(target instanceof Element)) return false;
  const box = target.getBoundingClientRect();
  return (
    (target.scrollHeight > target.clientHeight && clientX > box.left + target.clientLeft + target.clientWidth) ||
    (target.scrollWidth > target.clientWidth && clientY > box.top + target.clientTop + target.clientHeight)
  );
};

const Card = ({
  anchor,
  label,
  focus,
  hidden = false,
  isBlocked,
  onBlocked,
  onClose,
  gateRef,
  children,
}: PageCardProps) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const reference = useRef<Element | null>(null);
  const { refs, floatingStyles } = useFloating({
    placement: "bottom-start",
    middleware: [
      offset(6),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply: ({ availableHeight, elements }) => {
          elements.floating.style.maxHeight = `${Math.max(140, availableHeight)}px`;
        },
      }),
    ],
    whileElementsMounted: hidden ? undefined : autoUpdate,
  });

  // What it belongs to may be replaced, or go, as its fields change.
  useLayoutEffect(() => {
    const next = anchor();
    if (!next || next === reference.current) return;
    reference.current = next;
    refs.setPositionReference(next);
  });

  useEffect(() => {
    const card = cardRef.current;
    if (hidden || !card) return;
    const field = card.querySelector<HTMLElement>(`[data-field="${focus.field}"]`);
    const target = field?.matches(FOCUSABLE) ? field : focusablesIn(field ?? card)[0];
    (target ?? card).focus({ preventScroll: true });
  }, [focus, hidden]);

  const blocked = useEffectEvent(() => isBlocked?.() ?? false);
  const warn = useEffectEvent(() => onBlocked?.());
  const close = useEffectEvent((byKey: boolean) => onClose(byKey));
  const isInside = useEffectEvent((target: EventTarget | null) =>
    target instanceof Node && Boolean(cardRef.current?.contains(target) || anchor()?.contains(target))
  );

  useEffect(() => {
    if (hidden) return;
    let warned = false;
    const mayClose = () => {
      if (warned || !blocked()) return true;
      warned = true;
      warn();
      return false;
    };
    // What a press outside, still going on, was told.
    let told: boolean | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const onDown = (event: PointerEvent) => {
      told = isInside(event.target) || onScrollbar(event) ? null : mayClose();
    };
    const onUp = () => {
      if (told === null) return;
      // Closing may move the page, so the press ends where it began: after the click that follows.
      timer = setTimeout(() => {
        if (told) close(false);
        told = null;
      });
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing || event.keyCode === 229) return;
      if (mayClose()) close(true);
      // Once it shows.
      else requestAnimationFrame(() => cardRef.current?.querySelector<HTMLElement>('[role="alert"]')?.focus());
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("pointercancel", onUp, true);
    document.addEventListener("keydown", onKey);
    const gate = () => told ?? mayClose();
    if (gateRef) gateRef.current = gate;
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("pointercancel", onUp, true);
      document.removeEventListener("keydown", onKey);
      if (gateRef?.current === gate) gateRef.current = null;
    };
  }, [hidden, gateRef]);

  // It is at the end of the document, where Tab would leave it for the browser's own.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Tab" || !cardRef.current) return;
    const all = focusablesIn(cardRef.current);
    const at = all.indexOf(document.activeElement as HTMLElement);
    const leaves = event.shiftKey ? at <= 0 : at === all.length - 1 || at === -1;
    if (!leaves || all.length === 0) return;
    event.preventDefault();
    all[event.shiftKey ? all.length - 1 : 0].focus();
  };

  // A pressed button that goes away takes the focus with it.
  const keepFocus = () =>
    requestAnimationFrame(() => {
      if (document.activeElement === document.body) cardRef.current?.focus({ preventScroll: true });
    });

  return (
    <div
      ref={(element) => {
        cardRef.current = element;
        refs.setFloating(element);
      }}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      style={hidden ? { display: "none" } : floatingStyles}
      onKeyDown={onKeyDown}
      onClick={keepFocus}
      className={cn(
        "z-30 w-[29rem] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-border bg-background p-4 text-sm shadow-lg outline-none print:hidden",
        // The sheet's fields have no look of their own until pointed at.
        "[&_input]:mx-0 [&_input]:bg-muted/60 [&_input]:px-1.5 [&_input]:focus-visible:ring-2 [&_input]:focus-visible:ring-ring/50"
      )}
    >
      {children}
    </div>
  );
};

/** Fields for something on the page, floating by it out of its layout and its scale. */
const PageCard = (props: PageCardProps) => (
  // Has its content only once it is in the document.
  <FloatingPortal>
    <Card {...props} />
  </FloatingPortal>
);

export default PageCard;
