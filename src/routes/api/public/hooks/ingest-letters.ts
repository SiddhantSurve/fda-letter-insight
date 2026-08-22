import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { runIngest } from "@/lib/fda/ingest.server";
import { queueLetterNotifications } from "@/lib/fda/notify.server";

const bodySchema = z.object({
  mode: z.enum(["incremental", "full"]).optional(),
  kinds: z.array(z.enum(["warning", "untitled"])).min(1).max(2).optional(),
  hydrateLimit: z.number().int().min(0).max(100).optional(),
});

async function timingSafeMatch(provided: string, expected: string): Promise<boolean> {
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const digest = (v: string) => createHash("sha256").update(v, "utf8").digest();
  return timingSafeEqual(digest(provided), digest(expected));
}

/** The scheduled database job authenticates with a token stored in the vault. */
async function matchesStoredHookToken(provided: string): Promise<boolean> {
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("hook_tokens")
    .select("token_hash")
    .eq("name", "ingest_letters")
    .maybeSingle();
  if (!data?.token_hash) return false;
  const providedHash = Buffer.from(
    createHash("sha256").update(provided, "utf8").digest("hex"),
    "utf8",
  );
  const storedHash = Buffer.from(data.token_hash, "utf8");
  if (providedHash.length !== storedHash.length) return false;
  return timingSafeEqual(providedHash, storedHash);
}

export const Route = createFileRoute("/api/public/hooks/ingest-letters")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["LOVABLE_CRON_SECRET"];
        const header = request.headers.get("x-cron-secret");

        if (header) {
          const envMatch = secret ? await timingSafeMatch(header, secret) : false;
          if (!envMatch && !(await matchesStoredHookToken(header))) {
            return new Response("Unauthorized", { status: 401 });
          }
        } else {
          const denied = await authenticateCronRequest(request);
          if (denied) return denied;
        }

        let raw: unknown = {};
        try {
          raw = await request.json();
        } catch {
          raw = {};
        }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          return Response.json({ error: "Invalid input" }, { status: 400 });
        }

        try {
          const result = await runIngest({
            trigger: "cron",
            ...(parsed.data.kinds ? { kinds: parsed.data.kinds } : {}),
            ...(parsed.data.mode ? { mode: parsed.data.mode } : {}),
            ...(parsed.data.hydrateLimit ? { hydrateLimit: parsed.data.hydrateLimit } : {}),
          });

          const notified = await queueLetterNotifications(result.newLetterIds);

          // The YouTube archive rides on the same hourly schedule.
          const { runVideoIngest } = await import("@/lib/youtube/ingest.server");
          const { queueVideoNotifications } = await import("@/lib/youtube/notify.server");
          const videoResult = await runVideoIngest({ mode: "incremental" });
          const videosNotified = await queueVideoNotifications(videoResult.newVideoIds);

          return Response.json({
            ok: true,
            ...result,
            notified,
            videos: { ...videoResult, notified: videosNotified },
          });
        } catch (error) {
          console.error("ingest-letters failed", error);
          return Response.json({ ok: false, error: "Ingestion failed" }, { status: 500 });
        }
      },
    },
  },
});
