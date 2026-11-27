"use client";

import { DropdownMenuItem } from "@/components/ui/DropdownMenu";
import { Trash2Icon } from "lucide-react";
import RowMenu from "../RowMenu";

interface LibrarySectionMenuProps {
  /** The section's heading, for screen readers. */
  heading: string;
  deleteLabel: string;
  onDelete: () => void;
}

/** A library section's menu, beside its heading. */
const LibrarySectionMenu = ({ heading, deleteLabel, onDelete }: LibrarySectionMenuProps) => (
  <RowMenu label={heading.trim() || "this section"}>
    <DropdownMenuItem onSelect={onDelete} variant="destructive">
      <Trash2Icon />
      {deleteLabel}
    </DropdownMenuItem>
  </RowMenu>
);

export default LibrarySectionMenu;
