# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *

import json
import typing

# News sources rendered at refresh time. Google News RSS is stable,
# server-rendered text (no JS), and returns fresh, dated items.
ARC_FEED = (
    "https://news.google.com/rss/search"
    "?q=(Circle+Arc+blockchain)+OR+(Arc+L1+USDC)+OR+(Circle+stablecoin+network)"
    "&hl=en-US&gl=US&ceid=US:en"
)
ROTA_FEED = (
    "https://news.google.com/rss/search"
    "?q=ROSCA+OR+%22chit+fund%22+OR+%22rotating+savings%22+OR+%22group+savings%22"
    "+fintech+OR+blockchain+OR+remittance"
    "&hl=en-US&gl=US&ceid=US:en"
)

MAX_ITEMS_PER_CATEGORY = 6


class RotaNewsCurator(gl.Contract):
    """AI news desk for Rota: each refresh, validators fetch live news feeds,
    an LLM picks the most relevant stories for (a) the Arc ecosystem and
    (b) Rota's domain (ROSCAs / group savings / stablecoin remittances),
    and consensus stores the curated list on-chain as JSON."""

    news_json: str
    refresh_count: u256
    last_refreshed_by: str

    def __init__(self):
        self.news_json = "[]"
        self.refresh_count = u256(0)
        self.last_refreshed_by = ""

    @gl.public.write
    def refresh_news(self) -> typing.Any:
        arc_feed = ARC_FEED
        rota_feed = ROTA_FEED

        def curate() -> str:
            arc_raw = gl.nondet.web.render(arc_feed, mode="text")
            rota_raw = gl.nondet.web.render(rota_feed, mode="text")

            task = f"""
You are the news curator for Rota, a group-savings (ROSCA / chit fund / somiti)
dApp built in USDC on Arc, Circle's stablecoin-native Layer-1 blockchain.

Below are two raw news feeds. Select the best, most relevant items:

- category "arc": news about the Arc blockchain, Circle, USDC, and the
  stablecoin-payments ecosystem. Prefer concrete ecosystem news (launches,
  integrations, listings, developer tooling) over price speculation.
- category "rota": news relevant to Rota's product domain — rotating savings
  (ROSCA, chit funds, tandas, susu, somiti), group/community savings, financial
  inclusion, and stablecoin remittances (especially South Asia corridors).

Pick at most {MAX_ITEMS_PER_CATEGORY} items per category. Skip duplicates,
paywalled junk, and items with no clear relevance. Summaries must be neutral,
factual, and one or two sentences.

=== FEED 1 (arc candidates) ===
{arc_raw[:20000]}
=== END FEED 1 ===

=== FEED 2 (rota candidates) ===
{rota_raw[:20000]}
=== END FEED 2 ===

Respond ONLY with a JSON array in exactly this shape (no prose, no markdown
fences; must parse with a strict JSON parser):
[
  {{
    "title": str,       // original headline
    "url": str,         // the article link from the feed
    "source": str,      // publication name
    "date": str,        // publication date, ISO 8601 (YYYY-MM-DD), "" if unknown
    "summary": str,     // 1-2 neutral sentences
    "category": str,    // "arc" or "rota"
    "relevance": int    // 1-10, how relevant/important for Rota users
  }}
]
"""
            result = gl.nondet.exec_prompt(task)
            result = result.replace("```json", "").replace("```", "").strip()
            # Round-trip so validators compare normalized JSON.
            return json.dumps(json.loads(result))

        curated = gl.eq_principle.prompt_comparative(
            curate,
            "Both outputs must be valid JSON arrays of news items covering "
            "substantially the same stories, with matching categories and "
            "urls drawn from the same feeds; summaries may be worded "
            "differently but must be factually consistent",
        )

        # Deterministic sanity check before committing to storage.
        items = json.loads(curated)
        assert isinstance(items, list)
        clean: list = []
        for it in items:
            if not isinstance(it, dict):
                continue
            if it.get("category") not in ("arc", "rota"):
                continue
            if not it.get("title") or not it.get("url"):
                continue
            clean.append(
                {
                    "title": str(it["title"]),
                    "url": str(it["url"]),
                    "source": str(it.get("source", "")),
                    "date": str(it.get("date", "")),
                    "summary": str(it.get("summary", "")),
                    "category": it["category"],
                    "relevance": max(1, min(10, int(it.get("relevance", 5)))),
                }
            )
        clean.sort(key=lambda x: x["relevance"], reverse=True)

        self.news_json = json.dumps(clean)
        self.refresh_count = u256(self.refresh_count + 1)
        self.last_refreshed_by = gl.message.sender_address.as_hex

        return {"stored": len(clean)}

    @gl.public.view
    def get_news(self) -> str:
        """Curated items as a JSON string (see refresh_news for the shape)."""
        return self.news_json

    @gl.public.view
    def get_meta(self) -> dict[str, typing.Any]:
        return {
            "refresh_count": self.refresh_count,
            "last_refreshed_by": self.last_refreshed_by,
        }
