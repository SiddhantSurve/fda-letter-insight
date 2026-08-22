import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { proxyFdaFile } from "@/lib/fda/proxy.server";

export const Route = createFileRoute("/api/letter-pdf/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = z.string().uuid().safeParse(params.id);
        if (!id.success) return new Response("Bad request", { status: 400 });

        const { createPublicServerClient } = await import("@/lib/supabase-public.server");
        const supabase = createPublicServerClient();
        const { data } = await supabase
          .from("letters")
          .select("letter_url")
          .eq("id", id.data)
          .maybeSingle();
        if (!data) return new Response("Not found", { status: 404 });
        return proxyFdaFile(data.letter_url);
      },
    },
  },
});
