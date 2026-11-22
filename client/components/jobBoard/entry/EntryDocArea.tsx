import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/Tabs"
import DocSlot from "./DocSlot";
import { EntryPatch } from "@/lib/jobBoard/docSlot";
import { JobBoardEntry } from "@/lib/types";

interface EntryDocAreaProps {
  entry: JobBoardEntry;
  onPatchEntry: (id: number, patch: EntryPatch) => void;
  /** Wraps document actions that leave the page. */
  beforeLeave?: (action: () => void) => void;
}

const EntryDocArea = ({ entry, onPatchEntry, beforeLeave }: EntryDocAreaProps) => {
  return (
    <Tabs defaultValue="cv" className="w-full">
      <TabsList>
        <TabsTrigger value="cv">CV</TabsTrigger>
        <TabsTrigger value="cover-letter">Cover letter</TabsTrigger>
      </TabsList>

      <TabsContent value="cv">
        <DocSlot kind="cv" entry={entry} onPatchEntry={onPatchEntry} beforeLeave={beforeLeave} />
      </TabsContent>

      <TabsContent value="cover-letter">
        <DocSlot kind="cover_letter" entry={entry} onPatchEntry={onPatchEntry} />
      </TabsContent>

    </Tabs>
  )
}

export default EntryDocArea;