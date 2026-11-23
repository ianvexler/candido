"use client";

import FitBadge from "@/components/common/FitBadge";
import { cn } from "@/lib/utils";
import { useState } from "react";

type Decision = "accepted" | "rejected";

const SUGGESTIONS = [
  {
    reason: "The posting asks for design systems experience. Name it.",
    quote: "Looked after the shared components used by three teams",
    replacement: "Maintained the design system used by three product teams",
  },
  {
    reason: "Lead with the result. This role owns onboarding.",
    quote: "Worked on a new sign-up flow, which cut drop-off by a fifth",
    replacement: "Cut sign-up drop-off by a fifth by redesigning the flow",
  },
  {
    reason: "They mention research four times. Make yours easier to spot.",
    quote: "Spoke to customers every other week",
    replacement: "Ran fortnightly customer research interviews",
  },
];

const REQUIREMENTS = [
  { label: "Design systems", covered: "Covered", dot: "bg-emerald-500" },
  { label: "User research", covered: "Covered", dot: "bg-emerald-500" },
  { label: "Accessibility", covered: "Partly covered", dot: "bg-amber-500" },
];

/** A CV copy with suggestions to accept or reject, as in a real review. */
const TailorDemo = () => {
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [active, setActive] = useState(0);

  const isDone = Object.keys(decisions).length === SUGGESTIONS.length;

  const decide = (decision: Decision) => {
    const next = { ...decisions, [active]: decision };
    setDecisions(next);
    const pending = SUGGESTIONS.findIndex((_, index) => !next[index]);
    if (pending !== -1) setActive(pending);
  };

  const line = (index: number) => {
    const suggestion = SUGGESTIONS[index];
    const decision = decisions[index];
    const text = decision === "accepted" ? suggestion.replacement : suggestion.quote;
    if (decision) {
      return <span className={cn(decision === "accepted" && "bg-emerald-100")}>{text}</span>;
    }
    return (
      <button
        type="button"
        aria-pressed={active === index}
        onClick={() => setActive(index)}
        className={cn(
          "cursor-pointer text-left align-top underline decoration-amber-500 decoration-2 underline-offset-4",
          active === index ? "bg-[#ffe0a3]" : "hover:bg-[#fff0d2]"
        )}
      >
        {text}
      </button>
    );
  };

  return (
    <div className="grid items-center gap-4 lg:grid-cols-[1.35fr_1fr] lg:gap-0">
      <article
        aria-label="Example CV"
        className="rounded-md border border-neutral-300 bg-white p-6 text-[15px] leading-relaxed shadow-[0_24px_50px_-30px_rgb(0_0_0/0.5)] sm:p-12 sm:pr-24 lg:-rotate-1"
      >
        <p className="text-[30px] font-bold leading-none">Robin Hale</p>
        <p className="mt-2 text-neutral-600">Product Designer, Leeds</p>

        <p className="mt-7 border-b border-neutral-300 pb-1 text-[17px] font-bold">Experience</p>
        <div className="mt-3 flex flex-wrap justify-between gap-x-4">
          <p className="font-semibold">Designer, Mossbank</p>
          <p className="text-neutral-600">2022 to present</p>
        </div>
        <ul className="mt-2 list-disc space-y-2 pl-5">
          <li>{line(0)}</li>
          <li>{line(1)}</li>
          <li>{line(2)}</li>
        </ul>

        <p className="mt-7 border-b border-neutral-300 pb-1 text-[17px] font-bold">Education</p>
        <div className="mt-3 flex flex-wrap justify-between gap-x-4">
          <p className="font-semibold">BA Graphic Design</p>
          <p className="text-neutral-600">2018 to 2021</p>
        </div>
      </article>

      <aside className="relative rounded-2xl bg-candido p-5 sm:p-6 lg:-ml-14">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[16px] font-bold">Product Designer, Fernway</p>
          <FitBadge fit="strong" />
        </div>
        <ul className="mt-3 space-y-1 text-[14px]">
          {REQUIREMENTS.map((requirement) => (
            <li key={requirement.label} className="flex justify-between gap-3">
              {requirement.label}
              <span className="flex items-center gap-1.5">
                <i className={cn("size-2 rounded-full ring-1 ring-black/40", requirement.dot)} aria-hidden />
                {requirement.covered}
              </span>
            </li>
          ))}
        </ul>

        <div aria-live="polite" className="mt-5 rounded-xl bg-white p-4 text-[15px] leading-snug lg:min-h-[226px]">
          {isDone ? (
            <>
              <p className="font-semibold">That copy is ready for Fernway.</p>
              <p className="mt-2 text-neutral-700">Your original CV hasn&apos;t changed.</p>
              <button
                type="button"
                onClick={() => {
                  setDecisions({});
                  setActive(0);
                }}
                className="mt-4 min-h-10 cursor-pointer rounded-md border border-neutral-400 px-4 font-semibold hover:bg-neutral-100"
              >
                Start again
              </button>
            </>
          ) : (
            <>
              <p className="font-semibold">{SUGGESTIONS[active].reason}</p>
              <p className="mt-3 text-neutral-600 line-through decoration-red-400">{SUGGESTIONS[active].quote}</p>
              <p className="mt-2">{SUGGESTIONS[active].replacement}</p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => decide("accepted")}
                  className="min-h-10 cursor-pointer rounded-md bg-candido-black px-4 font-semibold text-white hover:bg-black"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => decide("rejected")}
                  className="min-h-10 cursor-pointer rounded-md px-4 font-semibold hover:bg-neutral-100"
                >
                  Reject
                </button>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
};

export default TailorDemo;
