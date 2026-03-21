import re
import httpx
import feedparser
from fastapi import APIRouter
from backend.config import load_config

router = APIRouter()

FEED_HEADERS = {
    "User-Agent":      "Mozilla/5.0 (X11; Linux x86_64; rv:122.0) Gecko/20100101 Firefox/122.0",
    "Accept":          "application/rss+xml,application/atom+xml,application/xml,text/xml,*/*;q=0.8",
    "Accept-Language": "bg,en-US;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control":   "no-cache",
}


async def fetch_one_feed(client: httpx.AsyncClient, source: dict) -> list[dict]:
    try:
        r = await client.get(source["url"], headers=FEED_HEADERS, follow_redirects=True, timeout=14)
        r.raise_for_status()
        feed  = feedparser.parse(r.content)
        items = []
        for entry in feed.entries[:10]:
            title   = entry.get("title", "")
            summary = re.sub(r"<[^>]+>", "", entry.get("summary", entry.get("description", "")) or "")[:240]
            link    = entry.get("link", "")
            pub     = entry.get("published", entry.get("updated", ""))
            if title:
                items.append({"title": title, "summary": summary, "link": link, "published": pub})
        return items
    except Exception as ex:
        return [{"title": f"[{source['name']}] Feed unavailable", "summary": str(ex), "link": "", "published": ""}]


@router.get("/api/news")
async def news():
    cfg     = load_config()
    sources = [s for s in cfg.get("news", {}).get("sources", []) if s.get("enabled", True)]
    if not sources:
        return {}
    result = {}
    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        for source in sources:
            items   = await fetch_one_feed(client, source)
            country = source.get("country", "Other")
            result.setdefault(country, {})[source["id"]] = {
                "name":  source["name"],
                "items": items,
            }
    return result
