import { fetchDocumentText } from "./ingest.server";

export type LetterContext = {
  id: string;
  heading: string;
  text: string;
};

const MAX_LETTER_CHARS = 18_000;
const MAX_DOC_CHARS = 8_000;

/** Loads a single letter plus its response / close-out / promotional documents. */
export async function getLetterContext(letterId: string): Promise<LetterContext | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: letter } = await supabaseAdmin
    .from("letters")
    .select("*")
    .eq("id", letterId)
    .maybeSingle();
  if (!letter) return null;

  let body = letter.full_text;
  if (!body) {
    body = await fetchDocumentText(letter.letter_url);
    if (body) {
      await supabaseAdmin
        .from("letters")
        .update({ full_text: body, text_fetched_at: new Date().toISOString() })
        .eq("id", letter.id);
    }
  }

  const attachments: { doc_type: string; url: string }[] = [];
  if (letter.response_url) attachments.push({ doc_type: "response", url: letter.response_url });
  if (letter.closeout_url) attachments.push({ doc_type: "closeout", url: letter.closeout_url });
  for (const link of (letter.extra_links ?? []) as { url?: string; title?: string }[]) {
    if (link?.url) attachments.push({ doc_type: "promotional", url: link.url });
  }

  const { data: storedDocs } = await supabaseAdmin
    .from("letter_documents")
    .select("doc_type, url, content")
    .eq("letter_id", letter.id);
  const stored = new Map((storedDocs ?? []).map((d) => [d.url, d.content]));

  const docTexts: string[] = [];
  for (const attachment of attachments.slice(0, 6)) {
    let content = stored.get(attachment.url) ?? null;
    if (content === undefined || content === null) {
      content = await fetchDocumentText(attachment.url);
      await supabaseAdmin.from("letter_documents").upsert(
        {
          letter_id: letter.id,
          url: attachment.url,
          doc_type: attachment.doc_type as "response" | "closeout" | "promotional",
          content,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "letter_id,url" },
      );
    }
    if (content) {
      docTexts.push(
        `--- ${attachment.doc_type.toUpperCase()} DOCUMENT (${attachment.url}) ---\n${content.slice(0, MAX_DOC_CHARS)}`,
      );
    } else {
      docTexts.push(`--- ${attachment.doc_type.toUpperCase()} DOCUMENT available at ${attachment.url} (PDF, text not extractable) ---`);
    }
  }

  const heading = `${letter.company_name} — ${letter.subject ?? "FDA letter"} (${letter.letter_kind} letter, issued ${letter.letter_issued_on ?? "unknown"}, posted ${letter.posted_on ?? "unknown"}, office: ${letter.issuing_office ?? "n/a"})`;

  return {
    id: letter.id,
    heading,
    text: [
      heading,
      `Letter URL: ${letter.letter_url}`,
      body ? `--- LETTER TEXT ---\n${body.slice(0, MAX_LETTER_CHARS)}` : "--- LETTER TEXT unavailable (PDF only) ---",
      ...docTexts,
    ].join("\n\n"),
  };
}

/** Keyword retrieval across the stored corpus (metadata + letter body text). */
export async function searchCorpus(
  query: string,
  kind: "warning" | "untitled" | null,
  limit = 6,
): Promise<LetterContext[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const terms = query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3)
    .slice(0, 5);

  let request = supabaseAdmin
    .from("letters")
    .select("id, company_name, subject, issuing_office, posted_on, letter_issued_on, letter_kind, letter_url, full_text")
    .order("posted_on", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (kind) request = request.eq("letter_kind", kind);
  if (terms.length) {
    const filters = terms
      .flatMap((t) => [`company_name.ilike.%${t}%`, `subject.ilike.%${t}%`, `full_text.ilike.%${t}%`])
      .join(",");
    request = request.or(filters);
  }

  const { data } = await request;
  return (data ?? []).map((letter) => ({
    id: letter.id,
    heading: `${letter.company_name} — ${letter.subject ?? ""}`,
    text: [
      `${letter.company_name} (${letter.letter_kind} letter, posted ${letter.posted_on ?? "unknown"}, issued ${letter.letter_issued_on ?? "unknown"})`,
      `Office: ${letter.issuing_office ?? "n/a"}`,
      `Subject: ${letter.subject ?? "n/a"}`,
      `URL: ${letter.letter_url}`,
      letter.full_text ? letter.full_text.slice(0, 6_000) : "(body text not yet retrieved)",
    ].join("\n"),
  }));
}
