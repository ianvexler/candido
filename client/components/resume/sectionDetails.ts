import { SectionDetails } from "@/lib/types";

/** Section types that start with the role/organisation/dates row open. */
const DETAIL_TYPE_PATTERN = /experience|education|employment|work|job|project|volunteer|intern|position|study|studies/i;

export const suggestsDetails = (sectionType: string) => DETAIL_TYPE_PATTERN.test(sectionType);

export const hasDetails = (details: SectionDetails) =>
  Boolean(
    details.role?.trim() ||
      details.organization?.trim() ||
      details.location?.trim() ||
      details.start_date ||
      details.end_date ||
      details.current
  );

/** "2022-03-01" → "2022-03" for <input type="month">. */
export const toMonthInput = (date: string | null) => (date ? date.slice(0, 7) : "");

/** "2022-03" → "2022-03-01"; anything else → null. */
export const fromMonthInput = (value: string) => (/^\d{4}-\d{2}$/.test(value) ? `${value}-01` : null);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2022-03-01" → "Mar 2022". Parsed by hand so time zones can't shift the month. */
export const formatMonth = (date: string) => {
  const [year, month] = date.split("-").map(Number);
  return `${MONTHS[month - 1]} ${year}`;
};

/** "Mar 2022 – Present", "Mar 2022 – Jan 2024", or whichever end is known. */
export const formatDateRange = ({ start_date, end_date, current }: SectionDetails) => {
  const start = start_date ? formatMonth(start_date) : null;
  const end = current ? "Present" : end_date ? formatMonth(end_date) : null;
  if (start && end) return start === end ? start : `${start} – ${end}`;
  return start ?? end ?? "";
};
