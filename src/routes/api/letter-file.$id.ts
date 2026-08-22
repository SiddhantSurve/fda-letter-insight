import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { proxyFdaFile } from "@/lib/fda/proxy.server";

export const Route = createFileRoute("/api/letter-file/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const id = z.string().uuid().safeParse(params.id);
        const target = new URL(request.url).searchParams.get("url");
        if (!id.success || !target) return new Response("Bad request", { status: 400 });

        const { createPublicServerClient } = await import("@/lib/supabase-public.server");
        const supabase = createPublicServerClient();
        const { data } = await supabase
          .from("letters")
          .select("letter_url, response_url, closeout_url, extra_links")
          .eq("id", id.data)
          .maybeSingle();
        if (!data) return new Response("Not found", { status: 404 });

        // Only files that this letter actually references may be proxied.
        const allowed = new Set<string>(
          [
            data.letter_url,
            data.response_url,
            data.closeout_url,
            ...((data.extra_links ?? []) as { url?: string }[]).map((l) => l?.url ?? ""),
          ].filter(Boolean) as string[],
        );
        if (!allowed.has(target)) return new Response("Forbidden", { status: 403 });

        return proxyFdaFile(target);
      },
    },
  },
});
