# FDA Letter Insight

Build a production web app (TanStack Start + React + Tailwind + Lovable Cloud backend) that mirrors, archives, summarizes, and answers questions about FDA enforcement letters.

1. Data sources (two separate catalogs)
Warning Letters: https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/compliance-actions-and-activities/warning-letters — scrape via the FDA JSON datatables endpoint that backs the table (NOT the rendered HTML), so all ~3,500 records across 400+ pages are captured, not just page one.
Untitled Letters (OPDP): https://www.fda.gov/drugs/warning-letters-and-notice-violation-letters-pharmaceutical-companies/untitled-letters
Store both in shared tables with a letter_kind discriminator (warning | untitled). Capture: posted date, letter issue date, company name, issuing office, subject, letter URL, and any linked Response letter, Close-out letter, and promotional/reference materials.

2. Ingestion
Full backfill on first run; incremental scraping afterwards (dedupe on FDA letter ID / URL).
Scheduled hourly scrape via pg_cron hitting an internal endpoint under /api/public/hooks/... protected by an x-cron-secret header.
A manual "Refresh catalog" button in the UI that runs the exact same code path as the cron (no divergence between manual and scheduled refresh — this caused bugs before).
Fetch and store the full text of each letter (and its response/close-out documents) for retrieval; proxy PDFs/files through /api/letter-pdf/:id and /api/letter-file/:id to avoid cross-origin/download issues.
3. UI
Landing page / is a chooser with exactly two entry points: Warning Letters archive and Untitled Letters archive. Nothing else.
Banner at the top of the app: "This is a vibe coding product built by Sid — not formalized and currently in testing."
Each archive page: search, filters, and a Sort control (Newest first — default, Oldest first, Company A–Z). Default DB ordering must be posted_on DESC.
No bulk download buttons. Each letter card shows metadata, clickable badges linking to the Response letter / Close-out letter / promotional docs, plus two actions:
Summarize — generates a very concise markdown summary, max 15 lines, structured as Issue → Response/Resolution → Next steps, incorporating the response and close-out documents when present.
Ask me — opens the chatbot scoped to that single document (including its response/close-out/promotional attachments).
A global chatbot at the top of each archive that answers questions across the whole corpus.
4. Chat / RAG
Streaming chat endpoint at /api/chat using the Lovable AI Gateway.
Retrieval over stored letter text (not just metadata) — on-demand fetch of full document context when a letter is in scope.
Authenticated users get persistent chat threads with history; enforce ownership checks so no user can read another user's thread.
5. Auth & email
Supabase auth via Lovable Cloud, email + Google sign-in, no anonymous signups, no auto-confirm.
user_roles table with an enum and a has_role security-definer function; never store roles on profiles.
Email notifications: notification_preferences and letter_notifications_sent tables; branded React Email templates; send to all opted-in users whenever a new warning or untitled letter is ingested (from both the cron and the manual refresh path). Also brand the auth emails (signup, recovery, magic link).
6. Design
Palette: medical red + white, clean clinical/corporate feel. All colors as semantic tokens in src/styles.css; no hardcoded color utilities. Do not name any company as the palette inspiration.
7. Reliability requirements (learned the hard way)
Keep all @tanstack/* package versions mutually compatible — mismatched react-router / react-start / router-plugin versions cause Cannot read properties of undefined (reading 'component').
Add a global stale-build recovery boundary: catch dynamic-import/chunk-fetch failures and reading 'component' errors, clear caches and service workers, and hard-reload once (guard with sessionStorage so it can't loop).
Assume users may be on restrictive corporate networks; avoid fragile lazy-chunk dependencies for core routes.
8. Security & RLS
RLS enabled with explicit policies and GRANTs on every public table.
Internal hook endpoints authenticated by secret; validate all input.
9. SEO
Unique head() metadata (title, description, og/twitter tags) on every route including the index.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://fda-letter-insight.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/5b845fbc-f79d-4955-95f0-6650536f4ba9).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
