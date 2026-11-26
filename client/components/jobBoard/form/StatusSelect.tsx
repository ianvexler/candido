import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { JobStatus } from "@/lib/types";
import { capitalize } from "@/lib/utils";

interface StatusSelectProps {
  value: JobStatus;
  onChange: (status: JobStatus) => void;
  disabled: boolean;
  className: string;
}

const StatusSelect = ({ value, onChange, disabled, className }: StatusSelectProps) => (
  <Select value={value} onValueChange={(status) => onChange(status as JobStatus)} disabled={disabled}>
    <SelectTrigger id="status" aria-label="Status" className={className}>
      <SelectValue />
    </SelectTrigger>
    <SelectContent position="popper">
      <SelectGroup>
        {Object.values(JobStatus).map((status) => (
          <SelectItem key={status} value={status}>
            {capitalize(status.toLowerCase())}
          </SelectItem>
        ))}
      </SelectGroup>
    </SelectContent>
  </Select>
);

export default StatusSelect;
