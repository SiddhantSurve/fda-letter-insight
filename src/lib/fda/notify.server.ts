/**
 * Sends "new letter" email notifications to every opted-in user.
 * Rows in letter_notifications_sent guarantee a user is never emailed twice
 * about the same letter, whether it arrived through cron or a manual refresh.
 */
const SITE_URL = "https://fdacontent.org";

export async function queueLetterNotifications(letterIds: string[]): Promise<number> {
  if (letterIds.length === 0) return 0;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: letters } = await supabaseAdmin
    .from("letters")
    .select("id, letter_kind, company_name, issuing_office, subject, posted_on")
    .in("id", letterIds.slice(0, 500));
  if (!letters || letters.length === 0) return 0;

  const { data: prefs } = await supabaseAdmin
    .from("notification_preferences")
    .select("user_id, email, notify_warning, notify_untitled");
  if (!prefs || prefs.length === 0) return 0;

  const rows: { letter_id: string; user_id: string; status: string }[] = [];
  const targets: { letter_id: string; user_id: string; email: string }[] = [];
  for (const letter of letters) {
    for (const pref of prefs) {
      const wants = letter.letter_kind === "warning" ? pref.notify_warning : pref.notify_untitled;
      if (!wants || !pref.email) continue;
      rows.push({ letter_id: letter.id, user_id: pref.user_id, status: "queued" });
      targets.push({ letter_id: letter.id, user_id: pref.user_id, email: pref.email });
    }
  }
  if (rows.length === 0) return 0;

  // Only newly inserted rows are emailed — existing rows mean we already sent.
  const { data: inserted } = await supabaseAdmin
    .from("letter_notifications_sent")
    .upsert(rows, { onConflict: "letter_id,user_id", ignoreDuplicates: true })
    .select("id, letter_id, user_id");
  if (!inserted || inserted.length === 0) return 0;

  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  const byLetter = new Map(letters.map((l) => [l.id, l]));

  for (const row of inserted) {
    const letter = byLetter.get(row.letter_id);
    const target = targets.find(
      (t) => t.letter_id === row.letter_id && t.user_id === row.user_id,
    );
    if (!letter || !target) continue;

    try {
      const result = await sendTemplateEmail("new-letter-alert", target.email, {
        idempotencyKey: `new-letter-alert-${row.letter_id}-${row.user_id}`,
        templateData: {
          companyName: letter.company_name,
          letterKind: letter.letter_kind,
          issuingOffice: letter.issuing_office,
          postedOn: letter.posted_on,
          subject: letter.subject,
          letterUrl: `${SITE_URL}/letters/${letter.id}`,
        },
      });
      await supabaseAdmin
        .from("letter_notifications_sent")
        .update({
          status: result.sent ? "sent" : "suppressed",
          sent_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    } catch (error) {
      console.error("new-letter alert failed", error instanceof Error ? error.message : error);
      await supabaseAdmin
        .from("letter_notifications_sent")
        .update({ status: "failed" })
        .eq("id", row.id);
    }
  }

  return inserted.length;
}
