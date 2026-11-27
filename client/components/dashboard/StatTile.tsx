import { cn } from "@/lib/utils";
import { ReactNode } from "react";
import Eyebrow from "./Eyebrow";

interface StatTileProps {
  label: string;
  value: string | number;
  detail: ReactNode;
  /** Ink with an amber figure, for the number that matters most. */
  highlight?: boolean;
}

const StatTile = ({ label, value, detail, highlight = false }: StatTileProps) => (
  <div
    className={cn(
      "row-span-3 grid min-w-0 grid-rows-subgrid gap-y-0 rounded-xl border p-5",
      highlight ? "border-candido-ink bg-candido-ink text-white" : "bg-card shadow-sm"
    )}
  >
    <Eyebrow className={cn("items-start [&>span]:mt-[0.5lh]", highlight && "text-gray-400")}>{label}</Eyebrow>
    <p
      className={cn(
        "mt-3 font-heading text-5xl leading-none font-black tracking-tight tabular-nums",
        highlight && "text-candido"
      )}
    >
      {value}
    </p>
    <p className={cn("mt-2 text-xs", highlight ? "text-gray-300" : "text-muted-foreground")}>{detail}</p>
  </div>
);

export default StatTile;
