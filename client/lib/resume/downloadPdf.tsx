import toast, { Toast } from "react-hot-toast";

/** The file's name from the server's Content-Disposition: filename* first, for names that aren't plain ASCII. */
export const fileNameOf = (disposition: string | null): string => {
  const exact = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (exact) {
    try {
      return decodeURIComponent(exact);
    } catch {
      // Falls back to the plain name.
    }
  }
  return disposition?.match(/filename="([^"]+)"/i)?.[1] ?? "CV.pdf";
};

/** Asks the server for the CV's PDF and saves it, staying on the page. Throws if it wasn't made. */
export const downloadPdf = async (curriculumId: number | string) => {
  const response = await fetch(`/resume/${curriculumId}/pdf`, { credentials: "include" });
  if (!response.ok) throw new Error(`PDF ${response.status}`);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = fileNameOf(response.headers.get("Content-Disposition"));
  document.body.append(link);
  link.click();
  link.remove();
  // Chrome may still be reading it as the download starts: freed well after.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

/** When the server couldn't make it: the print view still can, through the browser's own dialog. */
export const pdfFailed = (curriculumId: number | string) => {
  const Failed = ({ id }: Pick<Toast, "id">) => (
    <span className="flex items-center gap-3">
      Couldn&apos;t make the PDF.
      <button
        type="button"
        className="cursor-pointer font-medium underline"
        onClick={() => {
          window.open(`/resume/${curriculumId}/print`, "_blank");
          toast.dismiss(id);
        }}
      >
        Open print view
      </button>
    </span>
  );
  toast.error((t) => <Failed id={t.id} />);
};
