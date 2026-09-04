import json
import os
import pathlib
from typing import List, Literal, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

FEATHERLESS_API_KEY = os.getenv("FEATHERLESS_API_KEY")
MODEL = "Qwen/Qwen2.5-7B-Instruct"
HISTORY_PATH = pathlib.Path(__file__).parent / "domain_history.json"

client = OpenAI(api_key=FEATHERLESS_API_KEY, base_url="https://api.featherless.ai/v1")

app = FastAPI(title="Vault backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SessionEvent(BaseModel):
    type: str
    domain: Optional[str] = None
    hop: Optional[int] = None
    target: Optional[str] = None


class OutboundData(BaseModel):
    field_type: Literal["credential", "payment_card", "government_id", "generic_text"]
    action: str


class AnalyzeRequest(BaseModel):
    redirect_chain: List[str] = []
    session_events: List[SessionEvent] = []
    outbound_data: Optional[OutboundData] = None
    user_privacy_preference: str = (
        "warn me before sharing anything sensitive with a site I haven't visited before"
    )


class AnalyzeResponse(BaseModel):
    verdict: Literal["ALLOW", "WARN", "BLOCK"]
    reason: str
    cached: bool = False


def load_history() -> dict:
    if HISTORY_PATH.exists():
        return json.loads(HISTORY_PATH.read_text())
    return {}


def save_history(history: dict) -> None:
    HISTORY_PATH.write_text(json.dumps(history, indent=2))


def cache_key(req: AnalyzeRequest) -> str:
    domain = req.redirect_chain[-1] if req.redirect_chain else "unknown"
    event_type = req.outbound_data.field_type if req.outbound_data else "site_only"
    return f"{domain}:{event_type}"


def build_prompt(req: AnalyzeRequest) -> str:
    events_desc = (
        "\n".join(
            f"- {e.type}"
            + (f" (hop {e.hop})" if e.hop is not None else "")
            + (f" targeting {e.target}" if e.target else "")
            for e in req.session_events
        )
        or "none"
    )
    outbound_desc = (
        f"The user is about to submit a '{req.outbound_data.field_type}' field via "
        f"'{req.outbound_data.action}'."
        if req.outbound_data
        else "No outbound data submission is happening right now."
    )
    chain_desc = " -> ".join(req.redirect_chain) if req.redirect_chain else "direct visit, no redirects"

    return f"""You are a browser security assistant. Judge this browsing session and respond with STRICT JSON only, no markdown, no extra text:
{{"verdict": "ALLOW" | "WARN" | "BLOCK", "reason": "<one plain-English sentence>"}}

Redirect chain (in order visited): {chain_desc}

Session events observed:
{events_desc}

{outbound_desc}

User's stated privacy preference: "{req.user_privacy_preference}"

Weigh the redirect chain length, what is being accessed or submitted, and the user's stated
preference together. The same action can be fine in one context and risky in another —
judge this specific situation, don't apply a fixed rule."""


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    history = load_history()
    key = cache_key(req)
    if key in history:
        cached = history[key]
        return AnalyzeResponse(verdict=cached["verdict"], reason=cached["reason"], cached=True)

    prompt = build_prompt(req)
    completion = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=200,
        temperature=0.2,
    )
    raw = (completion.choices[0].message.content or "").strip()

    try:
        cleaned = raw.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        parsed = json.loads(cleaned)
        verdict = parsed["verdict"]
        reason = parsed["reason"]
    except Exception:
        verdict, reason = "WARN", "Could not fully parse the model's response, defaulting to a cautious warning."

    history[key] = {"verdict": verdict, "reason": reason}
    save_history(history)
    return AnalyzeResponse(verdict=verdict, reason=reason, cached=False)


@app.post("/privacy-report")
def privacy_report(req: AnalyzeRequest) -> dict:
    events_desc = "\n".join(f"- {e.type}" for e in req.session_events) or "no notable events"
    chain_desc = " -> ".join(req.redirect_chain) if req.redirect_chain else "direct visit"

    prompt = f"""Summarize this browsing session's privacy exposure in exactly 3 plain-English
sentences for a non-technical user. Be specific about what was requested or shared and by whom.

Redirect chain: {chain_desc}
Events: {events_desc}"""

    completion = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=150,
        temperature=0.4,
    )
    return {"report": (completion.choices[0].message.content or "").strip()}


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
