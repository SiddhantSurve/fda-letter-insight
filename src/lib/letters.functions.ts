import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const kindSchema = z.enum(["warning", "untitled"]);
const sortSchema = z.enum(["newest", "oldest", "company"]);

const listSchema = z.object({
  kind: kindSchema,
  search: z.string().trim().max(200).optional().default(""),
  office: z.string().trim().max(200).optional().default(""),
  sort: sortSchema.optional().default("newest"),
  page: z.number().int().min(0).max(500).optional().default(0),
  pageSize: z.number().int().min(1).max(50).optional().default(20),
});

export type LetterRow = {
  id: string;
  letter_kind: "warning" | "untitled";
  fda_id: string | null;
  posted_on: string | null;
  letter_issued_on: string | null;
  company_name: string;
  issuing_office: string | null;
  subject: string | null;
  letter_url: string;
  response_url: string | null;
  closeout_url: string | null;
  extra_links: { url: string; title: string; doc_type: string }[];
};

export const listLetters = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => listSchema.parse(input))
  .handler(async ({ data }) => {
    const { createPublicServerClient } = await import("@/lib/supabase-public.server");
    const supabase = createPublicServerClient();

    let query = supabase
      .from("letters")
      .select(
        "id, letter_kind, fda_id, posted_on, letter_issued_on, company_name, issuing_office, subject, letter_url, response_url, closeout_url, extra_links",
        { count: "exact" },
      )
      .eq("letter_kind", data.kind);

    if (data.search) {
      const term = data.search.replace(/[%,()]/g, " ").trim();
      if (term) {
        query = query.or(
          `company_name.ilike.%${term}%,subject.ilike.%${term}%,issuing_office.ilike.%${term}%`,
        );
      }
    }
    if (data.office) query = query.eq("issuing_office", data.office);

    if (data.sort === "company") query = query.order("company_name", { ascending: true });
    else
      query = query.order("posted_on", {
        ascending: data.sort === "oldest",
        nullsFirst: false,
      });
    query = query.order("id", { ascending: true });

    const from = data.page * data.pageSize;
    const { data: rows, count, error } = await query.range(from, from + data.pageSize - 1);
    if (error) throw new Error(error.message);

    return {
      letters: (rows ?? []) as unknown as LetterRow[],
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

export const listOffices = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ kind: kindSchema }).parse(input))
  .handler(async ({ data }) => {
    const { createPublicServerClient } = await import("@/lib/supabase-public.server");
    const supabase = createPublicServerClient();
    const { data: rows } = await supabase
      .from("letters")
      .select("issuing_office")
      .eq("letter_kind", data.kind)
      .not("issuing_office", "is", null)
      .limit(4000);
    const offices = [...new Set((rows ?? []).map((r) => r.issuing_office!).filter(Boolean))];
    offices.sort();
    return { offices };
  });

export const getCatalogStatus = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({}).optional().parse(input ?? {}))
  .handler(async () => {
    const { createPublicServerClient } = await import("@/lib/supabase-public.server");
    const supabase = createPublicServerClient();
    const [{ count: warning }, { count: untitled }, { data: runs }] = await Promise.all([
      supabase
        .from("letters")
        .select("id", { count: "exact", head: true })
        .eq("letter_kind", "warning"),
      supabase
        .from("letters")
        .select("id", { count: "exact", head: true })
        .eq("letter_kind", "untitled"),
      supabase
        .from("ingest_runs")
        .select("started_at, finished_at, status, inserted_count, trigger")
        .order("started_at", { ascending: false })
        .limit(1),
    ]);
    return {
      warningCount: warning ?? 0,
      untitledCount: untitled ?? 0,
      lastRun: runs?.[0] ?? null,
    };
  });

/**
 * Manual "Refresh catalog" — deliberately calls the exact same runIngest()
 * used by the hourly cron hook, so scheduled and manual refreshes cannot drift.
 */
export const refreshCatalog = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        kinds: z.array(kindSchema).min(1).max(2).optional(),
        mode: z.enum(["incremental", "full"]).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: recent } = await supabaseAdmin
      .from("ingest_runs")
      .select("started_at, status")
      .order("started_at", { ascending: false })
      .limit(1);
    const last = recent?.[0];
    if (last && last.status === "running" && Date.now() - Date.parse(last.started_at) < 120_000) {
      return { ok: false as const, throttled: true, message: "A refresh is already running." };
    }

    const { runIngest } = await import("@/lib/fda/ingest.server");
    const { queueLetterNotifications } = await import("@/lib/fda/notify.server");
    const result = await runIngest({
      trigger: "manual",
      ...(data.kinds ? { kinds: data.kinds } : {}),
      ...(data.mode ? { mode: data.mode } : {}),
    });

    const notified = await queueLetterNotifications(result.newLetterIds);
    return { ok: true as const, throttled: false, notified, ...result };

  });

/** Public single-letter fetch, used by the shareable /letters/$id permalink. */
export const getLetter = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { createPublicServerClient } = await import("@/lib/supabase-public.server");
    const supabase = createPublicServerClient();
    const { data: row } = await supabase
      .from("letters")
      .select(
        "id, letter_kind, fda_id, posted_on, letter_issued_on, company_name, issuing_office, subject, letter_url, response_url, closeout_url, extra_links",
      )
      .eq("id", data.id)
      .maybeSingle();
    return { letter: (row ?? null) as unknown as LetterRow | null };
  });
