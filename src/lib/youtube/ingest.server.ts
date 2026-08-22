/**
 * Ingestion for the Commercial Archivist YouTube channel.
 * The same function backs the hourly cron hook and the manual refresh button.
 */
export const CHANNEL_ID = "UCJXN7pxBDNyNMeX63K5y9Sg";
export const CHANNEL_HANDLE = "commercialarchivist";

const UA = "Mozilla/5.0 (compatible; FDA-Letters-Archive/1.0)";
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const VIDEOS_URL = `https://www.youtube.com/@${CHANNEL_HANDLE}/videos`;

export type ScrapedVideo = {
  video_id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  channel_title: string | null;
};

export type VideoIngestResult = {
  scanned: number;
  inserted: number;
  newVideoIds: string[];
};

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function tag(block: string, name: string): string | null {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return match?.[1] ? decodeEntities(match[1].trim()) : null;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Latest ~15 uploads, with descriptions and exact publish timestamps. */
export async function fetchFeedVideos(): Promise<ScrapedVideo[]> {
  const xml = await fetchText(FEED_URL);
  if (!xml) return [];
  const entries = xml.split("<entry>").slice(1);
  const out: ScrapedVideo[] = [];
  for (const entry of entries) {
    const videoId = tag(entry, "yt:videoId");
    const title = tag(entry, "title");
    if (!videoId || !title) continue;
    const thumb = entry.match(/<media:thumbnail url="([^"]+)"/)?.[1] ?? null;
    out.push({
      video_id: videoId,
      title,
      description: tag(entry, "media:description"),
      thumbnail_url: thumb,
      published_at: tag(entry, "published"),
      channel_title: tag(entry, "name"),
    });
  }
  return out;
}

/** Whole-channel backfill: ids + titles scraped from the channel videos page. */
export async function fetchChannelBacklog(): Promise<ScrapedVideo[]> {
  const html = await fetchText(VIDEOS_URL);
  if (!html) return [];
  const seen = new Map<string, ScrapedVideo>();
  const regex =
    /"contentId":"([A-Za-z0-9_-]{11})"[\s\S]{0,20000}?"lockupMetadataViewModel":\{"title":\{"content":"((?:[^"\\]|\\.)*)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const id = match[1]!;
    if (seen.has(id)) continue;
    let title = match[2]!;
    try {
      title = JSON.parse(`"${title}"`) as string;
    } catch {
      /* keep raw */
    }
    seen.set(id, {
      video_id: id,
      title,
      description: null,
      thumbnail_url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      published_at: null,
      channel_title: "Commercial Archivist",
    });
  }
  return [...seen.values()];
}

export async function runVideoIngest(
  options: { mode?: "incremental" | "full" } = {},
): Promise<VideoIngestResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const mode = options.mode ?? "incremental";

  const feed = await fetchFeedVideos();
  const backlog = mode === "full" ? await fetchChannelBacklog() : [];

  const merged = new Map<string, ScrapedVideo>();
  for (const video of [...backlog, ...feed]) merged.set(video.video_id, video);
  const scraped = [...merged.values()];
  if (scraped.length === 0) return { scanned: 0, inserted: 0, newVideoIds: [] };

  const ids = scraped.map((v) => v.video_id);
  const existing = new Set<string>();
  for (let i = 0; i < ids.length; i += 400) {
    const { data } = await supabaseAdmin
      .from("videos")
      .select("video_id")
      .in("video_id", ids.slice(i, i + 400));
    for (const row of data ?? []) existing.add(row.video_id);
  }

  const fresh = scraped.filter((v) => !existing.has(v.video_id));
  const newVideoIds: string[] = [];

  for (let i = 0; i < fresh.length; i += 200) {
    const batch = fresh.slice(i, i + 200).map((v) => ({
      video_id: v.video_id,
      channel_id: CHANNEL_ID,
      channel_title: v.channel_title,
      title: v.title,
      description: v.description,
      thumbnail_url: v.thumbnail_url,
      video_url: `https://www.youtube.com/watch?v=${v.video_id}`,
      published_at: v.published_at,
    }));
    const { data } = await supabaseAdmin
      .from("videos")
      .upsert(batch, { onConflict: "video_id", ignoreDuplicates: true })
      .select("id");
    newVideoIds.push(...(data ?? []).map((r) => r.id));
  }

  // Fill in descriptions / timestamps for backlog rows once the feed carries them.
  for (const video of feed) {
    if (!existing.has(video.video_id)) continue;
    if (!video.description && !video.published_at) continue;
    await supabaseAdmin
      .from("videos")
      .update({
        description: video.description,
        published_at: video.published_at,
        thumbnail_url: video.thumbnail_url,
        updated_at: new Date().toISOString(),
      })
      .eq("video_id", video.video_id)
      .is("published_at", null);
  }

  return { scanned: scraped.length, inserted: newVideoIds.length, newVideoIds };
}
