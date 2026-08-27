import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, FileWarning, ScrollText, Youtube } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FDA Content Monitoring — Warning & Untitled Letters" },
      {
        name: "description",
        content:
          "Search, summarize and question FDA Warning Letters and OPDP Untitled Letters with full letter text, response and close-out documents.",
      },
      { property: "og:title", content: "FDA Content Monitoring" },
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
    <main className="mx-auto flex min-h-[80vh] max-w-5xl flex-col justify-center px-4 py-14 text-center">
      <h1 className="mx-auto text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        FDA Content Monitoring
      </h1>
      <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
        Choose Content Types
      </p>

      <div className="mt-10 grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((entry) => (
          <article
            key={entry.to}
            className="clinical-panel flex h-full flex-col items-center p-6 text-center transition hover:border-primary"
          >
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft">
              <entry.icon className="h-6 w-6 text-primary" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-foreground">{entry.title}</h2>
            <p className="mt-2 flex-1 text-sm text-muted-foreground">{entry.body}</p>
            <Button asChild className="mt-6 w-full">
              <Link to={entry.to}>
                View
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </article>
        ))}
      </div>
    </main>
  );
}
