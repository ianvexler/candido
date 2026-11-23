import InlineInput from "@/components/ui/InlineInput";
import { JobFieldValues } from "@/lib/jobBoard/jobFields";
import { SetJobField } from "@/lib/jobBoard/useJobFields";
import { JobBoardEntry } from "@/lib/types";
import { ComponentProps, ReactNode } from "react";
import TagsInput from "../TagsInput";
import StatusSelect from "./StatusSelect";

interface PanelFieldsProps {
  fields: JobFieldValues;
  setField: SetJobField;
  allEntries: JobBoardEntry[];
  disabled: boolean;
  showErrors: boolean;
}

const Field = ({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) => (
  <div className="flex flex-col gap-2">
    <PanelLabel htmlFor={htmlFor}>{label}</PanelLabel>
    {children}
  </div>
);

export const PanelLabel = ({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) => {
  const className = "text-xs font-medium uppercase tracking-wider text-muted-foreground";
  return htmlFor ? (
    <label htmlFor={htmlFor} className={className}>
      {children}
    </label>
  ) : (
    <h3 className={className}>{children}</h3>
  );
};

/** A job's details in its side panel, under its title. */
const PanelFields = ({ fields, setField, allEntries, disabled, showErrors }: PanelFieldsProps) => {
  const missingCompany = showErrors && !fields.company.trim();
  const input = (
    field: "company" | "location" | "closingDate" | "salary" | "url",
    props: ComponentProps<typeof InlineInput> = {}
  ) => (
    <InlineInput
      id={field}
      autoComplete="off"
      value={fields[field]}
      onChange={(event) => setField(field, event.target.value)}
      disabled={disabled}
      {...props}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[2fr_1fr]">
        <Field label="Company" htmlFor="company">
          <div className="flex flex-col gap-1">
            {input("company", {
              placeholder: "Company name...",
              "aria-invalid": missingCompany || undefined,
              className: missingCompany ? "border-red-500!" : undefined,
            })}
            {missingCompany && <p className="text-xs text-red-500">Company is required</p>}
          </div>
        </Field>
        <Field label="Status" htmlFor="status">
          <StatusSelect
            value={fields.status}
            onChange={(status) => setField("status", status)}
            disabled={disabled}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <Field label="Location" htmlFor="location">
          {input("location", { placeholder: "e.g. Remote, New York" })}
        </Field>
        <Field label="Closing date" htmlFor="closingDate">
          {input("closingDate", { type: "date" })}
        </Field>
        <Field label="Salary" htmlFor="salary">
          {input("salary", { placeholder: "e.g. $120k - $150k" })}
        </Field>
      </div>

      <Field label="URL" htmlFor="url">
        {input("url", { placeholder: "https://example.com" })}
      </Field>
      <Field label="Tags">
        <TagsInput allEntries={allEntries} tags={fields.tags} onTagsChange={(tags) => setField("tags", tags)} />
      </Field>
    </div>
  );
};

export default PanelFields;
