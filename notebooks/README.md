# FDA letters CSV export

Two files, same code path:

- `fda_letters_export.ipynb` — interactive notebook for Jupyter / Databricks
- `../scripts/export_letters.py` — headless version for scheduled jobs

## Setup

Set these environment variables in your Jupyter / Databricks environment:

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://tfahrhnkzvldnvihxxij.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_FdkgX7WeEVpkjOhtoYPoJQ_7CibS2mn` |

Optional: `LETTERS_CSV_PATH` (default `/tmp/fda-letters/letters.csv`),
`MAX_FETCH_PER_RUN` (default 400), `FETCH_MISSING_TEXT=0` to skip live fetching.

Install dependencies:

```bash
pip install -r ../scripts/requirements.txt
```

## Output columns

`id, letter_kind, fda_id, posted_on, letter_issued_on, company_name, issuing_office,
subject, letter_url, response_url, closeout_url, updated_at, letter_text, text_chars`

`letter_text` is the full contents of the letter. Text already stored by the app is
reused; anything missing is downloaded from fda.gov (HTML parsed inline, PDFs extracted
with `pypdf`), up to `MAX_FETCH_PER_RUN` letters per run so the backlog clears quickly
without hammering fda.gov.

## Freshness

The app scrapes fda.gov hourly and writes to the database; this job reads that database
every 10 minutes. End-to-end lag from an FDA posting to your CSV is ≤ ~70 minutes.

## Scheduling

Run `python scripts/export_letters.py` every 10 minutes via your scheduler of choice
(Databricks Jobs, cron, Airflow, etc.).
