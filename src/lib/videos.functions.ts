import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type VideoRow = {
  id: string;
  video_id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  video_url: string;
  published_at: string | null;
  channel_title: string | null;
  summary: string | null;
};

const listSchema = z.object({
  search: z.string().trim().max(200).optional().default(""),
  sort: z.enum(["newest", "oldest", "title"]).optional().default("newest"),
  page: z.number().int().min(0).max(500).optional().default(0),
  pageSize: z.number().int().min(1).max(50).optional().default(20),
});

const SELECT =
  "id, video_id, title, description, thumbnail_url, video_url, published_at, channel_title, summary";

export const listVideos = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => listSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    const { createPublicServerClient } = await import("@/lib/supabase-public.server");
    const supabase = createPublicServerClient();

    let query = supabase.from("videos").select(SELECT, { count: "exact" });

    if (data.search) {
      const term = data.search.replace(/[%,()]/g, " ").trim();
      if (term) query = query.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
    }

    if (data.sort === "title") query = query.order("title", { ascending: true });
    else
      query = query.order("published_at", {
        ascending: data.sort === "oldest",
        nullsFirst: false,
      });
    query = query.order("id", { ascending: true });

    const from = data.page * data.pageSize;
    const { data: rows, count, error } = await query.range(from, from + data.pageSize - 1);
    if (error) throw new Error(error.message);

    return {
      videos: (rows ?? []) as unknown as VideoRow[],
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

/** Manual refresh — same code path as the hourly cron hook. */
export const refreshVideos = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ mode: z.enum(["incremental", "full"]).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { runVideoIngest } = await import("@/lib/youtube/ingest.server");
    const { queueVideoNotifications } = await import("@/lib/youtube/notify.server");
    const result = await runVideoIngest({ mode: data.mode ?? "full" });
    const notified = await queueVideoNotifications(result.newVideoIds);
    return { ok: true as const, notified, scanned: result.scanned, inserted: result.inserted };
  });

const SUMMARY_PROMPT = `You summarize archived TV commercials from a YouTube archive channel.
Write MAXIMUM 6 lines of markdown:
- one line naming the brand and what the ad is for
- 2-4 bullets on what happens in the spot, its tone and era
Be factual and rely only on the provided title and description. No preamble.`;

export const summarizeVideo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: video } = await supabaseAdmin
      .from("videos")
      .select("id, title, description, published_at, summary, video_url")
      .eq("id", data.id)
      .maybeSingle();
    if (!video) return { ok: false as const, summary: "", error: "Video not found." };
    if (video.summary) return { ok: true as const, summary: video.summary, error: null };

    const { callAiGateway } = await import("@/lib/ai.server");
    let response: Response;
    try {
      response = await callAiGateway([
        { role: "system", content: SUMMARY_PROMPT },
        {
          role: "user",
          content: [
            `Title: ${video.title}`,
            `Published: ${video.published_at ?? "unknown"}`,
            `Description: ${video.description ?? "(none)"}`,
            `URL: ${video.video_url}`,
          ].join("\n"),
        },
      ]);
    } catch {
      return { ok: false as const, summary: "", error: "AI is not available right now." };
    }
    if (!response.ok) {
      return {
        ok: false as const,
        summary: "",
        error:
          response.status === 429
            ? "Rate limit reached — try again shortly."
            : "Could not generate a summary.",
      };
    }
    const json = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const summary = json.choices?.[0]?.message?.content?.trim() ?? "";
    if (!summary) return { ok: false as const, summary: "", error: "Empty summary." };

    await supabaseAdmin
      .from("videos")
      .update({ summary, summarized_at: new Date().toISOString() })
      .eq("id", video.id);

    return { ok: true as const, summary, error: null };
  });
