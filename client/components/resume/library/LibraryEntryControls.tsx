"use client";

import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/DropdownMenu";
import type { SectionEntry } from "@/lib/types";
import { LayersIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import RowMenu, { RowMenuAction } from "../RowMenu";
import { EVERY_COLLECTION, labelChips, LibraryLabelling } from "./LabelArea";
import LabelPicker from "./LabelPicker";

interface LibraryEntryControlsProps {
  entry: SectionEntry;
  library: LibraryLabelling & { sectionId: number };
  /** What can be done to the entry's own fields, in the order shown. */
  actions: RowMenuAction[];
  move?: { canMoveUp: boolean; canMoveDown: boolean; onMove: (by: -1 | 1) => void };
  /** Without it, the entry can't be deleted. */
  onDelete?: () => void;
}

/**
 * A library entry's corner: the collections it is in, and one menu that says
 * what each action does. Collections… opens the picker from that menu.
 */
const LibraryEntryControls = ({ entry, library, actions, move, onDelete }: LibraryEntryControlsProps) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const own = library.itemLabels[entry.id] ?? [];
  // With none of its own it is in every collection, which needs no chip here.
  const chips = labelChips(library.labels, { own, inherited: [] }).filter(({ name }) => name !== EVERY_COLLECTION);

  return (
    <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
      {chips.length > 0 && (
        <ul aria-label="Collections of this entry" className="flex items-center gap-1">
          {chips.map(({ name }) => (
            <li key={name} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {name}
            </li>
          ))}
        </ul>
      )}
      <LabelPicker
        labels={library.labels}
        filter={library.filter}
        mode={{ kind: "toggle", own, inherited: [] }}
        onChoose={(labelId, on) => library.onLabel(labelId, on, [{ section_template_id: library.sectionId, id: entry.id }])}
        onCreate={library.onCreate}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Collections of this entry"
        align="end"
        // Opened from the menu, so focus goes back to the menu's button.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document
            .querySelector<HTMLElement>(`[data-entry-id="${CSS.escape(entry.id)}"] button[aria-haspopup="menu"]`)
            ?.focus();
        }}
      >
        {/* Opened from the menu; this only places it. */}
        <span aria-hidden className="size-0" />
      </LabelPicker>
      <span className="opacity-0 transition-opacity group-hover/entry:opacity-100 group-focus-within/entry:opacity-100 has-[[data-state=open]]:opacity-100 [@media(hover:none)]:opacity-100">
        <RowMenu
          label={entry.title.trim() || "this entry"}
          actions={[
            ...actions,
            // After the menu has let go of the focus, or the picker closes at once.
            { label: "Collections…", icon: <LayersIcon />, onSelect: () => setTimeout(() => setPickerOpen(true)) },
          ]}
          move={move}
        >
          {onDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2Icon />
                Delete entry
              </DropdownMenuItem>
            </>
          )}
        </RowMenu>
      </span>
    </div>
  );
};

export default LibraryEntryControls;
