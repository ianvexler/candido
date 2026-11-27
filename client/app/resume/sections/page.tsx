"use client";

import { getCvLabels } from "@/api/resources/cvLabels/getCvLabels";
import { getResumeProfile } from "@/api/resources/resumeProfile/getResumeProfile";
import { updateResumeProfile } from "@/api/resources/resumeProfile/updateResumeProfile";
import { createSectionTemplate } from "@/api/resources/sectionTemplates/createSectionTemplate";
import { deleteSectionTemplate } from "@/api/resources/sectionTemplates/deleteSectionTemplate";
import { getSectionTemplates } from "@/api/resources/sectionTemplates/getSectionTemplates";
import { reorderSectionTemplates } from "@/api/resources/sectionTemplates/reorderSectionTemplates";
import { updateSectionTemplate } from "@/api/resources/sectionTemplates/updateSectionTemplate";
import Description from "@/components/common/Description";
import Loader from "@/components/common/Loader";
import Title from "@/components/common/Title";
import HeaderDocument from "@/components/resume/HeaderDocument";
import ImportCvDialog from "@/components/resume/ImportCvDialog";
import LibraryOutline, { LibrarySelection, outlineRow } from "@/components/resume/library/LibraryOutline";
import LibraryWorkspace from "@/components/resume/library/LibraryWorkspace";
import PurposeList, { usePurposeFilter } from "@/components/resume/library/PurposeList";
import LibrarySection, { SectionLabelling } from "@/components/resume/LibrarySection";
import { Button } from "@/components/ui/Button";
import { outline, purposeCounts } from "@/lib/resume/purposes";
import { apiErrorMessage } from "@/lib/resume/reviewPanel";
import { waitForSaves } from "@/lib/resume/saveTracker";
import type { SectionPatch } from "@/lib/resume/sectionDrafts";
import { useLibraryLabels } from "@/lib/resume/useLibraryLabels";
import { useSectionDrafts } from "@/lib/resume/useSectionDrafts";
import type { LabelTarget } from "@/api/resources/cvLabels/setLabelOnItems";
import { ResumeHeader, SectionEntry, SectionTemplate } from "@/lib/types";
import { ArrowLeftIcon, FileUpIcon, PlusIcon } from "lucide-react";
import NextLink from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

const saveTemplate = async (template: SectionTemplate, patch: SectionPatch) =>
  (await updateSectionTemplate(template.id, patch)).section_template;

type ItemLabels = Record<number, Record<string, number[]>>;

const NO_ITEM_LABELS: Record<string, number[]> = {};

const labelsByTemplate = (templates: SectionTemplate[]): ItemLabels =>
  Object.fromEntries(templates.map(({ id, item_labels }) => [id, item_labels ?? {}]));

/** In the order of `ids`; any others after them, as they were. */
const inOrder = (entries: SectionEntry[], ids: string[]) => {
  const place = (entry: SectionEntry) => (ids.includes(entry.id) ? ids.indexOf(entry.id) : ids.length);
  return [...entries].sort((a, b) => place(a) - place(b));
};

const NARROW = "(max-width: 1023.98px)";
const isNarrow = () => typeof window !== "undefined" && window.matchMedia(NARROW).matches;

// The sticky back bar on small screens, and some room above.
const SCROLL_OFFSET = 64;

const SectionLibraryPage = () => {
  const { sections: templates, versions, load, add, change, remove, reorder, current, flush } =
    useSectionDrafts<SectionTemplate>(saveTemplate);
  const [profile, setProfile] = useState<ResumeHeader | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // The header editor is uncontrolled; bump this to reload it after an import fills the profile.
  const [headerVersion, setHeaderVersion] = useState(0);
  const [selection, setSelection] = useState<LibrarySelection>({ sectionId: null });
  const [detailOpen, setDetailOpen] = useState(false);
  const [query, setQuery] = useState("");
  const detailRef = useRef<HTMLDivElement>(null);

  // Labels live here, not in the drafts, so saving text never overwrites them.
  const [itemLabels, setAllItemLabels] = useState<ItemLabels>({});
  const setItemLabels = useCallback(
    (templateId: number, map: Record<string, number[]>) =>
      setAllItemLabels((current) => ({ ...current, [templateId]: map })),
    []
  );
  const stripLabel = useCallback(
    (labelId: number) =>
      setAllItemLabels((current) =>
        Object.fromEntries(
          Object.entries(current).map(([templateId, map]) => [
            templateId,
            Object.fromEntries(
              Object.entries(map)
                .map(([id, ids]) => [id, ids.filter((id) => id !== labelId)] as const)
                .filter(([, ids]) => ids.length > 0)
            ),
          ])
        )
      ),
    []
  );
  const { labels, load: loadLabels, create, rename, remove: removeLabel, apply } = useLibraryLabels({
    setItemLabels,
    onRemoved: stripLabel,
  });
  const [filter, setFilter] = usePurposeFilter(labels, !loading);

  useEffect(() => {
    let cancelled = false;

    // A page just left may still be saving.
    void waitForSaves()
      .then(() => Promise.all([getSectionTemplates(), getResumeProfile(), getCvLabels()]))
      .then(([templatesResponse, profileResponse, labelsResponse]) => {
        if (cancelled) return;
        load(templatesResponse.section_templates);
        setAllItemLabels(labelsByTemplate(templatesResponse.section_templates));
        loadLabels(labelsResponse.cv_labels);
        setProfile(profileResponse.profile);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) toast.error("Failed to load your section library");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [load, loadLabels]);

  // In library order, with the labels as they are here. The outline and counts may follow typing a little later.
  const labelled = useMemo(
    () =>
      templates.map((template, position) => ({
        ...template,
        position,
        item_labels: itemLabels[template.id] ?? template.item_labels ?? {},
      })),
    [templates, itemLabels]
  );
  const library = useDeferredValue(labelled);
  const counts = useMemo(() => purposeCounts(library, labels), [library, labels]);
  const sections = useMemo(() => outline(library, filter, query), [library, filter, query]);
  const carried = useMemo(() => {
    const totals = new Map<number, number>();
    Object.values(itemLabels).forEach((map) =>
      Object.values(map).forEach((ids) => ids.forEach((id) => totals.set(id, (totals.get(id) ?? 0) + 1)))
    );
    return totals;
  }, [itemLabels]);

  const selected = templates.find(({ id }) => id === selection.sectionId);
  const showsProfile = selected === undefined;

  // The server must have an item's text, and so its id, before it can be labelled.
  const labelItems = useCallback(
    async (labelId: number, on: boolean, targets: LabelTarget[]) => {
      if (!(await flush())) {
        toast.error("Your latest edit isn't saved yet, so it can't be labelled.");
        return;
      }
      try {
        await apply(labelId, on, targets);
      } catch (error) {
        console.error(error);
        toast.error(apiErrorMessage(error, "Couldn't change the labels. Try again."));
      }
    },
    [flush, apply]
  );
  const selectedLabels = selected ? itemLabels[selected.id] : undefined;
  const labelling = useMemo<SectionLabelling>(
    () => ({ labels, itemLabels: selectedLabels ?? NO_ITEM_LABELS, filter, onLabel: labelItems, onCreate: create }),
    [labels, selectedLabels, filter, labelItems, create]
  );

  // The same function, so the header's pause isn't restarted by other edits.
  const saveProfile = useCallback(
    async (draft: ResumeHeader) => setProfile((await updateResumeProfile(draft)).profile),
    []
  );

  const select = useCallback((next: LibrarySelection) => {
    setSelection(next);
    setDetailOpen(true);
    // The outline is hidden on a small screen, and focus with it.
    if (isNarrow()) requestAnimationFrame(() => detailRef.current?.focus({ preventScroll: true }));
  }, []);

  // To the top of what was chosen, or to its entry.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const detail = detailRef.current?.closest("main");
      if (!detail) return;
      const { sectionId, entryId } = selection;
      const target =
        entryId === undefined
          ? null
          : document.querySelector(`[data-section-id="${sectionId}"] [data-entry-id="${CSS.escape(entryId)}"]`);
      const top = target
        ? target.getBoundingClientRect().top - detail.getBoundingClientRect().top + detail.scrollTop - SCROLL_OFFSET
        : 0;
      detail.scrollTo({ top: Math.max(0, top) });
    });
    return () => cancelAnimationFrame(frame);
  }, [selection]);

  const back = () => {
    setDetailOpen(false);
    requestAnimationFrame(() => outlineRow(selection)?.focus());
  };

  // Only the latest order may be put back.
  const orderRequest = useRef(0);
  // Shown at once; put back if it can't be saved. Never rejects.
  const reorderSections = useCallback(
    async (ids: number[]) => {
      const before = current().map(({ id }) => id);
      const order = [...ids.filter((id) => before.includes(id)), ...before.filter((id) => !ids.includes(id))];
      if (order.every((id, index) => id === before[index])) return;

      reorder(order);
      const request = ++orderRequest.current;
      try {
        await reorderSectionTemplates(order);
      } catch (error) {
        console.error(error);
        if (request === orderRequest.current) reorder(before);
        toast.error("Couldn't save the order of your sections. Try again.");
      }
    },
    [current, reorder]
  );

  const reorderEntries = useCallback(
    (sectionId: number, ids: string[]) => change(sectionId, (draft) => ({ entries: inOrder(draft.entries, ids) })),
    [change]
  );

  const addSections = (added: SectionTemplate[]) => {
    add(added);
    added.forEach((template) => setItemLabels(template.id, template.item_labels ?? {}));
    if (added.length === 0) return;
    // So the new one is listed.
    setQuery("");
    select({ sectionId: added[0].id });
    requestAnimationFrame(() => outlineRow({ sectionId: added[0].id })?.scrollIntoView({ block: "nearest" }));
  };

  const onAddSection = async () => {
    setCreating(true);
    try {
      const response = await createSectionTemplate({ section_type: "Section" });
      addSections([response.section_template]);
    } catch (error) {
      console.error(error);
      toast.error("Failed to add section");
    } finally {
      setCreating(false);
    }
  };

  const removeTemplate = useCallback(
    async (id: number) => {
      const order = current().map((template) => template.id);
      const index = order.indexOf(id);
      try {
        await remove(id, deleteSectionTemplate(id));
        toast.success("Section deleted");
        const neighbour = order[index + 1] ?? order[index - 1] ?? null;
        setSelection((shown) => (shown.sectionId === id ? { sectionId: neighbour } : shown));
        // The dialog's button is gone, and the section with it.
        requestAnimationFrame(() => {
          if (document.activeElement === document.body) outlineRow({ sectionId: neighbour })?.focus();
        });
      } catch (error) {
        console.error(error);
        toast.error("Failed to delete section");
      }
    },
    [current, remove]
  );

  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader />
      </div>
    );
  }

  return (
    <LibraryWorkspace
      detailOpen={detailOpen}
      onBack={back}
      header={
        <>
          <NextLink
            href="/resume"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-4" />
            CVs
          </NextLink>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <Title>Section library</Title>
              <Description className="mt-1">
                Write each section once, then reuse it in any CV.
              </Description>
            </div>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileUpIcon />
              Import from CV
            </Button>
          </div>
          <ImportCvDialog
            open={importOpen}
            onClose={() => setImportOpen(false)}
            onApplied={({ section_templates, profile: nextProfile }) => {
              addSections(section_templates);
              setProfile(nextProfile);
              setHeaderVersion((version) => version + 1);
              const count = section_templates.length;
              toast.success(count > 0 ? `Added ${count} ${count === 1 ? "section" : "sections"} from your CV` : "Profile updated");
            }}
          />
        </>
      }
      side={
        <>
          <PurposeList
            labels={labels}
            counts={counts}
            carried={carried}
            filter={filter}
            onFilter={setFilter}
            onCreate={create}
            onRename={rename}
            onDelete={removeLabel}
          />
          <LibraryOutline
            sections={sections}
            selected={showsProfile ? { sectionId: null } : selection}
            onSelect={select}
            onReorderSections={reorderSections}
            onReorderEntries={reorderEntries}
            query={query}
            onQuery={setQuery}
            filtered={filter.kind !== "all"}
          />
          <div className="px-3 pb-6">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => void onAddSection()}
              disabled={creating}
            >
              <PlusIcon />
              Add section
            </Button>
          </div>
        </>
      }
    >
      <div ref={detailRef} tabIndex={-1} className="space-y-8 outline-none">
        {/* Kept mounted, so an edit still waiting to save isn't lost when another section is chosen. */}
        <div hidden={!showsProfile}>
          <HeaderDocument
            version={headerVersion}
            value={profile}
            save={saveProfile}
          />
        </div>

        {selected && (
          <LibrarySection
            key={selected.id}
            template={selected}
            versions={versions[selected.id]}
            onChange={change}
            onDelete={removeTemplate}
            labelling={labelling}
          />
        )}
      </div>
    </LibraryWorkspace>
  );
};

export default SectionLibraryPage;
