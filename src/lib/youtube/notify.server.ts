/** Emails every opted-in subscriber once per new video. */
const SITE_URL = "https://fdacontent.org";

export async function queueVideoNotifications(videoRowIds: string[]): Promise<number> {
  if (videoRowIds.length === 0) return 0;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: videos } = await supabaseAdmin
    .from("videos")
    .select("id, title, description, video_url, published_at, channel_title")
    .in("id", videoRowIds.slice(0, 200));
  if (!videos || videos.length === 0) return 0;

  const { data: prefs } = await supabaseAdmin
    .from("notification_preferences")
    .select("user_id, email, notify_videos");
  if (!prefs || prefs.length === 0) return 0;

  const rows: { video_id: string; user_id: string; status: string }[] = [];
  const emails = new Map<string, string>();
  for (const video of videos) {
    for (const pref of prefs) {
      if (!pref.notify_videos || !pref.email) continue;
      rows.push({ video_id: video.id, user_id: pref.user_id, status: "queued" });
      emails.set(pref.user_id, pref.email);
    }
  }
  if (rows.length === 0) return 0;

  const { data: inserted } = await supabaseAdmin
    .from("video_notifications_sent")
    .upsert(rows, { onConflict: "video_id,user_id", ignoreDuplicates: true })
    .select("id, video_id, user_id");
  if (!inserted || inserted.length === 0) return 0;

  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  const byVideo = new Map(videos.map((v) => [v.id, v]));

  for (const row of inserted) {
    const video = byVideo.get(row.video_id);
    const email = emails.get(row.user_id);
    if (!video || !email) continue;
    try {
      const result = await sendTemplateEmail("new-video-alert", email, {
        idempotencyKey: `new-video-alert-${row.video_id}-${row.user_id}`,
        templateData: {
          title: video.title,
          description: video.description,
          channelTitle: video.channel_title,
          publishedAt: video.published_at,
          youtubeUrl: video.video_url,
          archiveUrl: `${SITE_URL}/commercial-archive`,
        },
      });
      await supabaseAdmin
        .from("video_notifications_sent")
        .update({
          status: result.sent ? "sent" : "suppressed",
          sent_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    } catch (error) {
      console.error("new-video alert failed", error instanceof Error ? error.message : error);
      await supabaseAdmin
        .from("video_notifications_sent")
        .update({ status: "failed" })
        .eq("id", row.id);
    }
  }

  return inserted.length;
}
