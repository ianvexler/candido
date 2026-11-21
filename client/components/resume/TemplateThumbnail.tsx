import { DesignTemplate } from "@/lib/resume/design";

// Grey text lines, the accent for names and headings.
const LINE = "#c4c4cc";

const Lines = ({ x, y, widths, gap = 3.4 }: { x: number; y: number; widths: number[]; gap?: number }) => (
  <>
    {widths.map((width, index) => (
      <rect key={index} x={x} y={y + index * gap} width={width} height={1.4} rx={0.7} fill={LINE} />
    ))}
  </>
);

/** A heading in the accent with a faint rule, as Classic headings print. */
const Heading = ({ x, y, width, accent }: { x: number; y: number; width: number; accent: string }) => (
  <>
    <rect x={x} y={y} width={width * 0.35} height={1.6} rx={0.8} fill={accent} />
    <rect x={x} y={y + 3} width={width} height={0.5} fill={accent} opacity={0.25} />
  </>
);

/**
 * A small sketch of a page in the template's layout, tinted with the resume's
 * accent colour. Decorative: the button around it carries the name.
 */
const TemplateThumbnail = ({ template, accent }: { template: DesignTemplate; accent: string }) => (
  <svg viewBox="0 0 60 84" className="h-auto w-full" aria-hidden>
    <rect width={60} height={84} fill="white" />
    {template === "sidebar" ? (
      <>
        <rect width={20} height={84} fill={accent} opacity={0.1} />
        <rect x={4} y={7} width={12} height={2.6} rx={1.3} fill={accent} />
        <Lines x={4} y={12.5} widths={[10, 11, 8]} gap={3} />
        <Heading x={4} y={25} width={12} accent={accent} />
        <Lines x={4} y={31} widths={[9, 11, 7, 10]} gap={3} />
        <Heading x={4} y={46} width={12} accent={accent} />
        <Lines x={4} y={52} widths={[11, 8]} gap={3} />
        <Heading x={25} y={7} width={30} accent={accent} />
        <Lines x={25} y={13} widths={[22, 30, 27, 29]} />
        <Lines x={25} y={28} widths={[18, 30, 25]} />
        <Heading x={25} y={41} width={30} accent={accent} />
        <Lines x={25} y={47} widths={[20, 29, 26]} />
      </>
    ) : (
      <>
        <rect x={7} y={7} width={24} height={3.2} rx={1.6} fill={accent} />
        <Lines x={7} y={13} widths={[38]} />
        <Heading x={7} y={20} width={46} accent={accent} />
        <Lines x={7} y={26} widths={[30, 46, 42, 44]} />
        <Lines x={7} y={41} widths={[26, 46, 38]} />
        <Heading x={7} y={53} width={46} accent={accent} />
        <Lines x={7} y={59} widths={[28, 44, 40]} />
      </>
    )}
  </svg>
);

export default TemplateThumbnail;
