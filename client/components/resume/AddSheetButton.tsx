import { PlusIcon } from "lucide-react";
import { ReactNode } from "react";

interface AddSheetButtonProps {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}

/** A dashed blank page under the last section. */
const AddSheetButton = ({ onClick, disabled, children }: AddSheetButtonProps) => (
  <button
    type="button"
    data-add-sheet
    onClick={onClick}
    disabled={disabled}
    className="mx-auto flex w-full max-w-2xl min-h-36 flex-col items-center justify-center gap-1 border border-dashed border-border bg-white/70 text-muted-foreground shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-colors hover:bg-white hover:text-foreground disabled:opacity-50"
  >
    <PlusIcon className="size-5" />
    <span className="text-sm font-medium">{children}</span>
  </button>
);

export default AddSheetButton;
