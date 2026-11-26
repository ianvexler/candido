import { display } from "@/components/landing/fonts";
import "@/components/landing/landing.css";
import Builder from "@/lib/images/Builder.png";
import Logo from "@/lib/images/MainLogo.png";
import Image from "next/image";
import Link from "next/link";
import { ReactNode } from "react";

interface AuthShellProps {
  /** Big line on the amber panel. */
  headline: string;
  /** A sentence under the headline. */
  tagline: string;
  children: ReactNode;
}

/** Sign in and sign up: the landing page's amber and crane-yard look beside the form. */
const AuthShell = ({ headline, tagline, children }: AuthShellProps) => (
  <div className={`${display.variable} landing flex flex-1 min-h-screen flex-col bg-white lg:flex-row`}>
    {/* Amber panel: a short band on mobile, half the screen on desktop. */}
    <aside className="flex shrink-0 flex-col bg-[var(--landing-amber)] lg:w-[46%] lg:max-w-[760px]">
      {/* Logo, headline and art kept together as one block in the middle of the panel. */}
      <div className="mx-auto flex w-full max-w-[540px] flex-col px-4 py-6 sm:px-8 lg:flex-1 lg:justify-center lg:px-10 lg:py-12">
        <Link
          href="/"
          aria-label="Candido home"
          className="self-start rounded-xl bg-candido-black px-4 py-3 shadow-[0_12px_24px_-12px_rgb(0_0_0/0.5)] lg:px-5 lg:py-4"
        >
          <Image src={Logo} alt="" priority className="h-auto w-[120px] lg:w-[196px]" />
        </Link>

        {/* Styled as a heading but not one: the form's h1 is the page title. */}
        <p className="display-heading mt-6 max-w-[9em] text-[clamp(36px,4.4vw,60px)] lg:mt-10">{headline}</p>
        <p className="mt-4 hidden max-w-[24em] text-[17px] lg:block">{tagline}</p>

        <Image
          src={Builder}
          alt=""
          sizes="(min-width: 1024px) 370px, 0px"
          className="mx-auto mt-20 hidden h-auto max-h-[30vh] w-auto max-w-[370px] object-contain lg:block"
        />
      </div>
      <div className="hazard h-3 shrink-0 lg:h-4" aria-hidden />
    </aside>

    {/* The root layout already provides <main>. */}
    <div className="flex flex-1 items-start justify-center px-4 py-10 sm:px-8 lg:items-center lg:justify-start lg:py-16 lg:pl-[clamp(56px,9vw,180px)]">
      <div className="w-full max-w-[380px]">{children}</div>
    </div>
  </div>
);

export default AuthShell;
