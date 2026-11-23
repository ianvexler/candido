import { JobBoardEntry, Note } from "@/lib/types";
import Loader from "@/components/common/Loader";
import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "../ui/Button";
import { format } from "date-fns";
import { createNote } from "@/api/resources/notes/createNote";
import { Textarea } from "../ui/Textarea";

interface NotesAreaProps {
  jobBoardEntry: JobBoardEntry | null;
  notes: Note[];
  loading: boolean;
  onNoteAdded: (note: Note) => void;
}

const NotesArea = ({ jobBoardEntry, notes, loading, onNoteAdded }: NotesAreaProps) => {
  const [newNoteContent, setNewNoteContent] = useState<string>("");
  const [isAddingNote, setIsAddingNote] = useState<boolean>(false);

  const handleAddNote = () => {
    if (!jobBoardEntry) {
      return
    };

    setIsAddingNote(true);
    void createNote(jobBoardEntry.id, newNoteContent)
      .then((response) => {
        onNoteAdded(response.note);
        setNewNoteContent("");
      })
      .catch((error) => {
        console.error(error);
        toast.error("Failed to add note");
      })
      .finally(() => setIsAddingNote(false));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        <Textarea
          value={newNoteContent}
          onChange={(e) => setNewNoteContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (newNoteContent.trim().length > 0) handleAddNote();
            }
          }}
          placeholder="Add a note"
          disabled={isAddingNote}
          className="min-h-10 flex-1 resize-none"
          rows={1}
        />

        {newNoteContent.trim().length > 0 && (
          <Button type="button" onClick={handleAddNote} disabled={isAddingNote}>
            {isAddingNote ? "Adding…" : "Add"}
          </Button>
        )}
      </div>

      {notes.length > 0 && (
        <ul className="divide-y divide-border">
          {notes.map((note) => (
            <li key={note.id} className="flex items-baseline justify-between gap-4 py-2.5 text-sm first:pt-0 last:pb-0">
              <p className="min-w-0 break-words whitespace-pre-line">{note.content}</p>
              <p className="shrink-0 text-xs text-muted-foreground">{format(new Date(note.created_at), "d MMM yyyy")}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default NotesArea;