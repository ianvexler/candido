import { useEffect, useMemo, useState, useCallback, ChangeEvent } from "react";
import debounce from "lodash.debounce";
import { JobBoardEntry, JobStatus } from "@/lib/types";

type SavedFilters = {
  search: string;
  tags: string[];
  showRejected: boolean;
  showArchived: boolean;
  statusFilter: JobStatus[];
};

// Kept while the app is open, so going back from a job shows the same list.
const savedFilters = new Map<string, SavedFilters>();

export const useBoardFilters = (
  /** Names the page, so each keeps its own filters. */
  page: string,
  jobBoardEntries: JobBoardEntry[],
  setJobBoardEntries: React.Dispatch<React.SetStateAction<JobBoardEntry[]>>
) => {
  const [searchInput, setSearchInput] = useState(() => savedFilters.get(page)?.search ?? "");
  const [search, setSearch] = useState(() => savedFilters.get(page)?.search ?? "");
  const [tags, setTags] = useState<string[]>(() => savedFilters.get(page)?.tags ?? []);
  const [showRejected, setShowRejected] = useState(() => savedFilters.get(page)?.showRejected ?? false);
  const [showArchived, setShowArchived] = useState(() => savedFilters.get(page)?.showArchived ?? false);

  const [statusFilter, setStatusFilter] = useState<JobStatus[]>(() => savedFilters.get(page)?.statusFilter ?? []);

  useEffect(() => {
    savedFilters.set(page, { search: searchInput, tags, showRejected, showArchived, statusFilter });
  }, [page, searchInput, tags, showRejected, showArchived, statusFilter]);

  const debouncedSetSearch = useMemo(() => debounce(
      ((value: string) => setSearch(value)) as (...args: unknown[]) => unknown, 300
  ), []);

  const handleSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setSearchInput(value);

      debouncedSetSearch(value);
  }, [debouncedSetSearch]);

  const handleTagToggle = useCallback((tagName: string, checked: boolean) => {
    setTags((prev) =>
      checked ? [...prev, tagName] : prev.filter((t) => t !== tagName)
    );
  }, []);

  const handleClearTags = useCallback(() => {
    setTags([]);
  }, []);

  const handleToggleRejected = useCallback(() => {
    setShowRejected((prev) => {
      if (prev) {
        setJobBoardEntries((entries) =>
          entries.filter((e) => e.status !== JobStatus.REJECTED)
        );
      }
      return !prev;
    });
  }, [setJobBoardEntries]);

  const handleToggleArchived = useCallback(() => {
    setShowArchived((prev) => {
      if (prev) {
        setJobBoardEntries((entries) =>
          entries.filter((e) => e.status !== JobStatus.ARCHIVED)
        );
      }
      return !prev;
    });
  }, [setJobBoardEntries]);

  const filteredEntries = useMemo(() => {
    let result = jobBoardEntries;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.company.toLowerCase().includes(q)
      );
    }

    if (tags.length > 0) {
      result = result.filter((e) =>
        e.job_board_tags?.some((t) => tags.includes(t.name))
      );
    }
    return result;
  }, [jobBoardEntries, search, tags]);

  return {
    searchInput,
    handleSearchChange,
    tags,
    handleTagToggle,
    handleClearTags,
    showRejected,
    handleToggleRejected,
    showArchived,
    handleToggleArchived,
    statusFilter,
    setStatusFilter,
    filteredEntries,
  };
}
