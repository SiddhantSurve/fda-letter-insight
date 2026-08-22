import { Loader2, PlayCircle, Sparkles, Youtube } from "lucide-react";
import { useState } from "react";

import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { summarizeVideo, type VideoRow } from "@/lib/videos.functions";

function formatDate(value: string | null): string {
  if (!value) return "Date unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function VideoCard({ video }: { video: VideoRow }) {
  const [summary, setSummary] = useState<string | null>(video.summary);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function summarize() {
    setLoading(true);
    setError(null);
    try {
      const result = await summarizeVideo({ data: { id: video.id } });
      if (result.ok) setSummary(result.summary);
      else setError(result.error ?? "Could not summarize this video.");
    } catch {
      setError("Could not summarize this video.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="clinical-panel flex gap-4 p-4 sm:p-5">
      <a
        href={video.video_url}
        target="_blank"
        rel="noreferrer"
        className="hidden shrink-0 sm:block"
      >
        {video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt={`Thumbnail for ${video.title}`}
            loading="lazy"
            className="h-[90px] w-40 rounded-md border border-border object-cover"
          />
        ) : (
          <div className="flex h-[90px] w-40 items-center justify-center rounded-md border border-border">
            <PlayCircle className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          </div>
        )}
      </a>

      <div className="min-w-0 flex-1">
        <h3 className="text-base font-semibold text-foreground">
          <a href={video.video_url} target="_blank" rel="noreferrer" className="hover:text-primary">
            {video.title}
          </a>
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatDate(video.published_at)}
          {video.channel_title ? ` · ${video.channel_title}` : ""}
        </p>
        {video.description && (
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{video.description}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void summarize()} disabled={loading || Boolean(summary)}>
            {loading ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-4 w-4" />
            )}
            Summarize
          </Button>
          <a href={video.video_url} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline">
              <Youtube className="mr-1 h-4 w-4" /> Watch video
            </Button>
          </a>
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        {summary && (
          <div className="mt-3 rounded-md border border-border bg-surface-clinical p-3">
            <Markdown>{summary}</Markdown>
          </div>
        )}
      </div>
    </article>
  );
}
