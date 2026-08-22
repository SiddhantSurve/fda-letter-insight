export type LetterKind = "warning" | "untitled";
export type LetterDocType = "letter" | "response" | "closeout" | "promotional" | "other";

export type ScrapedLink = { url: string; title: string; doc_type: LetterDocType };

export type ScrapedLetter = {
  letter_kind: LetterKind;
  fda_id: string | null;
  posted_on: string | null;
  letter_issued_on: string | null;
  company_name: string;
  issuing_office: string | null;
  subject: string | null;
  letter_url: string;
  response_url: string | null;
  closeout_url: string | null;
  extra_links: ScrapedLink[];
};

export const FDA_ORIGIN = "https://www.fda.gov";

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "\u2019",
  lsquo: "\u2018",
  ldquo: "\u201c",
  rdquo: "\u201d",
  mdash: "\u2014",
  ndash: "\u2013",
  reg: "\u00ae",
  trade: "\u2122",
  deg: "\u00b0",
  hellip: "\u2026",
};

export function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-zA-Z]+);/g, (m, name: string) => ENTITIES[name] ?? m);
}

export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function absoluteUrl(href: string): string {
  if (!href) return "";
  if (/^https?:\/\//i.test(href)) return href;
  return FDA_ORIGIN + (href.startsWith("/") ? href : `/${href}`);
}

export function extractLinks(html: string): { url: string; text: string }[] {
  const out: { url: string; text: string }[] = [];
  const re = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const url = absoluteUrl(decodeEntities(m[1] ?? ""));
    if (!url) continue;
    out.push({ url, text: stripTags(m[2] ?? "") });
  }
  return out;
}

function isoDateFrom(html: string): string | null {
  const attr = /datetime="([^"]+)"/.exec(html);
  if (attr?.[1]) return attr[1].slice(0, 10);
  const text = stripTags(html);
  const us = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  if (us) {
    const [, mm, dd, yyyy] = us;
    return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }
  return null;
}

function idFromUrl(url: string): string | null {
  try {
    const path = new URL(url).pathname.replace(/\/$/, "");
    return path.split("/").pop() ?? null;
  } catch {
    return null;
  }
}

/** Rows come from the FDA datatables JSON endpoint backing the Warning Letters table. */
export function parseWarningRows(rows: string[][]): ScrapedLetter[] {
  const letters: ScrapedLetter[] = [];
  for (const row of rows) {
    const companyCell = row[2] ?? "";
    const link = extractLinks(companyCell)[0];
    if (!link) continue;
    const response = extractLinks(row[5] ?? "")[0]?.url ?? null;
    const closeout = extractLinks(row[6] ?? "")[0]?.url ?? null;
    letters.push({
      letter_kind: "warning",
      fda_id: idFromUrl(link.url),
      posted_on: isoDateFrom(row[0] ?? ""),
      letter_issued_on: isoDateFrom(row[1] ?? ""),
      company_name: link.text || "Unknown company",
      issuing_office: stripTags(row[3] ?? "") || null,
      subject: stripTags(row[4] ?? "") || null,
      letter_url: link.url,
      response_url: response,
      closeout_url: closeout,
      extra_links: [],
    });
  }
  return letters;
}

/** The OPDP Untitled Letters catalog is a static HTML table. */
export function parseUntitledHtml(html: string): ScrapedLetter[] {
  const start = html.indexOf("<table");
  if (start === -1) return [];
  const table = html.slice(start, html.indexOf("</table>", start));
  const rows = table.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  const letters: ScrapedLetter[] = [];

  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1] ?? "");
    if (cells.length < 3) continue;

    const companyCell = cells[1] ?? "";
    const links = extractLinks(companyCell);
    const primary =
      links.find((l) => /untitled letter/i.test(l.text)) ?? links[0];
    if (!primary) continue;

    const company = stripTags((/<p>([\s\S]*?)<\/p>/i.exec(companyCell)?.[1] ?? companyCell.split("<ul")[0] ?? ""));
    const extras: ScrapedLink[] = links
      .filter((l) => l.url !== primary.url)
      .map((l) => ({ url: l.url, title: l.text || "Reference material", doc_type: "promotional" as const }));

    letters.push({
      letter_kind: "untitled",
      fda_id: idFromUrl(primary.url),
      posted_on: isoDateFrom(cells[0] ?? ""),
      letter_issued_on: isoDateFrom(cells[0] ?? ""),
      company_name: company || primary.text || "Unknown company",
      issuing_office: "Office of Prescription Drug Promotion (OPDP)",
      subject: stripTags(cells[2] ?? "") || null,
      letter_url: primary.url,
      response_url: extractLinks(cells[3] ?? "")[0]?.url ?? null,
      closeout_url: extractLinks(cells[4] ?? "")[0]?.url ?? null,
      extra_links: extras,
    });
  }
  return letters;
}

/** Convert an FDA letter page into plain readable text. */
export function htmlToPlainText(html: string): string {
  let body = html;
  const main = /<article[\s\S]*?<\/article>/i.exec(html) ?? /<main[\s\S]*?<\/main>/i.exec(html);
  if (main) body = main[0];
  body = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  return decodeEntities(body.replace(/<[^>]*>/g, ""))
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}
