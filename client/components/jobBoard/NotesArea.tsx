import { Note } from "@/lib/types";
import Loader from "@/components/common/Loader";
import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "../ui/Button";
import { format } from "date-fns";
import { createNote } from "@/api/resources/notes/createNote";
import { Textarea } from "../ui/Textarea";

interface NotesAreaProps {
  jobId: number;
  notes: Note[];
  loading: boolean;
  onNoteAdded: (note: Note) => void;
}

const NotesArea = ({ jobId, notes, loading, onNoteAdded }: NotesAreaProps) => {
  const [newNoteContent, setNewNoteContent] = useState<string>("");
  const [isAddingNote, setIsAddingNote] = useState<boolean>(false);

  const handleAddNote = () => {
    setIsAddingNote(true);
    void createNote(jobId, newNoteContent)
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
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
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
        <ul className="flex flex-col gap-4">
          {[...notes]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .map((note) => (
              <li key={note.id} className="min-w-0 border-l-2 border-candido pl-3">
                <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  {format(new Date(note.created_at), "d MMM yyyy")}
                </p>
                <p className="mt-1 text-sm break-words whitespace-pre-line">{note.content}</p>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
};

export default NotesArea;
