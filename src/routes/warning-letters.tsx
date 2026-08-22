import { createFileRoute } from "@tanstack/react-router";

import { ArchiveView } from "@/components/ArchiveView";

export const Route = createFileRoute("/warning-letters")({
  head: () => ({
    meta: [
      { title: "FDA Warning Letters Archive — Search & Summarize" },
      {
        name: "description",
        content:
          "Browse every FDA warning letter with issuing office, subject, response and close-out documents, AI summaries and document-scoped Q&A.",
      },
      { property: "og:title", content: "FDA Warning Letters Archive" },
      {
        property: "og:description",
        content: "Searchable FDA warning letters with AI summaries and full-text question answering.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/warning-letters" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/warning-letters" }],
  }),
  component: WarningLetters,
});

function WarningLetters() {
  return (
    <ArchiveView
      kind="warning"
      title="Warning Letters"
      description="Mirrored from FDA.gov, including response letters, close-out letters and full letter text."
    />
  );
}
