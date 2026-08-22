import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, FileWarning, ScrollText, Youtube } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FDA Enforcement Letter Archive — Warning & Untitled Letters" },
      {
        name: "description",
        content:
          "Search, summarize and question FDA Warning Letters and OPDP Untitled Letters with full letter text, response and close-out documents.",
      },
      { property: "og:title", content: "FDA Enforcement Letter Archive" },
      {
        property: "og:description",
        content:
          "A searchable, AI-assisted mirror of FDA Warning Letters and Untitled Letters.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: Index,
});

const entries = [
  {
    to: "/warning-letters" as const,
    icon: FileWarning,
    title: "Warning Letters",
    body: "The full FDA warning letter catalog — company, issuing office, subject, response and close-out documents.",
  },
  {
    to: "/untitled-letters" as const,
    icon: ScrollText,
    title: "Untitled Letters",
    body: "OPDP untitled letters to pharmaceutical companies, including promotional and reference materials.",
  },
  {
    to: "/commercial-archive" as const,
    icon: Youtube,
    title: "Commercial Archivist Videos",
    body: "Every upload from the Commercial Archivist YouTube channel, with an AI summary and a link to each video.",
  },
];

function Index() {
  return (
    <main className="mx-auto flex min-h-[80vh] max-w-4xl flex-col justify-center px-4 py-14">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        FDA Enforcement Letter Archive
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
        Choose an archive to search, summarize and ask questions about.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((entry) => (
          <Link key={entry.to} to={entry.to} className="clinical-panel group p-6 transition hover:border-primary">
            <entry.icon className="h-7 w-7 text-primary" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-semibold text-foreground">{entry.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{entry.body}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
              Open archive
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
