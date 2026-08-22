import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type NotificationPrefs = {
  email: string | null;
  notify_warning: boolean;
  notify_untitled: boolean;
};

export const getNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("notification_preferences")
      .select("email, notify_warning, notify_untitled")
      .eq("user_id", userId)
      .maybeSingle();
    return {
      prefs: (data ?? null) as NotificationPrefs | null,
    };
  });

export const saveNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().email().max(320),
        notify_warning: z.boolean(),
        notify_untitled: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("notification_preferences").upsert(
      {
        user_id: userId,
        email: data.email,
        notify_warning: data.notify_warning,
        notify_untitled: data.notify_untitled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
