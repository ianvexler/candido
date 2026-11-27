"use client";

import ConfirmationModal from "@/components/common/ConfirmationModal";
import { Button } from "@/components/ui/Button";
import { DropdownMenuItem } from "@/components/ui/DropdownMenu";
import InlineInput from "@/components/ui/InlineInput";
import { apiErrorMessage } from "@/lib/resume/reviewPanel";
import type { PurposeFilter } from "@/lib/resume/purposes";
import { CvLabel } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FolderIcon, FolderOpenIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { KeyboardEvent, ReactNode, useCallback, useRef, useState } from "react";
import toast from "react-hot-toast";
import RowMenu from "../RowMenu";

const STORAGE_KEY = "library-purpose";
const MAX_NAME = 40;
const ALL: PurposeFilter = { kind: "all" };
const NONE: PurposeFilter = { kind: "none" };

export const parseFilter = (stored: string | null): PurposeFilter => {
  if (stored === "none") return NONE;
  const id = Number(stored);
  return stored && Number.isInteger(id) && id > 0 ? { kind: "label", id } : ALL;
};

export const serialise = (filter: PurposeFilter) => (filter.kind === "label" ? String(filter.id) : filter.kind);

const readStored = (): PurposeFilter => {
  try {
    return parseFilter(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return ALL;
  }
};

/** A label that no longer exists is All content, once the labels are known. */
export const chosenFilter = (stored: PurposeFilter, labels: CvLabel[], loaded: boolean): PurposeFilter =>
  stored.kind === "label" && loaded && !labels.some(({ id }) => id === stored.id) ? ALL : stored;

/**
 * The chosen purpose, remembered per browser. Until `labels` are known a stored
 * one is kept; then one that no longer exists is All content.
 */
export const usePurposeFilter = (labels: CvLabel[], loaded: boolean) => {
  const [stored, setStored] = useState<PurposeFilter>(() => (typeof window === "undefined" ? ALL : readStored()));

  const setFilter = useCallback((next: PurposeFilter) => {
    setStored(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, serialise(next));
    } catch {
      // Not remembered, but still chosen.
    }
  }, []);

  return [chosenFilter(stored, labels, loaded), setFilter] as const;
};

const sameFilter = (a: PurposeFilter, b: PurposeFilter) =>
  a.kind === b.kind && (a.kind !== "label" || (b.kind === "label" && a.id === b.id));

const carryNote = (count: number) =>
  `${count} ${count === 1 ? "item carries" : "items carry"} this purpose. CVs keep their ticks.`;

/** A purpose's name: Enter or leaving keeps it, Escape doesn't. */
export const NameInput = ({
  initial = "",
  label,
  onSubmit,
  onCancel,
}: {
  initial?: string;
  label: string;
  /** Resolves false to keep editing. */
  onSubmit: (name: string) => Promise<boolean>;
  onCancel: () => void;
}) => {
  const [name, setName] = useState(initial);
  // Sending, or done: leaving the field (it may on unmount) mustn't send it again.
  const busy = useRef(false);
  const finished = useRef(false);

  const cancel = () => {
    if (finished.current) return;
    finished.current = true;
    onCancel();
  };

  const submit = async () => {
    if (busy.current || finished.current) return;
    const trimmed = name.trim();
    if (trimmed === "" || trimmed === initial.trim()) return cancel();
    busy.current = true;
    const done = await onSubmit(trimmed);
    busy.current = false;
    if (done) finished.current = true;
    else setName(trimmed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  };

  return (
    <InlineInput
      autoFocus
      value={name}
      maxLength={MAX_NAME}
      onChange={(event) => setName(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => void submit()}
      aria-label={label}
      placeholder="Purpose name"
      className="py-1 text-sm"
    />
  );
};

const PurposeRow = ({
  name,
  count,
  chosen,
  onChoose,
  icon = true,
  menu,
}: {
  name: string;
  count: number | undefined;
  chosen: boolean;
  onChoose: () => void;
  icon?: boolean;
  menu?: ReactNode;
}) => {
  const Icon = chosen ? FolderOpenIcon : FolderIcon;
  return (
    <div className={cn("group/row flex items-center gap-1 rounded-md pr-1 hover:bg-muted/60", chosen && "bg-muted")}>
      <button
        type="button"
        aria-pressed={chosen}
        onClick={onChoose}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm focus-visible:outline-2 focus-visible:outline-foreground"
      >
        {icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : <span className="size-4 shrink-0" />}
        <span className={cn("min-w-0 flex-1 truncate", chosen && "font-medium")}>{name}</span>
        {count !== undefined && (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {count}
            <span className="sr-only"> {count === 1 ? "item" : "items"}</span>
          </span>
        )}
      </button>
      {menu ?? <span aria-hidden className="w-6 shrink-0" />}
    </div>
  );
};

interface PurposeListProps {
  labels: CvLabel[];
  /** From purposeCounts. */
  counts: Map<"all" | "none" | number, number>;
  /** By label id: the entries and items labelled with it. */
  carried: Map<number, number>;
  filter: PurposeFilter;
  onFilter: (filter: PurposeFilter) => void;
  onCreate: (name: string) => Promise<CvLabel>;
  onRename: (id: number, name: string) => Promise<CvLabel>;
  onDelete: (id: number) => Promise<void>;
}

/** All content, each purpose, then what is not labelled: like folders, though nothing is copied. */
const PurposeList = ({ labels, counts, carried, filter, onFilter, onCreate, onRename, onDelete }: PurposeListProps) => {
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<CvLabel | null>(null);
  // Rename was chosen in a menu that is closing.
  const renamingRef = useRef(false);
  // Which the dialog was for, as it closes.
  const asked = useRef<number | null>(null);

  const attempt = async (request: () => Promise<unknown>, fallback: string) => {
    try {
      await request();
      return true;
    } catch (error) {
      console.error(error);
      toast.error(apiErrorMessage(error, fallback));
      return false;
    }
  };

  const focusRow = (name: string) =>
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-purpose="${CSS.escape(name)}"] button[aria-pressed]`)?.focus()
    );

  return (
    <section aria-labelledby="purposes-heading" className="px-3 pt-5 pb-3">
      <h2 id="purposes-heading" className="mb-2 px-2 text-sm font-semibold">
        Purposes
      </h2>
      <ul className="space-y-0.5">
        <li data-purpose="all">
          <PurposeRow name="All content" count={counts.get("all")} chosen={filter.kind === "all"} onChoose={() => onFilter(ALL)} />
        </li>
        {labels.map((label) => (
          <li key={label.id} data-purpose={label.id}>
            {renaming === label.id ? (
              <div className="pl-8 pr-7">
                <NameInput
                  initial={label.name}
                  label={`Rename ${label.name}`}
                  onCancel={() => {
                    setRenaming(null);
                    focusRow(String(label.id));
                  }}
                  onSubmit={async (name) => {
                    const done = await attempt(() => onRename(label.id, name), "Couldn't rename this purpose.");
                    if (done) {
                      setRenaming(null);
                      focusRow(String(label.id));
                    }
                    return done;
                  }}
                />
              </div>
            ) : (
              <PurposeRow
                name={label.name}
                count={counts.get(label.id)}
                chosen={sameFilter(filter, { kind: "label", id: label.id })}
                onChoose={() => onFilter({ kind: "label", id: label.id })}
                menu={
                  <RowMenu
                    label={label.name}
                    onCloseAutoFocus={(event) => {
                      // The name field took it.
                      if (renamingRef.current) event.preventDefault();
                      renamingRef.current = false;
                    }}
                  >
                    <DropdownMenuItem
                      onSelect={() => {
                        renamingRef.current = true;
                        setRenaming(label.id);
                      }}
                    >
                      <PencilIcon />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        asked.current = label.id;
                        setDeleting(label);
                      }}
                    >
                      <Trash2Icon />
                      Delete
                    </DropdownMenuItem>
                  </RowMenu>
                }
              />
            )}
          </li>
        ))}
        <li data-purpose="none">
          <PurposeRow
            name="Not labelled"
            count={counts.get("none")}
            chosen={filter.kind === "none"}
            onChoose={() => onFilter(NONE)}
            icon={false}
          />
        </li>
      </ul>

      {creating ? (
        <div className="mt-1 pl-8 pr-7">
          <NameInput
            label="New purpose"
            onCancel={() => setCreating(false)}
            onSubmit={async (name) => {
              try {
                const created = await onCreate(name);
                setCreating(false);
                focusRow(String(created.id));
                return true;
              } catch (error) {
                console.error(error);
                toast.error(apiErrorMessage(error, "Couldn't add this purpose."));
                return false;
              }
            }}
          />
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 text-muted-foreground"
          onClick={() => setCreating(true)}
        >
          <PlusIcon />
          New purpose
        </Button>
      )}

      <ConfirmationModal
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await attempt(() => onDelete(deleting.id), "Couldn't delete this purpose.");
        }}
        title={deleting ? `Delete ${deleting.name}?` : ""}
        description={carryNote(deleting ? (carried.get(deleting.id) ?? 0) : 0)}
        confirmLabel="Delete"
        variant="destructive"
        onCloseAutoFocus={(event) => {
          // Back to its menu if it's still there; its row is gone if it was deleted.
          event.preventDefault();
          const id = asked.current;
          requestAnimationFrame(() => {
            const menu = document.querySelector<HTMLElement>(`[data-purpose="${id}"] button[aria-haspopup="menu"]`);
            (menu ?? document.querySelector<HTMLElement>('[data-purpose="all"] button[aria-pressed]'))?.focus();
          });
        }}
      />
    </section>
  );
};

export default PurposeList;
