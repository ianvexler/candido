"use client";

import type { TransferDirection } from "@/api/resources/curriculums/transferWithLibrary";
import { Button } from "@/components/ui/Button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/DropdownMenu";
import { actionLabel, actionsFor, changeLabel, FieldDifference, ItemState } from "@/lib/resume/itemState";
import { cn } from "@/lib/utils";
import { LibraryIcon } from "lucide-react";
import { Popover } from "radix-ui";
import { ComponentProps, ReactNode, useState } from "react";

/** An item's text on each side, or the fields that differ. */
export type ChangedText = { cv: string; library: string } | FieldDifference[];

interface ItemChangeMenuProps {
  label: string;
  state: ItemState;
  changed: ChangedText;
  /** It is being done. */
  busy: boolean;
  onChoose: (action: TransferDirection) => void;
}

type ChangedButtonProps = ComponentProps<typeof Button> & { label: string; state: ItemState };

const ChangedButton = ({ label, state, className, ...props }: ChangedButtonProps) => (
  <Button
    {...props}
    type="button"
    variant={state === "cv_changed" ? "ghost" : "outline"}
    size="xs"
    aria-label={`${changeLabel(state)}: ${label}`}
    className={cn(
      "mt-0.5 font-normal shadow-none aria-disabled:opacity-60 [@media(pointer:coarse)]:my-0.5 [@media(pointer:coarse)]:h-8",
      state === "cv_changed" && "text-muted-foreground",
      className
    )}
  >
    {changeLabel(state)}
  </Button>
);

const Side = ({ title, side, changed }: { title: string; side: "cv" | "library"; changed: ChangedText }) => (
  <div>
    <h3 className="text-xs font-semibold text-muted-foreground">{title}</h3>
    {Array.isArray(changed) ? (
      <dl className="mt-0.5 space-y-0.5">
        {changed.map((field) => (
          <div key={field.label} className="flex gap-1.5">
            <dt className="shrink-0 text-muted-foreground">{field.label}:</dt>
            <dd className={cn("min-w-0 break-words", !field[side] && "text-muted-foreground")}>{field[side] || "Blank"}</dd>
          </div>
        ))}
      </dl>
    ) : (
      <p className="mt-0.5 break-words">{changed[side]}</p>
    )}
  </div>
);

/** Both texts, and what to do about them. */
const Chooser = ({ label, state, changed, busy, onChoose }: ItemChangeMenuProps) => {
  const [open, setOpen] = useState(false);
  const looksSame = !Array.isArray(changed) && changed.cv === changed.library;

  return (
    <Popover.Root open={open} onOpenChange={(next) => setOpen(next && !busy)}>
      <Popover.Trigger asChild>
        <ChangedButton label={label} state={state} aria-disabled={busy || undefined} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={4}
          collisionPadding={8}
          aria-label={`This CV and your library differ: ${label}`}
          className="z-50 flex max-h-(--radix-popover-content-available-height) w-80 max-w-[calc(100vw-1rem)] flex-col rounded-md border bg-popover p-3 text-[13px] leading-snug text-popover-foreground shadow-md"
        >
          <div className="max-h-72 min-h-0 space-y-2.5 overflow-y-auto">
            <Side title="This CV" side="cv" changed={changed} />
            <Side title="Library" side="library" changed={changed} />
            {looksSame && <p className="text-muted-foreground">Only the formatting or links differ.</p>}
          </div>
          <div className="mt-3 flex shrink-0 flex-col gap-1.5">
            {actionsFor(state).map((action) => (
              <Button
                key={action}
                type="button"
                variant="outline"
                size="sm"
                className="[@media(pointer:coarse)]:h-10"
                onClick={() => {
                  setOpen(false);
                  onChoose(action);
                }}
              >
                {actionLabel(state, action)}
              </Button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

/** For a row whose text isn't the library's: what can be done about it. */
const ItemChangeMenu = (props: ItemChangeMenuProps) => {
  const { label, state, busy, onChoose } = props;
  const actions = actionsFor(state);
  if (actions.length > 1) return <Chooser {...props} />;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ChangedButton label={label} state={state} aria-disabled={busy || undefined} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action) => (
          <DropdownMenuItem key={action} disabled={busy} onSelect={() => onChoose(action)}>
            {actionLabel(state, action)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/** In a row's menu, for what the library doesn't have. */
export const AddToLibraryItem = ({ busy, onChoose }: Pick<ItemChangeMenuProps, "busy" | "onChoose">) => (
  <DropdownMenuItem disabled={busy} onSelect={() => onChoose("to_library")}>
    <LibraryIcon />
    {actionLabel("cv_only", "to_library")}
  </DropdownMenuItem>
);

/** What a row offers: in its menu if the library lacks it, else as a button. */
export const changeControls = (
  offer: ItemState | null,
  props: Omit<ItemChangeMenuProps, "state">
): { add?: ReactNode; change?: ReactNode } => ({
  add: offer === "cv_only" ? <AddToLibraryItem busy={props.busy} onChoose={props.onChoose} /> : undefined,
  change: offer !== null && changeLabel(offer) ? <ItemChangeMenu {...props} state={offer} /> : undefined,
});

export default ItemChangeMenu;
