import { SectionEntry, SectionFields, SectionPlacement } from "@/lib/types";
import { listItems, parseHtml, setItemsOff } from "./items";
import { markPending, markSettled, trackSave } from "./saveTracker";
import { cleanFields, emptyEntry, endsBeforeStart } from "./sectionEntries";

const SAVE_DELAY_MS = 600;

/** What can be edited. Library sections have no `hidden` or `placement`. */
export type SectionDraft = SectionFields & { hidden?: boolean; placement?: SectionPlacement | null };
export type SectionPatch = Partial<SectionFields & { hidden: boolean; placement: SectionPlacement | null }>;
/** A function gets the latest draft, which may be newer than what is rendered. */
export type SectionChange = SectionPatch | ((current: SectionDraft) => SectionPatch);

/** The entry editor a change comes from, and the version it shows. */
export type EntryEditor = { entryId: string; version: number };
/** By entry id. Goes up (from 0) when an entry's editor has to be remounted to show its text. */
export type EntryVersions = Record<string, number>;

interface DraftsOptions<T> {
  /** Persists the changed fields and resolves with the saved record. */
  save: (section: T, patch: SectionPatch) => Promise<T>;
  /** `versions` is by section id. */
  onChange: (sections: T[], versions: Record<number, EntryVersions>) => void;
  onError: (error: unknown) => void;
  /** True while text is being composed (IME), so nothing may be remounted. */
  busy?: () => boolean;
  delayMs?: number;
}

interface Draft<T> {
  current: T;
  /** As the server has it. */
  saved: T;
  versions: EntryVersions;
  /** The version since which an entry's text isn't what its earlier editors show. */
  replacedAt: EntryVersions;
  timer?: ReturnType<typeof setTimeout>;
  /** The pause is over, but the save has to wait for a request. */
  due: boolean;
  request: Promise<boolean> | null;
  /** A deletion in progress, which saves wait for. Never rejects. */
  deletion: Promise<unknown> | null;
  removed: boolean;
  /** How often `replace` was called. */
  replaced: number;
  editKey: string;
}

const ENTRY_KEYS = Object.keys(emptyEntry()) as (keyof SectionEntry)[];

/** Browsers and the server write the same styles and entities differently. */
const parsed = (html: string) => {
  const container = parseHtml(html);
  container.querySelectorAll<HTMLElement>("[style]").forEach((node) => {
    node.setAttribute("style", node.style.cssText);
  });
  return container;
};

const sameValue = (key: keyof SectionEntry, a: SectionEntry, b: SectionEntry) =>
  a[key] === b[key] || (key === "content" && parsed(a.content).isEqualNode(parsed(b.content)));

const sameEntry = (a: SectionEntry, b: SectionEntry) => ENTRY_KEYS.every((key) => sameValue(key, a, b));

const sameEntries = (a: SectionEntry[], b: SectionEntry[]) =>
  a.length === b.length && a.every((entry, index) => sameEntry(entry, b[index]));

const clean = (section: SectionFields) => cleanFields(section.section_type, section.entries);

const sameSection = (a: SectionFields, b: SectionFields) =>
  a.section_type === b.section_type && sameEntries(a.entries, b.entries);

const withEntry = <T extends SectionFields>(section: T): T =>
  section.entries.length > 0 ? section : { ...section, entries: [emptyEntry()] };

const byId = (entries: SectionEntry[], id: string) => entries.find((entry) => entry.id === id);

const allOn = (html: string) => setItemsOff(html, listItems(html).map((item) => item.id), false);

// A CV's section's own settings.
const OWN_KEYS = ["hidden", "placement"] as const;

/** What to send, or null. A section with an invalid date range isn't sent; the editor says so. */
const unsaved = (current: SectionDraft, saved: SectionDraft): SectionPatch | null => {
  const patch: SectionPatch = {};
  if (!current.entries.some(endsBeforeStart)) {
    const fields = clean(current);
    if (!sameSection(fields, clean(saved))) Object.assign(patch, fields);
  }
  OWN_KEYS.forEach((key) => {
    if (current[key] !== saved[key]) Object.assign(patch, { [key]: current[key] });
  });
  return Object.keys(patch).length > 0 ? patch : null;
};

/** The entries on screen, with what the server stored differently from what it was sent. */
const takeStored = (shown: SectionEntry[], sent: SectionEntry[], stored: SectionEntry[]): SectionEntry[] => {
  const sameIds = stored.length === sent.length && stored.every((entry, index) => entry.id === sent[index].id);
  if (!sameIds) return stored;
  return shown.map((entry, index) => {
    const keys = ENTRY_KEYS.filter((key) => !sameValue(key, stored[index], sent[index]));
    return Object.assign({ ...entry }, ...keys.map((key) => ({ [key]: stored[index][key] })));
  });
};

/** The new record's entries, with unsaved edits of entries that it doesn't change. */
const keepUnsaved = (shown: SectionEntry[], saved: SectionEntry[], next: SectionEntry[]): SectionEntry[] => [
  ...next.flatMap((entry) => {
    const before = byId(saved, entry.id);
    const now = byId(shown, entry.id);
    if (!now) return before && sameEntry(entry, before) ? [] : [entry];
    return sameEntry(entry, now) || (before && sameEntry(entry, before)) ? [now] : [entry];
  }),
  ...shown.filter(({ id }) => !byId(saved, id) && !byId(next, id)),
];

let instances = 0;

/**
 * Holds a page's sections as edited and saves them after a pause, one request at
 * a time per section. Edits stay until saved; a failed save is tried again on the
 * section's next change or flush.
 */
export const createDrafts = <T extends SectionDraft & { id: number }>({
  save,
  onChange,
  onError,
  busy = () => false,
  delayMs = SAVE_DELAY_MS,
}: DraftsOptions<T>) => {
  const instance = ++instances;
  let drafts: Draft<T>[] = [];
  let lastVersion = 0;

  const find = (id: number) => drafts.find((draft) => draft.current.id === id);

  const notify = () =>
    onChange(
      drafts.map((draft) => draft.current),
      Object.fromEntries(drafts.map((draft) => [draft.current.id, draft.versions]))
    );

  const newDraft = (record: T): Draft<T> => {
    const section = withEntry(record);
    return {
      current: section,
      saved: section,
      versions: {},
      replacedAt: {},
      due: false,
      request: null,
      deletion: null,
      removed: false,
      replaced: 0,
      editKey: `sections-${instance}-${section.id}:edit`,
    };
  };

  /** Sets what is shown, remounting the editors that can't show it themselves. */
  const show = (draft: Draft<T>, next: T, options: { editor?: EntryEditor; stale?: boolean } = {}) => {
    const { editor, stale = true } = options;
    const before = draft.current.entries;
    draft.current = next;
    next.entries.forEach((entry) => {
      const old = byId(before, entry.id);
      if (!old || old === entry || entry.id === editor?.entryId) return;
      const content = old.content !== entry.content;
      // Months are kept as typed in the editor.
      if (!content && old.start_date === entry.start_date && old.end_date === entry.end_date) return;

      draft.versions = { ...draft.versions, [entry.id]: ++lastVersion };
      // Ticks are merged into what an editor reports, so a late keystroke can stay.
      if (stale && content && allOn(old.content) !== allOn(entry.content)) {
        draft.replacedAt[entry.id] = lastVersion;
      }
    });
  };

  const stopWaiting = (draft: Draft<T>) => {
    clearTimeout(draft.timer);
    draft.timer = undefined;
    draft.due = false;
  };

  const schedule = (draft: Draft<T>) => {
    stopWaiting(draft);
    markPending(draft.editKey);
    draft.timer = setTimeout(() => {
      draft.timer = undefined;
      run(draft);
    }, delayMs);
  };

  const run = (draft: Draft<T>) => {
    if (draft.request || draft.deletion) draft.due = true;
    else void send(draft);
  };

  /** Resolves false if the save failed. */
  const send = (draft: Draft<T>): Promise<boolean> => {
    stopWaiting(draft);
    const patch = draft.removed ? null : unsaved(draft.current, draft.saved);
    if (!patch) {
      markSettled(draft.editKey);
      return Promise.resolve(true);
    }

    const sent = draft.current;
    const replaced = draft.replaced;
    const request = trackSave(
      `section-${sent.id}`,
      save(sent, patch).then(
        (record) => {
          settle(draft, sent, replaced, record);
          return true;
        },
        (error) => {
          // Perhaps only because it is being deleted. If not, it's sent again after.
          if (draft.deletion) draft.due = true;
          else if (!draft.removed) onError(error);
          return false;
        }
      )
    ).finally(() => {
      draft.request = null;
      if (draft.due) run(draft);
    });
    markSettled(draft.editKey);
    draft.request = request;
    return request;
  };

  const settle = (draft: Draft<T>, sent: T, replaced: number, response: T) => {
    if (draft.removed) return;
    const record = withEntry(response);
    const { current } = draft;

    if (replaced !== draft.replaced) {
      // The rest is newer than this response.
      const { section_type, entries, hidden, placement } = record;
      draft.saved = { ...draft.saved, section_type, entries, hidden, placement };
      if (unsaved(current, draft.saved)) schedule(draft);
      return;
    }

    draft.saved = record;
    const next = { ...record, section_type: current.section_type, entries: current.entries };
    OWN_KEYS.forEach((key) => {
      if (current[key] !== sent[key]) Object.assign(next, { [key]: current[key] });
    });
    const before = clean(sent);
    // One with an invalid date range wasn't sent.
    const wasSent = !sent.entries.some(endsBeforeStart);
    if (wasSent && !busy() && sameSection(clean(current), before)) {
      if (record.section_type !== before.section_type) next.section_type = record.section_type;
      next.entries = takeStored(current.entries, before.entries, record.entries);
    }
    show(draft, next, { stale: false });
    notify();
  };

  const flushOne = async (draft: Draft<T>): Promise<boolean> => {
    while (!draft.removed) {
      if (draft.request) await draft.request;
      else if (draft.deletion) await draft.deletion;
      else {
        if (!unsaved(draft.current, draft.saved)) break;
        if (!(await send(draft))) return false;
      }
    }
    stopWaiting(draft);
    markSettled(draft.editKey);
    return true;
  };

  /** Saves everything now. Resolves false if something couldn't be saved. */
  const flush = async () => (await Promise.all(drafts.map(flushOne))).every(Boolean);

  return {
    flush,

    /** Starts over with these. What was still unsaved is sent. */
    load: (sections: T[]) => {
      void flush();
      drafts = sections.map(newDraft);
      notify();
    },

    change: (id: number, change: SectionChange, editor?: EntryEditor) => {
      const draft = find(id);
      if (!draft) return;
      const { current } = draft;
      const patch = typeof change === "function" ? change(current) : change;
      const next: T = { ...current, ...patch };
      if (editor && editor.version < (draft.replacedAt[editor.entryId] ?? 0)) {
        next.entries = next.entries.map((entry) => {
          const shown = byId(current.entries, entry.id);
          return entry.id === editor.entryId && shown ? { ...entry, content: shown.content } : entry;
        });
      }
      show(draft, next, { editor });
      schedule(draft);
      notify();
    },

    /**
     * Shows a record from the server, added at the end if it's new. Unsaved edits
     * of entries that the record changes are lost: flush before asking for it.
     */
    replace: (section: T) => {
      const draft = find(section.id);
      if (!draft) {
        drafts = [...drafts, newDraft(section)];
        notify();
        return;
      }
      const record = withEntry(section);
      const { current, saved } = draft;
      const next = { ...record, entries: keepUnsaved(current.entries, saved.entries, record.entries) };
      if (current.section_type !== saved.section_type && record.section_type === saved.section_type) {
        next.section_type = current.section_type;
      }
      OWN_KEYS.forEach((key) => {
        if (current[key] !== saved[key] && record[key] === saved[key]) Object.assign(next, { [key]: current[key] });
      });
      draft.replaced += 1;
      draft.saved = record;
      show(draft, next);
      if (unsaved(next, record)) schedule(draft);
      notify();
    },

    /** Adds those that aren't here yet. */
    add: (sections: T[]) => {
      drafts = [...drafts, ...sections.filter(({ id }) => !find(id)).map(newDraft)];
      notify();
    },

    reorder: (ids: number[]) => {
      const place = ({ current }: Draft<T>) => (ids.includes(current.id) ? ids.indexOf(current.id) : ids.length);
      drafts = [...drafts].sort((a, b) => place(a) - place(b));
      notify();
    },

    /**
     * Removes it, unsaved edits included, once `deletion` is done; saves wait until
     * then. If that fails, so does this, and the edits are saved after all.
     */
    remove: async (id: number, deletion: Promise<unknown> = Promise.resolve()) => {
      const draft = find(id);
      if (!draft) return void (await deletion);

      draft.deletion = deletion.catch(() => undefined);
      try {
        await deletion;
      } catch (error) {
        draft.deletion = null;
        if (draft.due) run(draft);
        throw error;
      }
      draft.deletion = null;
      draft.removed = true;
      stopWaiting(draft);
      markSettled(draft.editKey);
      drafts = drafts.filter((item) => item !== draft);
      notify();
    },

    /** Sends what is still unsaved. */
    dispose: () => void flush(),
  };
};
