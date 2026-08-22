import { Link } from "@tanstack/react-router";
import {
  Building2,
  ExternalLink,
  FileText,
  Link as LinkIcon,
  Loader2,
  MessageCircleQuestion,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

import { Markdown } from "@/components/Markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { summarizeLetter } from "@/lib/summarize.functions";
import type { LetterRow } from "@/lib/letters.functions";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function LetterCard({ letter, onAsk }: { letter: LetterRow; onAsk: (letter: LetterRow) => void }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function summarize() {
    setLoading(true);
    setError(null);
    try {
      const result = await summarizeLetter({ data: { letterId: letter.id } });
      if (result.ok) setSummary(result.summary);
      else setError(result.error ?? "Could not summarize this letter.");
    } catch {
      setError("Could not summarize this letter.");
    } finally {
      setLoading(false);
    }
  }

  const fileHref = (url: string) => `/api/letter-file/${letter.id}?url=${encodeURIComponent(url)}`;

  return (
    <article className="clinical-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Building2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate">{letter.company_name}</span>
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{letter.subject ?? "No subject recorded"}</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>Posted {formatDate(letter.posted_on)}</div>
          <div>Issued {formatDate(letter.letter_issued_on)}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {letter.issuing_office && (
          <Badge variant="secondary" className="font-normal">
            {letter.issuing_office}
          </Badge>
        )}
        <a href={`/api/letter-pdf/${letter.id}`} target="_blank" rel="noreferrer">
          <Badge className="cursor-pointer gap-1">
            <FileText className="h-3 w-3" /> Letter
          </Badge>
        </a>
        {letter.response_url && (
          <a href={fileHref(letter.response_url)} target="_blank" rel="noreferrer">
            <Badge variant="outline" className="cursor-pointer gap-1">
              <ExternalLink className="h-3 w-3" /> Response letter
            </Badge>
          </a>
        )}
        {letter.closeout_url && (
          <a href={fileHref(letter.closeout_url)} target="_blank" rel="noreferrer">
            <Badge variant="outline" className="cursor-pointer gap-1">
              <ExternalLink className="h-3 w-3" /> Close-out letter
            </Badge>
          </a>
        )}
        {(letter.extra_links ?? []).map((link) => (
          <a key={link.url} href={fileHref(link.url)} target="_blank" rel="noreferrer">
            <Badge variant="outline" className="cursor-pointer gap-1">
              <ExternalLink className="h-3 w-3" /> {link.title || "Reference material"}
            </Badge>
          </a>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void summarize()} disabled={loading}>
          {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
          Summarize
        </Button>
        <Button size="sm" variant="outline" onClick={() => onAsk(letter)}>
          <MessageCircleQuestion className="mr-1 h-4 w-4" />
          Ask me
        </Button>
        <Link to="/letters/$id" params={{ id: letter.id }}>
          <Button size="sm" variant="ghost">
            <LinkIcon className="mr-1 h-4 w-4" />
            Permalink
          </Button>
        </Link>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      {summary && (
        <div className="mt-3 rounded-md border border-border bg-surface-clinical p-3">
          <Markdown>{summary}</Markdown>
        </div>
      )}
    </article>
  );
}
