"""
FDA Content Monitoring — Streamlit view.

Reads the same backend (letters + videos) as the web app, with search,
filters, sort, full letter text, AI summaries and a per-letter chat.

Run:
    streamlit run app.py

Environment variables:
    SUPABASE_URL              https://<project>.supabase.co
    SUPABASE_PUBLISHABLE_KEY  sb_publishable_...
Optional:
    LOVABLE_API_KEY           enables Summarize / Ask (AI gateway)
    AI_MODEL                  default google/gemini-3.7-flash
"""

from __future__ import annotations

import io
import os
import re

import pandas as pd
import requests
import streamlit as st

SUPABASE_URL = os.environ.get(
    "SUPABASE_URL", "https://tfahrhnkzvldnvihxxij.supabase.co"
).rstrip("/")
SUPABASE_KEY = os.environ.get(
    "SUPABASE_PUBLISHABLE_KEY", os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY", "")
)
LOVABLE_API_KEY = os.environ.get("LOVABLE_API_KEY", "")
AI_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions"
AI_MODEL = os.environ.get("AI_MODEL", "google/gemini-3.7-flash")

UA = "Mozilla/5.0 (compatible; FDA-Content-Monitoring/1.0)"
PAGE_SIZE = 20

LETTER_COLUMNS = [
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

SUMMARY_PROMPT = """Summarize this FDA enforcement letter in markdown, MAXIMUM 15 lines total.
Use exactly these three sections and nothing else:

**Issue** — what the FDA found (bullet points, max 5).
**Response / Resolution** — what the company said or did; use the response and close-out documents if present, otherwise state "No response on file".
**Next steps** — what remains outstanding or what the close-out concluded (max 3 bullets).

Be dense and factual. No preamble, no closing remarks."""


# ---------------------------------------------------------------- backend ---
def rest_headers() -> dict[str, str]:
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    if SUPABASE_KEY.startswith("sb_"):
        headers.pop("Authorization")  # new-format keys are not JWTs
    return headers


@st.cache_data(ttl=300, show_spinner=False)
def load_letters(kind: str) -> pd.DataFrame:
    """Page through the public letters table via the Data API."""
    rows, page, size = [], 0, 1000
    while True:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/letters",
            headers={
                **rest_headers(),
                "Range-Unit": "items",
                "Range": f"{page * size}-{page * size + size - 1}",
            },
            params={
                "select": ",".join(LETTER_COLUMNS),
                "letter_kind": f"eq.{kind}",
                "order": "posted_on.desc.nullslast",
            },
            timeout=60,
        )
        resp.raise_for_status()
        batch = resp.json()
        rows.extend(batch)
        if len(batch) < size:
            break
        page += 1
    df = pd.DataFrame(rows, columns=LETTER_COLUMNS)
    for col in ("company_name", "issuing_office", "subject", "full_text"):
        df[col] = df[col].fillna("")
    return df


@st.cache_data(ttl=300, show_spinner=False)
def load_videos() -> pd.DataFrame:
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/videos",
        headers=rest_headers(),
        params={
            "select": "id,title,description,video_url,thumbnail_url,published_at,summary",
            "order": "published_at.desc.nullslast",
            "limit": "500",
        },
        timeout=60,
    )
    resp.raise_for_status()
    return pd.DataFrame(resp.json())


# ------------------------------------------------------------ letter text ---
def html_to_text(html: str) -> str:
    body = re.sub(r"(?is)<(script|style|nav|header|footer)[^>]*>.*?</\1>", " ", html)
    main = re.search(r"(?is)<article[^>]*>(.*?)</article>", body) or re.search(
        r"(?is)<main[^>]*>(.*?)</main>", body
    )
    if main:
        body = main.group(1)
    body = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</li>|</h[1-6]>", "\n", body)
    text = re.sub(r"(?s)<[^>]+>", " ", body)
    for entity, char in (
        ("&nbsp;", " "),
        ("&amp;", "&"),
        ("&lt;", "<"),
        ("&gt;", ">"),
        ("&#39;", "'"),
        ("&quot;", '"'),
    ):
        text = text.replace(entity, char)
    text = re.sub(r"[ \t\xa0]+", " ", text)
    return re.sub(r"\n\s*\n\s*\n+", "\n\n", text).strip()


def pdf_to_text(data: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:
        return ""
    try:
        reader = PdfReader(io.BytesIO(data))
        return "\n".join((p.extract_text() or "") for p in reader.pages).strip()
    except Exception:
        return ""


@st.cache_data(ttl=86400, show_spinner=False)
def fetch_document_text(url: str) -> str:
    """Download a document from fda.gov and return plain text (HTML or PDF)."""
    if not url:
        return ""
    try:
        resp = requests.get(url, headers={"user-agent": UA}, timeout=45)
        resp.raise_for_status()
    except Exception:
        return ""
    ctype = resp.headers.get("content-type", "").lower()
    if "pdf" in ctype or url.lower().endswith(".pdf"):
        return pdf_to_text(resp.content)
    return html_to_text(resp.text)


def letter_context(row: pd.Series) -> str:
    """Full text of the letter plus its response / close-out documents."""
    parts = []
    body = (row.get("full_text") or "").strip() or fetch_document_text(row["letter_url"])
    parts.append(f"# WARNING/UNTITLED LETTER\n{body}")
    for label, key in (("RESPONSE LETTER", "response_url"), ("CLOSE-OUT LETTER", "closeout_url")):
        url = row.get(key)
        if url:
            text = fetch_document_text(url)
            if text:
                parts.append(f"# {label}\n{text}")
    header = (
        f"Company: {row.get('company_name')}\n"
        f"Issuing office: {row.get('issuing_office')}\n"
        f"Subject: {row.get('subject')}\n"
        f"Posted: {row.get('posted_on')}\n"
    )
    return (header + "\n\n" + "\n\n".join(parts))[:90_000]


# ------------------------------------------------------------------- ai -----
def call_ai(messages: list[dict], stream: bool = False):
    if not LOVABLE_API_KEY:
        raise RuntimeError("LOVABLE_API_KEY is not set — AI features are disabled.")
    return requests.post(
        AI_ENDPOINT,
        headers={
            "Authorization": f"Bearer {LOVABLE_API_KEY}",
            "Content-Type": "application/json",
        },
        json={"model": AI_MODEL, "stream": stream, "messages": messages},
        timeout=120,
        stream=stream,
    )


def ai_text(messages: list[dict]) -> str:
    resp = call_ai(messages)
    if resp.status_code == 429:
        return "_Rate limit reached — try again shortly._"
    if not resp.ok:
        return "_The AI service is unavailable right now._"
    payload = resp.json()
    return (payload.get("choices") or [{}])[0].get("message", {}).get("content", "").strip()


# ------------------------------------------------------------------- ui -----
st.set_page_config(page_title="FDA Content Monitoring", page_icon="🩺", layout="wide")

st.markdown(
    """
    <style>
      :root { --fda-red: #c8102e; }
      .stApp h1, .stApp h2 { color: var(--fda-red); }
      div[data-testid="stExpander"] details {
        border-left: 3px solid var(--fda-red);
        border-radius: 6px;
      }
      .fda-banner {
        background: #fdecee; border: 1px solid var(--fda-red); color: #7a0b1c;
        padding: 0.6rem 0.9rem; border-radius: 6px; font-size: 0.9rem;
        margin-bottom: 1rem;
      }
      .fda-meta { color: #5b6470; font-size: 0.85rem; }
    </style>
    """,
    unsafe_allow_html=True,
)

st.markdown(
    '<div class="fda-banner">This is a vibe coding product built by Sid — '
    "not formalized and currently in testing.</div>",
    unsafe_allow_html=True,
)
st.title("FDA Content Monitoring")

if not SUPABASE_KEY:
    st.error("Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY before starting the app.")
    st.stop()

with st.sidebar:
    st.header("Choose Content Types")
    view = st.radio(
        "Archive",
        ["Warning Letters", "Untitled Letters", "Commercial Archive"],
        label_visibility="collapsed",
    )
    if st.button("Reload from backend"):
        st.cache_data.clear()
        st.rerun()
    if not LOVABLE_API_KEY:
        st.caption("Set LOVABLE_API_KEY to enable Summarize and Ask.")


def render_letter(row: pd.Series) -> None:
    posted = row.get("posted_on") or "—"
    with st.expander(f"**{row['company_name'] or 'Unknown company'}** · {posted}"):
        st.markdown(
            f'<div class="fda-meta">{row.get("issuing_office") or "—"}'
            f' · issued {row.get("letter_issued_on") or "—"}'
            f' · FDA ID {row.get("fda_id") or "—"}</div>',
            unsafe_allow_html=True,
        )
        if row.get("subject"):
            st.write(row["subject"])

        links = [f"[Letter]({row['letter_url']})"] if row.get("letter_url") else []
        if row.get("response_url"):
            links.append(f"[Response letter]({row['response_url']})")
        if row.get("closeout_url"):
            links.append(f"[Close-out letter]({row['closeout_url']})")
        if links:
            st.markdown(" · ".join(links))

        col_a, col_b = st.columns(2)
        key = row["id"]
        if col_a.button("Summarize", key=f"sum-{key}", disabled=not LOVABLE_API_KEY):
            with st.spinner("Summarizing…"):
                summary = ai_text(
                    [
                        {"role": "system", "content": SUMMARY_PROMPT},
                        {"role": "user", "content": letter_context(row)},
                    ]
                )
            st.session_state[f"summary-{key}"] = summary
        if col_b.button("Ask about this letter", key=f"ask-{key}", disabled=not LOVABLE_API_KEY):
            st.session_state["chat_letter"] = key

        if st.session_state.get(f"summary-{key}"):
            st.markdown(st.session_state[f"summary-{key}"])

        if st.toggle("Show full text", key=f"text-{key}"):
            with st.spinner("Loading document…"):
                body = (row.get("full_text") or "").strip() or fetch_document_text(
                    row["letter_url"]
                )
            st.text_area(
                "Letter text", body or "No text available.", height=400, key=f"body-{key}"
            )


def letters_view(kind: str, title: str, description: str) -> None:
    st.subheader(title)
    st.caption(description)

    with st.spinner("Loading letters…"):
        df = load_letters(kind)

    filters = st.columns([3, 2, 2])
    search = filters[0].text_input("Search company, subject or office", key=f"q-{kind}")
    offices = ["All issuing offices"] + sorted(o for o in df["issuing_office"].unique() if o)
    office = filters[1].selectbox("Issuing office", offices, key=f"o-{kind}")
    sort = filters[2].selectbox(
        "Sort", ["Newest first", "Oldest first", "Company A–Z"], key=f"s-{kind}"
    )

    view_df = df
    if search:
        term = search.strip().lower()
        mask = (
            view_df["company_name"].str.lower().str.contains(term, regex=False)
            | view_df["subject"].str.lower().str.contains(term, regex=False)
            | view_df["issuing_office"].str.lower().str.contains(term, regex=False)
        )
        view_df = view_df[mask]
    if office != "All issuing offices":
        view_df = view_df[view_df["issuing_office"] == office]

    if sort == "Company A–Z":
        view_df = view_df.sort_values("company_name", kind="stable")
    else:
        view_df = view_df.sort_values(
            "posted_on", ascending=(sort == "Oldest first"), na_position="last", kind="stable"
        )

    total = len(view_df)
    st.caption(f"{total:,} letters")
    if total == 0:
        st.info("No letters match those filters.")
        return

    pages = max(1, -(-total // PAGE_SIZE))
    page = st.number_input(
        f"Page (1–{pages})", min_value=1, max_value=pages, value=1, key=f"p-{kind}"
    )
    start = (int(page) - 1) * PAGE_SIZE
    for _, row in view_df.iloc[start : start + PAGE_SIZE].iterrows():
        render_letter(row)

    st.download_button(
        "Download these results as CSV",
        view_df.drop(columns=["full_text"]).to_csv(index=False).encode("utf-8"),
        file_name=f"{kind}-letters.csv",
        mime="text/csv",
    )

    chat_id = st.session_state.get("chat_letter")
    if chat_id is not None and chat_id in set(df["id"]):
        chat_panel(df[df["id"] == chat_id].iloc[0])


def chat_panel(row: pd.Series) -> None:
    st.divider()
    st.subheader(f"Ask about {row['company_name'] or 'this letter'}")
    st.caption("Scoped to this letter and its response and close-out documents.")

    history_key = f"chat-{row['id']}"
    history = st.session_state.setdefault(history_key, [])
    for message in history:
        with st.chat_message(message["role"]):
            st.markdown(message["content"])

    question = st.chat_input("Ask a question about this letter")
    if not question:
        return
    history.append({"role": "user", "content": question})
    with st.chat_message("user"):
        st.markdown(question)
    with st.chat_message("assistant"):
        with st.spinner("Thinking…"):
            answer = ai_text(
                [
                    {
                        "role": "system",
                        "content": (
                            "You answer questions about a single FDA enforcement letter. "
                            "Use only the provided document context. If the answer is not "
                            "in the documents, say so plainly.\n\n"
                            f"DOCUMENTS:\n{letter_context(row)}"
                        ),
                    },
                    *history,
                ]
            )
        st.markdown(answer)
    history.append({"role": "assistant", "content": answer})


def videos_view() -> None:
    st.subheader("Commercial Archive")
    st.caption("Archived commercials ingested alongside the letter catalog.")
    with st.spinner("Loading videos…"):
        df = load_videos()
    if df.empty:
        st.info("No videos in the archive yet.")
        return
    search = st.text_input("Search videos")
    if search:
        term = search.strip().lower()
        df = df[df["title"].fillna("").str.lower().str.contains(term, regex=False)]
    for _, row in df.head(60).iterrows():
        cols = st.columns([1, 3])
        if row.get("thumbnail_url"):
            cols[0].image(row["thumbnail_url"], use_container_width=True)
        cols[1].markdown(f"**[{row['title']}]({row['video_url']})**")
        cols[1].markdown(
            f'<div class="fda-meta">{row.get("published_at") or ""}</div>',
            unsafe_allow_html=True,
        )
        if row.get("summary"):
            cols[1].write(row["summary"])


if view == "Warning Letters":
    letters_view(
        "warning",
        "Warning Letters",
        "FDA warning letters with responses, close-outs and referenced materials.",
    )
elif view == "Untitled Letters":
    letters_view(
        "untitled",
        "Untitled Letters",
        "OPDP untitled letters issued to pharmaceutical companies.",
    )
else:
    videos_view()
