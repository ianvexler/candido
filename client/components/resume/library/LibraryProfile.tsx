"use client";

import type { HeaderDraft } from "@/lib/resume/useHeaderDraft";
import { HeaderFields, HeaderText } from "../HeaderFields";
import { LIBRARY_CARD } from "../sectionLooks";

/** The library's profile: headed like a section, its fields on a card like an entry's. */
const LibraryProfile = ({ header }: { header: HeaderDraft }) => (
  <article className="mx-auto w-full max-w-2xl pb-6">
    <h2 className="text-2xl font-semibold tracking-tight">Profile</h2>
    <p className="mt-0.5 text-sm text-muted-foreground">
      Your name and contact details, at the top of every CV. Each CV can change them.
    </p>
    <div className={`mt-5 ${LIBRARY_CARD}`}>
      <HeaderText header={header} field="name" placeholder="Your name" className="py-0.5 text-2xl font-bold" />
      <HeaderText
        header={header}
        field="headline"
        placeholder="Headline, e.g. Backend engineer"
        className="mt-0.5 py-0.5 text-base text-muted-foreground"
      />
      <HeaderFields header={header} />
    </div>
  </article>
);

export default LibraryProfile;
