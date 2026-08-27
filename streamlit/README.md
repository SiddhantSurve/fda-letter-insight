# FDA Content Monitoring — Streamlit view

A read-only Streamlit app that talks to the same backend as the web app.
Useful for internal exploration and CSV pulls; the web app stays the public,
indexable, multi-user site.

## Run

```bash
python -m pip install -r streamlit/requirements.txt

export SUPABASE_URL="https://<project>.supabase.co"
export SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
export LOVABLE_API_KEY="..."          # optional: enables Summarize / Ask

streamlit run streamlit/app.py
```

## What it does

- **Warning Letters / Untitled Letters** — search, issuing-office filter, sort
  (Newest first, Oldest first, Company A–Z), pagination, links to the response
  and close-out documents.
- **Full text** — uses text stored in the backend; anything missing is fetched
  live from fda.gov (HTML or PDF) and cached.
- **Summarize** — the same Issue → Response/Resolution → Next steps prompt as
  the web app, capped at 15 lines.
- **Ask** — chat scoped to one letter plus its response and close-out docs.
- **Commercial Archive** — the video catalog.
- **Download CSV** — exports the currently filtered result set.

## What it deliberately does not do

- **No auth.** It reads with the publishable key, so it only sees data the
  public read policies allow. Per-user chat threads and role-gated views stay
  in the web app.
- **No ingestion.** Scraping, the hourly cron and email notifications keep
  running in Lovable Cloud; this app never writes.
- **No routes/SEO.** Streamlit is a single page — permalinks and metadata live
  in the web app.

## Notes

- Data is cached for 5 minutes; "Reload from backend" in the sidebar clears it.
- Fetched documents are cached for a day to stay polite to fda.gov.
- For a scheduled CSV instead of an interactive view, use
  `scripts/export_letters.py`.
