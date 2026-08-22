import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useState } from "react";

import { ChatPanel } from "@/components/ChatPanel";
import { LetterCard } from "@/components/LetterCard";
import { getLetter, type LetterRow } from "@/lib/letters.functions";

export const Route = createFileRoute("/letters/$id")({
  head: () => ({
    meta: [
      { title: "Letter detail — FDA Enforcement Letter Archive" },
      {
        name: "description",
        content:
          "Full metadata, linked response and close-out documents, AI summary and document chat for a single FDA enforcement letter.",
      },
      { property: "og:title", content: "FDA enforcement letter detail" },
      {
        property: "og:description",
        content: "Metadata, summary and AI chat for a single FDA warning or untitled letter.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LetterDetail,
});

function LetterDetail() {
  const { id } = Route.useParams();
  const [activeLetter, setActiveLetter] = useState<LetterRow | null>(null);

  const letterQuery = useQuery({
    queryKey: ["letter", id],
    queryFn: () => getLetter({ data: { id } }),
  });

  const letter = letterQuery.data?.letter ?? null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to archives
      </Link>

      <h1 className="mt-4 text-xl font-semibold text-foreground">
        {letter ? letter.company_name : "Letter"}
      </h1>

      <div className="mt-4">
        {letterQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading letter…
          </div>
        ) : letter ? (
          <LetterCard letter={letter} onAsk={setActiveLetter} />
        ) : (
          <p className="text-sm text-muted-foreground">This letter is no longer available.</p>
        )}
      </div>

      {activeLetter && (
        <ChatPanel scope={{ letterId: activeLetter.id }} onClose={() => setActiveLetter(null)} />
      )}
    </main>
  );
}
