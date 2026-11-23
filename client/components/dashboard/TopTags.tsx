import { JobBoardEntriesStats } from "@/lib/types";

interface TopTagsProps {
  tags: JobBoardEntriesStats["top_tags"];
}

const TopTags = ({ tags }: TopTagsProps) => {
  const used = tags.filter((tag) => tag.count > 0);
  if (used.length === 0) {
    return <p className="text-sm text-muted-foreground">Tag your jobs to see what you apply for most.</p>;
  }

  const max = Math.max(...used.map((tag) => tag.count));

  return (
    <ul className="space-y-3 text-sm">
      {used.map((tag) => (
        <li key={tag.name}>
          <div className="mb-1 flex justify-between gap-3">
            <span className="truncate">{tag.name}</span>
            <span className="tabular-nums text-muted-foreground">{tag.count}</span>
          </div>
          <div className="h-2 rounded-r-sm bg-candido/20" aria-hidden>
            <div className="h-full rounded-r-sm bg-candido" style={{ width: `${(tag.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
};

export default TopTags;
