import Crane from "@/components/landing/Crane";
import CtaLink from "@/components/landing/CtaLink";
import DemoBoard from "@/components/landing/DemoBoard";
import { display } from "@/components/landing/fonts";
import "@/components/landing/landing.css";
import LandingRedirect from "@/components/landing/LandingRedirect";
import SheetDemo from "@/components/landing/SheetDemo";
import TailorDemo from "@/components/landing/TailorDemo";
import Builder from "@/lib/images/Builder.png";
import Lost from "@/lib/images/LostLarge.png";
import Logo from "@/lib/images/MainLogo.png";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Candido: job application tracker and CV builder",
  description: "Track every job application on one board and tailor your CV to each role.",
};

const LandingPage = () => (
  <div className={`${display.variable} landing overflow-x-clip bg-white text-[17px] leading-relaxed`}>
    <LandingRedirect />

    <div className="bg-[linear-gradient(var(--landing-amber)_calc(100%-200px),#fff_calc(100%-200px))]">
      <header className="mx-auto flex max-w-[1120px] items-start justify-between gap-4 px-4 sm:px-6">
        <div className="shrink-0 rounded-b-xl bg-candido-black px-4 pb-3 pt-4">
          <Image src={Logo} alt="Candido" priority className="h-auto w-[104px] sm:w-[128px]" />
        </div>

        <nav aria-label="Main" className="flex items-center gap-5 pt-3 text-[16px] font-semibold sm:gap-7">
          <a href="#board" className="hidden hover:underline md:block">Board</a>
          <a href="#cvs" className="hidden hover:underline md:block">CVs</a>
          <a href="#sheet" className="hidden hover:underline md:block">Sheet</a>
          <Link href="/login" className="py-2 hover:underline">Sign in</Link>
          <CtaLink href="/register" className="hidden min-h-11 px-5 text-[16px] sm:inline-flex">Create account</CtaLink>
        </nav>
      </header>

      <main className="mx-auto max-w-[1120px] px-4 sm:px-6">
        <div className="flex flex-col justify-between lg:flex-row lg:items-end">
          <div className="pb-8 pt-10 sm:pt-14 lg:max-w-[520px] lg:pb-16">
            <h1 className="text-[clamp(48px,6vw,80px)]">Build your way to the offer</h1>
            <p className="mt-5 max-w-[26em] text-[17px] sm:text-[18px]">
              Track every application on one board, and tailor your CV to each job before you send it.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
              <CtaLink href="/register">Create account</CtaLink>
              <a href="#board" className="py-2 font-semibold underline underline-offset-4">Try the board first</a>
            </div>
          </div>

          <div className="mr-[90px] self-end lg:mr-[120px]">
            <Crane />
          </div>
        </div>

        <div id="board" className="relative scroll-mt-4">
          <DemoBoard />
        </div>
      </main>
    </div>

    <section id="cvs" className="mx-auto max-w-[1120px] px-4 pb-20 pt-16 sm:px-6 sm:pb-24 sm:pt-24">
      <div className="mb-12 grid items-end gap-5 lg:grid-cols-2">
        <h2 className="text-[clamp(38px,4.2vw,56px)]">The right CV for every job</h2>
        <p className="max-w-[32em] text-[18px] lg:justify-self-end">
          Import the CV you have or build one here. For each job, Candido makes a copy and Claude suggests specific
          edits. You decide what goes in, and your original stays as it was.
        </p>
      </div>
      <TailorDemo />
    </section>

    <section id="sheet" className="bg-[var(--landing-sky)]">
      <div className="mx-auto max-w-[1120px] px-4 py-16 sm:px-6 sm:py-24">
        <h2 className="max-w-[12em] text-[clamp(38px,4.2vw,56px)]">Know what you sent, and to whom</h2>
        <p className="mb-10 mt-5 max-w-[36em] text-[18px]">
          When a recruiter calls, pick the row. The CV, cover letter, closing date and notes for that job are all there.
        </p>
        <SheetDemo />
      </div>
    </section>

    <section className="mx-auto grid max-w-[1120px] items-center gap-10 px-4 pt-16 sm:pt-20 sm:px-6 md:grid-cols-[1fr_1.1fr]">
      <Image src={Lost} alt="" sizes="(min-width: 768px) 320px" className="mx-auto block w-full max-w-[290px] self-end md:max-w-[320px] max-md:order-2" />
      <div className="md:pb-14">
        <h2 className="text-[clamp(38px,4.2vw,56px)]">Lost in your own spreadsheet?</h2>
        <p className="mt-5 max-w-[30em] text-[18px]">
          Rows you forgot to update, deadlines you missed, and no idea which CV went where. You don&apos;t have to start
          over to fix it. Upload your Excel or CSV file and Candido turns each job into a card on your board.
        </p>
        <ul className="mt-5 max-w-[32em] list-disc space-y-2 pl-5 marker:text-[#d92b14]">
          <li>Brings in job titles, companies, locations, salaries, links and statuses.</li>
          <li>Finds your table, even if it doesn&apos;t start on the first row.</li>
          <li>Shows you a preview before anything is added.</li>
        </ul>
      </div>
    </section>

    <section className="bg-[var(--landing-amber)]">
      <div className="mx-auto grid max-w-[1120px] items-center gap-8 px-4 sm:px-6 md:grid-cols-[1.1fr_1fr]">
        <div className="pt-14 sm:py-16">
          <h2 className="text-[clamp(42px,5vw,64px)]">Get your hat on</h2>
          <p className="mt-5 max-w-[30em] text-[18px]">
            Job hunting is hard work. Keep it all in one place, and you can spend your time on the applications instead
            of the admin. Here&apos;s how to start:
          </p>
          <ol className="mt-5 max-w-[30em] list-decimal space-y-2 pl-6 marker:font-bold">
            <li>Create an account and confirm your email.</li>
            <li>Import your spreadsheet, or add the first job you like.</li>
            <li>Bring in your CV and tailor it for that job.</li>
          </ol>
          <CtaLink href="/register" className="mt-6">Create account</CtaLink>
        </div>
        <Image src={Builder} alt="" sizes="(min-width: 768px) 380px" className="mx-auto block w-full max-w-[380px] self-end md:pt-10" />
      </div>
    </section>

    <footer className="landing-dark bg-candido-black text-white">
      <div className="mx-auto flex max-w-[1120px] items-center justify-between px-4 py-6 sm:px-6">
        <Image src={Logo} alt="Candido" className="h-auto w-[104px]" />
        <Link href="/login" className="py-2 text-[16px] font-semibold hover:underline">Sign in</Link>
      </div>
    </footer>
  </div>
);

export default LandingPage;
