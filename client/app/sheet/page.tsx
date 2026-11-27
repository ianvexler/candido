import { redirect } from "next/navigation";

interface SheetPageProps {
  searchParams: Promise<{ job?: string }>;
}

/** The sheet became the applications list; old links still land on the same job. */
const SheetPage = async ({ searchParams }: SheetPageProps) => {
  const { job } = await searchParams;
  redirect(job && /^\d+$/.test(job) ? `/applications?job=${job}` : "/applications");
};

export default SheetPage;
