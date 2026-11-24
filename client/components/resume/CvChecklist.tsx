"use client";

import ConfirmationModal from "@/components/common/ConfirmationModal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ChecklistSection as Section, filterChecklist } from "@/lib/resume/checklist";
import type { ChecklistActions } from "@/lib/resume/useCvChecklist";
import type { SectionPlacement } from "@/lib/types";
import { arrayMove } from "@dnd-kit/helpers";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import NextLink from "next/link";
import { ComponentProps, useRef, useState } from "react";
import { rowBox } from "./ChecklistRow";
import ChecklistSection, { DragData } from "./ChecklistSection";
import { deletionNote, REMOVE_SECTION } from "./removeSection";

type DragEndEvent = Parameters<NonNullable<ComponentProps<typeof DragDropProvider>["onDragEnd"]>>[0];

interface CvChecklistProps {
  /** From buildChecklist. */
  sections: Section[];
  /** Keys of what is being included; see targetKey. */
  pending: ReadonlySet<string>;
  actions: ChecklistActions;
  /** By section id, with a two-column template. */
  columns: Map<number, SectionPlacement> | null;
  libraryLoading: boolean;
  libraryFailed: boolean;
  onRetryLibrary: () => Promise<void>;
}

/** Everything the CV could show, to tick and put in order. */
const CvChecklist = ({ sections, pending, actions, columns, libraryLoading, libraryFailed, onRetryLibrary }: CvChecklistProps) => {
  const [query, setQuery] = useState("");
  const [removing, setRemoving] = useState<number | null>(null);
  const [retrying, setRetrying] = useState(false);

  const searching = query.trim() !== "";
  const removingSection = sections.find(({ sectionId }) => removing !== null && sectionId === removing);
  const shown = filterChecklist(sections, query);
  const ours = sections.flatMap(({ sectionId }) => sectionId ?? []);

  // The first copy of a library section keeps its row when it's copied in.
  const seen = new Set<number>();
  const keys = new Map(
    sections.map(({ key, templateId }) => {
      const first = templateId !== null && !seen.has(templateId);
      if (first) seen.add(templateId);
      return [key, first ? `library-${templateId}` : key];
    })
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { source } = event.operation;
    if (event.canceled || !isSortable(source)) return;

    const { sectionId, entryId } = source.data as DragData;
    const { initialIndex: from, index: to } = source;
    if (entryId === undefined) {
      actions.orderSections(arrayMove(ours, from, to));
      return;
    }
    const entries = sections.find((section) => section.sectionId === sectionId)?.entries ?? [];
    const ids = entries.filter(({ inCv }) => inCv).map(({ id }) => id);
    if (from !== to) actions.orderEntries(sectionId, arrayMove(ids, from, to));
  };

  const asked = useRef<{ id: number; index: number } | null>(null);
  const askRemove = (id: number) => {
    asked.current = { id, index: ours.indexOf(id) };
    setRemoving(id);
  };
  // The menu item that opened the dialog is gone: back to its menu's button, or
  // to the row that took the section's place.
  const restoreFocus = (event: Event) => {
    if (!asked.current) return;
    event.preventDefault();
    const { id, index } = asked.current;
    const menu = document.querySelector<HTMLElement>(`[data-row="section-${id}"] button[aria-haspopup="menu"]`);
    const next = ours[Math.min(index, ours.length - 1)];
    (menu ?? rowBox(`section-${next}`) ?? document.querySelector<HTMLElement>("[data-add-sheet]"))?.focus();
  };

  const retry = async () => {
    setRetrying(true);
    await onRetryLibrary();
    setRetrying(false);
  };

  return (
    <div className="px-5 pt-5 pb-16">
      <h2 className="mb-3 text-sm font-semibold">What to include</h2>
      {sections.length > 0 && (
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          aria-label="Search what to include"
        />
      )}

      {libraryFailed && (
        <p className="mt-3 text-xs text-muted-foreground">
          Couldn&apos;t load your library, so this only lists what is in the CV.{" "}
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-xs underline"
            disabled={retrying}
            onClick={() => void retry()}
          >
            Try again
          </Button>
        </p>
      )}

      {sections.length === 0 && !libraryLoading && !libraryFailed && (
        <p className="text-sm text-muted-foreground">
          Your library is empty.{" "}
          <NextLink href="/resume/sections" className="underline">
            Write some sections
          </NextLink>{" "}
          to pick from them here.
        </p>
      )}
      {sections.length === 0 && libraryLoading && (
        <p className="text-sm text-muted-foreground">Loading your library…</p>
      )}
      {searching && shown.length === 0 && <p className="mt-4 text-sm text-muted-foreground">Nothing matches.</p>}

      <DragDropProvider onDragEnd={onDragEnd}>
        {shown.map((section) => (
          <ChecklistSection
            key={keys.get(section.key)}
            section={section}
            index={section.sectionId === null ? ours.length : ours.indexOf(section.sectionId)}
            count={ours.length}
            pending={[...pending].filter(
              (key) => key.startsWith(`${section.templateId}:`) || key.startsWith(`transfer:${section.sectionId}:`)
            )}
            offerChanges={!libraryLoading && !libraryFailed}
            column={(section.sectionId !== null && columns?.get(section.sectionId)) || null}
            canReorder={!searching}
            actions={actions}
            onAskRemove={askRemove}
          />
        ))}
      </DragDropProvider>

      <ConfirmationModal
        isOpen={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (removing !== null) await actions.removeSection(removing);
        }}
        title={REMOVE_SECTION.title}
        description={deletionNote(removingSection, !libraryLoading && !libraryFailed)}
        confirmLabel="Delete"
        onCloseAutoFocus={restoreFocus}
        variant="destructive"
      />
    </div>
  );
};

export default CvChecklist;
