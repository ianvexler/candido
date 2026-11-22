import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/Tabs"
import CvSlot from "./CvSlot";
import EntryDocCard from "./EntryDocCard";
import { JobBoardEntry } from "@/lib/types";

interface EntryDocAreaProps {
  entry: JobBoardEntry;
  onUpdateEntry: (entry: JobBoardEntry) => void;
  /** Wraps CV actions that leave the page. */
  beforeLeave?: (action: () => void) => void;
}

const EntryDocArea = ({ entry, onUpdateEntry, beforeLeave }: EntryDocAreaProps) => {
  return (
    <Tabs defaultValue="cv" className="w-full">
      <TabsList>
        <TabsTrigger value="cv">CV</TabsTrigger>
        <TabsTrigger value="cover-letter">Cover Letter</TabsTrigger>
      </TabsList>

      <TabsContent value="cv">
        <CvSlot entry={entry} onUpdateEntry={onUpdateEntry} beforeLeave={beforeLeave} />
      </TabsContent>

      <TabsContent value="cover-letter">
        <EntryDocCard type="Cover Letter" entry={entry} onUpdateEntry={onUpdateEntry} />
      </TabsContent>

    </Tabs>
  )
}

export default EntryDocArea;