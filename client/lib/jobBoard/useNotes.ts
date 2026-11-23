import { getNotes } from "@/api/resources/notes/getNotes";
import { Note } from "@/lib/types";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

/** Each opened job's notes, loaded the first time it's opened. A job that hasn't loaded is missing. */
export const useNotes = (openId: number | undefined) => {
  const [notes, setNotes] = useState<Record<number, Note[]>>({});
  const requested = useRef(new Set<number>());

  useEffect(() => {
    if (openId === undefined || requested.current.has(openId)) return;
    requested.current.add(openId);
    getNotes(openId)
      .then((response) => setNotes((prev) => ({ ...prev, [openId]: response.notes })))
      .catch((error) => {
        console.error(error);
        toast.error("Failed to get notes");
        // Tried again the next time it's opened.
        requested.current.delete(openId);
        setNotes((prev) => ({ ...prev, [openId]: [] }));
      });
  }, [openId]);

  const addNote = useCallback(
    (id: number, note: Note) => setNotes((prev) => ({ ...prev, [id]: [...(prev[id] ?? []), note] })),
    []
  );

  return { notes, addNote };
};
