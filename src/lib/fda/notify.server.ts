/**
 * Queues "new letter" email notifications for every opted-in user.
 * Rows in letter_notifications_sent guarantee a user is never emailed twice
 * about the same letter, whether it arrived through cron or a manual refresh.
 */
export async function queueLetterNotifications(letterIds: string[]): Promise<number> {
  if (letterIds.length === 0) return 0;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: letters } = await supabaseAdmin
    .from("letters")
    .select("id, letter_kind")
    .in("id", letterIds.slice(0, 500));
  if (!letters || letters.length === 0) return 0;

  const { data: prefs } = await supabaseAdmin
    .from("notification_preferences")
    .select("user_id, email, notify_warning, notify_untitled");
  if (!prefs || prefs.length === 0) return 0;

  const rows: { letter_id: string; user_id: string; status: string }[] = [];
  for (const letter of letters) {
    for (const pref of prefs) {
      const wants = letter.letter_kind === "warning" ? pref.notify_warning : pref.notify_untitled;
      if (!wants || !pref.email) continue;
      rows.push({ letter_id: letter.id, user_id: pref.user_id, status: "queued" });
    }
  }
  if (rows.length === 0) return 0;

  const { data } = await supabaseAdmin
    .from("letter_notifications_sent")
    .upsert(rows, { onConflict: "letter_id,user_id", ignoreDuplicates: true })
    .select("id");
  return data?.length ?? 0;
}
