import Hook from "@/lib/images/CraneHook.png";
import Tower from "@/lib/images/CraneTower.png";
import { CalendarIcon, TagIcon } from "lucide-react";
import Image from "next/image";

/** Decorative crane lowering a job card towards the board. */
const Crane = () => (
  <div
    aria-hidden
    className="relative w-[170px] shrink-0 [--cable:36px] sm:w-[220px] sm:[--cable:60px] lg:w-[290px] lg:[--cable:90px]"
  >
    <Image src={Tower} alt="" priority sizes="(min-width: 1024px) 290px, 220px" className="block w-full" />

    <div className="crane-rig absolute left-[94.5%] top-[4.5%] flex w-0 flex-col items-center">
      <div className="crane-cable shrink-0" />
      <Image src={Hook} alt="" className="-mt-1 w-8 max-w-none" />

      <div className="-mt-3 w-[150px] shrink-0 -rotate-3 rounded-xl bg-white p-3 text-left shadow-[0_14px_28px_-8px_rgb(110_65_0/0.35)] sm:w-[180px] sm:p-4">
        <div className="relative pl-3">
          <span className="absolute inset-y-0 left-0 w-1 rounded bg-indigo-500" />
          <p className="text-[15px] font-bold leading-tight sm:text-[17px]">Your dream job</p>
          <p className="text-[13px] text-neutral-600">A company you like</p>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[12px]">
          <TagIcon className="size-3.5 shrink-0" strokeWidth={1.5} /> Remote, full-time
        </p>
        <p className="mt-2 hidden items-center gap-1.5 border-t pt-2 text-[12px] sm:flex">
          <CalendarIcon className="size-3.5 shrink-0" strokeWidth={1.5} /> Starts soon
        </p>
      </div>
    </div>
  </div>
);

export default Crane;
