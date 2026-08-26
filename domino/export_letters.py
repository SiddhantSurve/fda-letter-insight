"""
FDA Letters -> CSV export for Domino Data Lab.

Run as a Domino Scheduled Job (e.g. every 30 minutes):
    python domino/export_letters.py

Output: /mnt/data/fda-letters/letters.csv  (falls back to ./letters.csv)

Columns include `letter_text`: the full contents of the letter pulled from
its FDA URL. Text already stored in the app database is reused; anything
missing is fetched live (HTML or PDF) and cached in-run.

Environment variables (set in Domino: Project > Settings > Environment Variables):
    SUPABASE_URL              https://tfahrhnkzvldnvihxxij.supabase.co
    SUPABASE_PUBLISHABLE_KEY  sb_publishable_...
Optional:
    LETTERS_CSV_PATH          override output path
    FETCH_MISSING_TEXT        "0" to skip live fetching (default "1")
    MAX_FETCH_PER_RUN         cap on live fetches per run (default 150)
"""

from __future__ import annotations

import io
import os
import re
import sys
import time

import pandas as pd
import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://tfahrhnkzvldnvihxxij.supabase.co").rstrip("/")
SUPABASE_KEY = os.environ.get(
    "SUPABASE_PUBLISHABLE_KEY",
    os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY", ""),
)
OUT_PATH = os.environ.get("LETTERS_CSV_PATH", "/mnt/data/fda-letters/letters.csv")
FETCH_MISSING = os.environ.get("FETCH_MISSING_TEXT", "1") != "0"
MAX_FETCH = int(os.environ.get("MAX_FETCH_PER_RUN", "150"))

UA = "Mozilla/5.0 (compatible; FDA-Letters-Export/1.0)"
COLUMNS = [
    "id",
    "letter_kind",
    "fda_id",
    "posted_on",
    "letter_issued_on",
    "company_name",
    "issuing_office",
    "subject",
    "letter_url",
    "response_url",
    "closeout_url",
    "full_text",
    "updated_at",
]


def fetch_letters() -> pd.DataFrame:
    """Page through the public letters table via the Data API."""
    if not SUPABASE_KEY:
        sys.exit("SUPABASE_PUBLISHABLE_KEY is not set")

    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    if SUPABASE_KEY.startswith("sb_"):
        headers.pop("Authorization")  # new-format keys are not JWTs

    rows, page, size = [], 0, 1000
    while True:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/letters",
            headers={**headers, "Range-Unit": "items",
                     "Range": f"{page * size}-{page * size + size - 1}"},
            params={"select": ",".join(COLUMNS), "order": "posted_on.desc.nullslast"},
            timeout=60,
        )
        resp.raise_for_status()
        batch = resp.json()
        rows.extend(batch)
        if len(batch) < size:
            break
        page += 1
    return pd.DataFrame(rows, columns=COLUMNS)


def html_to_text(html: str) -> str:
    body = re.sub(r"(?is)<(script|style|nav|header|footer)[^>]*>.*?</\1>", " ", html)
    main = re.search(r'(?is)<article[^>]*>(.*?)</article>', body) or \
           re.search(r'(?is)<main[^>]*>(.*?)</main>', body)
    if main:
        body = main.group(1)
    body = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</li>|</h[1-6]>", "\n", body)
    text = re.sub(r"(?s)<[^>]+>", " ", body)
    text = (text.replace("&nbsp;", " ").replace("&amp;", "&")
                .replace("&lt;", "<").replace("&gt;", ">").replace("&#39;", "'")
                .replace("&quot;", '"'))
    text = re.sub(r"[ \t\xa0]+", " ", text)
    return re.sub(r"\n\s*\n\s*\n+", "\n\n", text).strip()


def pdf_to_text(data: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:  # pragma: no cover - optional dependency
        try:
            from PyPDF2 import PdfReader  # type: ignore
        except ImportError:
            return ""
    try:
        reader = PdfReader(io.BytesIO(data))
        return "\n".join((p.extract_text() or "") for p in reader.pages).strip()
    except Exception:
        return ""


def fetch_letter_text(url: str) -> str:
    """Download a letter and return plain text (handles HTML and PDF)."""
    try:
        resp = requests.get(url, headers={"user-agent": UA}, timeout=45)
        resp.raise_for_status()
    except Exception as exc:
        print(f"  ! fetch failed {url}: {exc}")
        return ""
    ctype = resp.headers.get("content-type", "").lower()
    if "pdf" in ctype or url.lower().endswith(".pdf"):
        return pdf_to_text(resp.content)
    return html_to_text(resp.text)


def main() -> None:
    print("Pulling letters from the app database ...")
    df = fetch_letters()
    print(f"  {len(df)} letters")

    df["letter_text"] = df["full_text"].fillna("")

    if FETCH_MISSING:
        missing = df.index[df["letter_text"].str.strip() == ""].tolist()
        print(f"Fetching contents for {min(len(missing), MAX_FETCH)} of {len(missing)} letters without stored text ...")
        for n, idx in enumerate(missing[:MAX_FETCH], start=1):
            url = df.at[idx, "letter_url"]
            df.at[idx, "letter_text"] = fetch_letter_text(url)
            if n % 25 == 0:
                print(f"  {n} fetched")
            time.sleep(0.4)  # be polite to fda.gov

    df["letter_text"] = (df["letter_text"].fillna("")
                         .str.replace(r"\r\n?", "\n", regex=True).str.slice(0, 200_000))
    df["text_chars"] = df["letter_text"].str.len()
    df = df.drop(columns=["full_text"])

    out = OUT_PATH
    try:
        os.makedirs(os.path.dirname(out), exist_ok=True)
    except OSError:
        out = "letters.csv"
    df.to_csv(out, index=False)
    print(f"Wrote {len(df)} rows -> {out}")
    print(f"  with contents: {(df['text_chars'] > 0).sum()}  |  empty: {(df['text_chars'] == 0).sum()}")


if __name__ == "__main__":
    main()
