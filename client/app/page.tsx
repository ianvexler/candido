import Crane from "@/components/landing/Crane";
import CtaLink from "@/components/landing/CtaLink";
import DemoBoard from "@/components/landing/DemoBoard";
import { display } from "@/components/landing/fonts";
import "@/components/landing/landing.css";
import ImportDemo from "@/components/landing/ImportDemo";
import LandingRedirect from "@/components/landing/LandingRedirect";
import SheetDemo from "@/components/landing/SheetDemo";
import TailorDemo from "@/components/landing/TailorDemo";
import Builder from "@/lib/images/Builder.png";
import Logo from "@/lib/images/MainLogo.png";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Candido: your whole job hunt in one place",
  description:
    "Track every application, keep each CV and cover letter with its job, and let AI tailor your application to every role.",
};

/** A section heading with its summary beside it on wide screens. */
const SectionIntro = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="mb-12 grid items-end gap-x-5 gap-y-8 lg:grid-cols-2">
    <h2 className="text-[clamp(38px,4.2vw,56px)]">{title}</h2>
    <p className="max-w-[32em] text-[18px] lg:justify-self-end">{children}</p>
  </div>
);

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
            <p className="mt-8 max-w-[26em] text-[17px] sm:text-[18px]">
              Every application, CV and cover letter together, with AI that tailors your application to each role.
              Less time on admin, more on the jobs you want.
            </p>
            <CtaLink href="/register" className="mt-7">Create account</CtaLink>
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
      <SectionIntro title="Tailor your application to every role">
        Bring the CV you already have. For each job, AI shows how well you fit, spots what&apos;s missing and tailors
        your CV and cover letter so you stand out. You stay in control of every change.
      </SectionIntro>
      <TailorDemo />
    </section>

    <section id="sheet" className="bg-[var(--landing-sky)]">
      <div className="mx-auto max-w-[1120px] px-4 py-16 sm:px-6 sm:py-24">
        <h2 className="max-w-[12em] text-[clamp(38px,4.2vw,56px)]">Know what you sent, and to whom</h2>
        <p className="mb-10 mt-8 max-w-[36em] text-[18px]">
          Every job in one table, so you never have to hunt for an email again. When a recruiter calls, pick the row: the
          CV, cover letter, closing date and notes for that job are all there.
        </p>
        <SheetDemo />
      </div>
    </section>

    <section className="bg-[var(--landing-amber)]">
      <div className="mx-auto max-w-[1120px] px-4 py-16 sm:px-6 sm:py-24">
        <SectionIntro title="Bring your spreadsheet with you">
          Already tracking jobs in a sheet? Upload it and each row becomes a card on your board. You don&apos;t have
          to start again.
        </SectionIntro>
        <ImportDemo />
      </div>
    </section>

    <section>
      <div className="mx-auto grid max-w-[1120px] items-center gap-8 px-4 py-16 sm:px-6 sm:py-24 md:grid-cols-[1.1fr_1fr]">
        <div>
          <h2 className="text-[clamp(42px,5vw,64px)]">Get your hat on</h2>
          <p className="mt-8 max-w-[30em] text-[18px]">
            Job hunting is hard work. Keep it all in one place, let us tailor your application to
            each role, and get your evenings back. Here&apos;s how to start:
          </p>
          <ol className="mt-5 max-w-[30em] list-decimal space-y-2 pl-6 marker:font-bold">
            <li>Create an account and confirm your email.</li>
            <li>Import your spreadsheet, or add the first job you like.</li>
            <li>Bring in your CV and tailor your application to that job.</li>
          </ol>
          <CtaLink href="/register" className="mt-10">Create account</CtaLink>
        </div>
        <Image src={Builder} alt="" sizes="(min-width: 768px) 380px" className="mx-auto block w-full max-w-[380px]" />
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
