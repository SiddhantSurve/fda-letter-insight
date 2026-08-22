import { createFileRoute } from "@tanstack/react-router";

import { ArchiveView } from "@/components/ArchiveView";

export const Route = createFileRoute("/untitled-letters")({
  head: () => ({
    meta: [
      { title: "FDA Untitled Letters (OPDP) Archive — Search & Summarize" },
      {
        name: "description",
        content:
          "Browse OPDP untitled letters to pharmaceutical companies with promotional materials, AI summaries and letter-scoped Q&A.",
      },
      { property: "og:title", content: "FDA Untitled Letters Archive" },
      {
        property: "og:description",
        content: "OPDP untitled letters with reference materials, AI summaries and question answering.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/untitled-letters" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/untitled-letters" }],
  }),
  component: UntitledLetters,
});

function UntitledLetters() {
  return (
    <ArchiveView
      kind="untitled"
      title="Untitled Letters"
      description="OPDP untitled letters to pharmaceutical companies, including linked promotional and reference materials."
    />
  );
}
