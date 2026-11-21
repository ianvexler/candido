import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/Tabs"
import EntryDocCard from "./EntryDocCard";
import { JobBoardEntry } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { formatDistanceToNow } from "date-fns";
import { SparklesIcon } from "lucide-react";
import NextLink from "next/link";
import { useState } from "react";
import TailorCvDialog from "./TailorCvDialog";

interface EntryDocAreaProps {
  entry: JobBoardEntry;
  onUpdateEntry: (entry: JobBoardEntry) => void;
}

const EntryDocArea = ({ entry, onUpdateEntry }: EntryDocAreaProps) => {
  const [tailoring, setTailoring] = useState(false);
  const tailored = entry.tailored_curriculums ?? [];

  return (
    <Tabs defaultValue="cv" className="w-full">
      <TabsList>
        <TabsTrigger value="cv">CV</TabsTrigger>
        <TabsTrigger value="cover-letter">Cover Letter</TabsTrigger>
        <TabsTrigger value="tailored">Tailored CVs</TabsTrigger>
      </TabsList>

      <TabsContent value="cv">
        <EntryDocCard type="CV" entry={entry} onUpdateEntry={onUpdateEntry} />
      </TabsContent>

      <TabsContent value="cover-letter">
        <EntryDocCard type="Cover Letter" entry={entry} onUpdateEntry={onUpdateEntry} />
      </TabsContent>

      <TabsContent value="tailored">
        <div className="space-y-3">
          {tailored.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Make a copy of one of your CVs for this job and get suggestions to fit it.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {tailored.map((curriculum) => (
                <li key={curriculum.id}>
                  <NextLink
                    href={`/resume/${curriculum.id}`}
                    className="flex flex-col px-4 py-3 hover:bg-muted/50"
                  >
                    <span className="truncate text-sm font-medium">{curriculum.title}</span>
                    <span className="text-xs text-muted-foreground">
                      Edited {formatDistanceToNow(new Date(curriculum.updated_at), { addSuffix: true })}
                    </span>
                  </NextLink>
                </li>
              ))}
            </ul>
          )}
          <Button onClick={() => setTailoring(true)}>
            <SparklesIcon />
            Tailor a CV
          </Button>
        </div>
        <TailorCvDialog open={tailoring} onClose={() => setTailoring(false)} entry={entry} />
      </TabsContent>
    </Tabs>
  )
}

export default EntryDocArea;