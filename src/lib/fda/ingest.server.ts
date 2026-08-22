import {
  FDA_ORIGIN,
  htmlToPlainText,
  parseUntitledHtml,
  parseWarningRows,
  type LetterKind,
  type ScrapedLetter,
} from "./parse";

const UA = "Mozilla/5.0 (compatible; FDA-Letters-Archive/1.0)";
const WARNING_AJAX =
  `${FDA_ORIGIN}/datatables/views/ajax?view_display_id=warning_letter_solr_block&view_name=warning_letter_solr_index`;
const UNTITLED_URL =
  `${FDA_ORIGIN}/drugs/warning-letters-and-notice-violation-letters-pharmaceutical-companies/untitled-letters`;

export type IngestOptions = {
  trigger: "cron" | "manual";
  kinds?: LetterKind[];
  /** "incremental" scans the newest pages, "full" walks the entire catalog. */
  mode?: "incremental" | "full";
  /** How many letters missing body text to hydrate in this run. */
  hydrateLimit?: number;
};

export type IngestResult = {
  scanned: number;
  inserted: number;
  updated: number;
  hydrated: number;
  newLetterIds: string[];
  byKind: Record<string, { scanned: number; inserted: number }>;
};

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchWarningLetters(mode: "incremental" | "full"): Promise<ScrapedLetter[]> {
  const pageSize = 500;
  const maxPages = mode === "full" ? 12 : 1;
  const out: ScrapedLetter[] = [];

  for (let page = 0; page < maxPages; page++) {
    const url = `${WARNING_AJAX}&length=${pageSize}&start=${page * pageSize}`;
    const raw = await fetchText(url);
    if (!raw) break;
    let payload: { data?: string[][]; recordsTotal?: number };
    try {
      payload = JSON.parse(raw) as { data?: string[][]; recordsTotal?: number };
    } catch {
      break;
    }
    const rows = payload.data ?? [];
    out.push(...parseWarningRows(rows));
    if (rows.length < pageSize) break;
    if (payload.recordsTotal && out.length >= payload.recordsTotal) break;
  }
  return out;
}

async function fetchUntitledLetters(): Promise<ScrapedLetter[]> {
  const html = await fetchText(UNTITLED_URL);
  return html ? parseUntitledHtml(html) : [];
}

export async function fetchDocumentText(url: string): Promise<string | null> {
  if (/\.pdf($|\?)|\/download/i.test(url)) return null; // binary; served through the file proxy
  const html = await fetchText(url);
  if (!html) return null;
  const text = htmlToPlainText(html);
  return text ? text.slice(0, 120_000) : null;
}

/**
 * The single ingestion code path. Both the hourly cron hook and the "Refresh
 * catalog" button call this exact function so behaviour can never diverge.
 */
export async function runIngest(options: IngestOptions): Promise<IngestResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const kinds: LetterKind[] = options.kinds ?? ["warning", "untitled"];
  const mode = options.mode ?? "incremental";
  const hydrateLimit = options.hydrateLimit ?? 15;

  const result: IngestResult = {
    scanned: 0,
    inserted: 0,
    updated: 0,
    hydrated: 0,
    newLetterIds: [],
    byKind: {},
  };

  const { data: run } = await supabaseAdmin
    .from("ingest_runs")
    .insert({ trigger: options.trigger, status: "running" })
    .select("id")
    .single();

  try {
    for (const kind of kinds) {
      const scraped =
        kind === "warning" ? await fetchWarningLetters(mode) : await fetchUntitledLetters();
      result.scanned += scraped.length;
      result.byKind[kind] = { scanned: scraped.length, inserted: 0 };
      if (scraped.length === 0) continue;

      const urls = scraped.map((l) => l.letter_url);
      const existing = new Map<string, string>();
      for (let i = 0; i < urls.length; i += 400) {
        const { data } = await supabaseAdmin
          .from("letters")
          .select("id, letter_url")
          .eq("letter_kind", kind)
          .in("letter_url", urls.slice(i, i + 400));
        for (const row of data ?? []) existing.set(row.letter_url, row.id);
      }

      const fresh = scraped.filter((l) => !existing.has(l.letter_url));
      const stale = scraped.filter((l) => existing.has(l.letter_url));

      for (let i = 0; i < fresh.length; i += 200) {
        const batch = fresh.slice(i, i + 200).map((l) => ({
          letter_kind: l.letter_kind,
          fda_id: l.fda_id,
          posted_on: l.posted_on,
          letter_issued_on: l.letter_issued_on,
          company_name: l.company_name,
          issuing_office: l.issuing_office,
          subject: l.subject,
          letter_url: l.letter_url,
          response_url: l.response_url,
          closeout_url: l.closeout_url,
          extra_links: l.extra_links,
        }));
        const { data } = await supabaseAdmin
          .from("letters")
          .upsert(batch, { onConflict: "letter_kind,letter_url", ignoreDuplicates: true })
          .select("id");
        const ids = (data ?? []).map((r) => r.id);
        result.inserted += ids.length;
        result.byKind[kind]!.inserted += ids.length;
        result.newLetterIds.push(...ids);
      }

      // Keep response / close-out links current on letters we already have.
      for (const letter of stale) {
        if (!letter.response_url && !letter.closeout_url && letter.extra_links.length === 0) continue;
        const id = existing.get(letter.letter_url)!;
        const { error } = await supabaseAdmin
          .from("letters")
          .update({
            response_url: letter.response_url,
            closeout_url: letter.closeout_url,
            extra_links: letter.extra_links,
            posted_on: letter.posted_on,
          })
          .eq("id", id)
          .or(`response_url.is.null,closeout_url.is.null`);
        if (!error) result.updated += 1;
      }
    }

    // Hydrate a slice of letters that still have no stored body text.
    const { data: needsText } = await supabaseAdmin
      .from("letters")
      .select("id, letter_url")
      .is("full_text", null)
      .order("posted_on", { ascending: false, nullsFirst: false })
      .limit(hydrateLimit);

    for (const letter of needsText ?? []) {
      const text = await fetchDocumentText(letter.letter_url);
      if (!text) continue;
      await supabaseAdmin
        .from("letters")
        .update({ full_text: text, text_fetched_at: new Date().toISOString() })
        .eq("id", letter.id);
      result.hydrated += 1;
    }

    if (run?.id) {
      await supabaseAdmin
        .from("ingest_runs")
        .update({
          status: "success",
          finished_at: new Date().toISOString(),
          scanned_count: result.scanned,
          inserted_count: result.inserted,
          updated_count: result.updated,
        })
        .eq("id", run.id);
    }
    return result;
  } catch (error) {
    if (run?.id) {
      await supabaseAdmin
        .from("ingest_runs")
        .update({
          status: "error",
          finished_at: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        })
        .eq("id", run.id);
    }
    throw error;
  }
}
