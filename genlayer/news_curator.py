# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *

import json
import typing

# News sources rendered at refresh time. Google News RSS is stable,
# server-rendered text (no JS), and returns fresh, dated items; the crypto
# market sites are rendered as text and mined for relevant headlines.
FEEDS: list[tuple[str, str]] = [
    (
        "Google News — Arc / Circle / USDC",
        "https://news.google.com/rss/search"
        "?q=(Circle+Arc+blockchain)+OR+(Arc+L1+USDC)+OR+(Circle+stablecoin+network)"
        "&hl=en-US&gl=US&ceid=US:en",
    ),
    (
        "Google News — group savings / ROSCA",
        "https://news.google.com/rss/search"
        "?q=ROSCA+OR+%22chit+fund%22+OR+%22rotating+savings%22+OR+%22group+savings%22"
        "+fintech+OR+blockchain+OR+remittance"
        "&hl=en-US&gl=US&ceid=US:en",
    ),
    ("CoinMarketCap news", "https://coinmarketcap.com/headlines/news/"),
    ("CoinGecko news", "https://www.coingecko.com/en/news"),
    (
        "TradingView crypto news",
        "https://www.tradingview.com/markets/cryptocurrencies/news/",
    ),
]

MAX_CHARS_PER_FEED = 8000
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
        # Each validator fetches the feeds itself; content can differ slightly
        # between fetches, so consensus uses the NON-comparative principle:
        # the leader's LLM curates, validators only judge that the output is a
        # faithful curation of *their* copy of the feeds.
        def fetch_feeds() -> str:
            parts: list[str] = []
            for label, url in FEEDS:
                try:
                    raw = gl.nondet.web.render(url, mode="text")
                except Exception:
                    # A source being down must not kill the whole refresh.
                    continue
                parts.append(
                    f"=== FEED: {label} ({url}) ===\n"
                    + raw[:MAX_CHARS_PER_FEED]
                    + f"\n=== END FEED: {label} ==="
                )
            if not parts:
                raise gl.vm.UserError("all news sources unreachable")
            return "\n\n".join(parts)

        task = f"""
You are the news curator for Rota, a group-savings (ROSCA / chit fund / somiti)
dApp built in USDC on Arc, Circle's stablecoin-native Layer-1 blockchain.

The input contains several raw news feeds (Google News queries plus the news
sections of CoinMarketCap, CoinGecko, and TradingView). Select the best, most
relevant items across all of them:

- category "arc": news about the Arc blockchain, Circle, USDC, stablecoins,
  and the stablecoin-payments ecosystem. Prefer concrete ecosystem news
  (launches, integrations, listings, developer tooling) over price speculation.
- category "rota": news relevant to Rota's product domain — rotating savings
  (ROSCA, chit funds, tandas, susu, somiti), group/community savings, financial
  inclusion, and stablecoin remittances.

Pick at most {MAX_ITEMS_PER_CATEGORY} items per category. Skip duplicates,
paywalled junk, general crypto price chatter, and items with no clear
relevance. Summaries must be neutral, factual, and one or two sentences.
If the exact article link is not visible in the input, set "url" to the feed
page the story appeared on (the URL in the FEED header); never invent URLs.

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
        criteria = """
The output is a valid JSON array of news-item objects with exactly the keys
title, url, source, date, summary, category, relevance. Every category is
"arc" or "rota" and each category has at most 6 items. The items plausibly
correspond to stories present in the input feeds (headlines may be reworded
slightly and the validator's copy of the feeds may differ a little from the
leader's, including some feeds being missing — that is acceptable). Summaries
are neutral and consistent with the headlines. No fabricated stories on topics
absent from the input.
"""
        curated = gl.eq_principle.prompt_non_comparative(
            fetch_feeds, task=task, criteria=criteria
        )
        curated = curated.replace("```json", "").replace("```", "").strip()

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
