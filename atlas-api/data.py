"""
ATLAS API — Data Fetchers v9 (Polygon-Only)
================================================
PRIMARY AND ONLY DATA PROVIDER: Polygon.io

Philosophy: Polygon is paid, real-time, and comprehensive.
If Polygon fails, we return None — better honest gaps than wrong data.

Polygon endpoints used:
  /v2/aggs/ticker/{tk}/range/1/day/{from}/{to}      — Historical OHLCV
  /v2/snapshot/locale/us/markets/stocks/tickers     — All stock snapshots (real-time)
  /v2/snapshot/locale/global/markets/crypto/tickers — Crypto snapshots
  /v3/reference/tickers/{tk}                        — Company details
  /v2/aggs/ticker/{tk}/prev                         — Previous close
  /v1/marketstatus/now                              — Market open/closed
  /v1/marketstatus/upcoming                         — Market holidays
  /v2/reference/news                                — Ticker news
  /fed/v1/treasury-yields                           — Treasury yields
  /benzinga/v2/news                                 — Macro news (Benzinga)
  /benzinga/v1/consensus-ratings/{tk}               — Analyst consensus
  /benzinga/v1/ratings                              — Analyst ratings
  /benzinga/v1/guidance                             — Corporate guidance
  /benzinga/v1/earnings                             — Earnings calendar
  /stocks/v1/short-interest                         — Short interest
  /stocks/v1/short-volume                           — Short volume
  /vX/reference/financials                          — Company financials
  /v3/reference/dividends                           — Dividends
  /v1/related-companies/{tk}                        — Related tickers
  /vX/reference/tickers/{tk}/events                 — Ticker events

Exceptions (Polygon does not provide these):
  - CNN Fear & Greed Index (CNN proprietary)
  - BTC Dominance (CoinGecko proprietary)
"""
import requests
import pandas as pd
from datetime import datetime, timedelta
import pytz

from config import (POLYGON_KEY, POLYGON_BASE, CORE_FOUR, CRYPTO_POLYGON_MAP,
                    EVENT_DAYS, CACHE_TTL)
from cache import cached


# ═══════════════════════════════════════════════════════════════
#  Polygon helper
# ═══════════════════════════════════════════════════════════════

def _poly(path, params=None, timeout=10):
    """Make a Polygon API request. Returns JSON dict or None."""
    url = f"{POLYGON_BASE}{path}"
    p = params or {}
    p["apiKey"] = POLYGON_KEY
    try:
        r = requests.get(url, params=p, timeout=timeout)
        if r.status_code == 200:
            return r.json()
    except Exception:
        pass
    return None


def session_key():
    et = pytz.timezone("America/New_York")
    now = datetime.now(et)
    c = now.replace(hour=16, minute=30, second=0, microsecond=0)
    if now < c:
        c -= timedelta(days=1)
    while c.weekday() >= 5:
        c -= timedelta(days=1)
    return c.strftime("%Y-%m-%d")


# ═══════════════════════════════════════════════════════════════
#  HISTORICAL OHLCV — Polygon
# ═══════════════════════════════════════════════════════════════

@cached(ttl=CACHE_TTL["chart"], key_func=lambda tk, period="2y": f"daily:{tk}:{period}")
def get_daily(tk, period="2y"):
    """
    Fetch daily OHLCV bars from Polygon.
    Returns DataFrame with columns: Open, High, Low, Close, Volume
    Returns None if Polygon fails.
    """
    period_days = {"6mo": 180, "1y": 365, "2y": 730, "5y": 1825}
    days = period_days.get(period, 730)
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

    poly_tk = CRYPTO_POLYGON_MAP.get(tk, tk)

    data = _poly(
        f"/v2/aggs/ticker/{poly_tk}/range/1/day/{start_date}/{end_date}",
        {"adjusted": "true", "sort": "asc", "limit": "50000"}
    )
    if data and data.get("resultsCount", 0) > 50:
        results = data["results"]
        df = pd.DataFrame(results)
        df["date"] = pd.to_datetime(df["t"], unit="ms")
        df = df.set_index("date")
        df = df.rename(columns={"o": "Open", "h": "High", "l": "Low",
                                "c": "Close", "v": "Volume"})
        df = df[["Open", "High", "Low", "Close", "Volume"]].dropna()
        if len(df) >= 50:
            return df

    return None


# ═══════════════════════════════════════════════════════════════
#  REAL-TIME PRICES — Polygon Snapshot
# ═══════════════════════════════════════════════════════════════

@cached(ttl=CACHE_TTL["snapshot"], key_func=lambda tickers: f"prices:{','.join(sorted(tickers))}")
def get_prices(tickers):
    """
    Get real-time prices for a list of tickers.
    Uses Polygon's todaysChangePerc field directly — handles pre/post-market correctly.
    """
    if not tickers:
        return {}
    out = {}

    stock_tickers = [t for t in tickers if not t.endswith("-USD")]
    crypto_tickers = [t for t in tickers if t.endswith("-USD")]

    # Stocks — one call for all
    if stock_tickers:
        tickers_param = ",".join(stock_tickers)
        data = _poly(
            "/v2/snapshot/locale/us/markets/stocks/tickers",
            {"tickers": tickers_param}
        )
        if data and data.get("tickers"):
            for snap in data["tickers"]:
                sym = snap.get("ticker", "")
                if sym not in stock_tickers:
                    continue

                # Best price: lastTrade > minute close > day close > prevDay close
                price = (
                    snap.get("lastTrade", {}).get("p")
                    or snap.get("min", {}).get("c")
                    or snap.get("day", {}).get("c")
                    or snap.get("prevDay", {}).get("c", 0)
                )

                # Use Polygon's calculated % change (handles pre/post-market)
                change = snap.get("todaysChangePerc", 0)
                if change is None:
                    change = 0

                if price and price > 0:
                    out[sym] = {
                        "price": round(price, 2),
                        "change": round(change, 2)
                    }

    # Crypto — one call per ticker (no bulk endpoint)
    for tk in crypto_tickers:
        poly_tk = CRYPTO_POLYGON_MAP.get(tk)
        if not poly_tk:
            continue
        data = _poly(f"/v2/snapshot/locale/global/markets/crypto/tickers/{poly_tk}")
        if data and data.get("ticker"):
            snap = data["ticker"]
            price = (
                snap.get("lastTrade", {}).get("p")
                or snap.get("min", {}).get("c")
                or snap.get("day", {}).get("c")
                or snap.get("prevDay", {}).get("c", 0)
            )
            change = snap.get("todaysChangePerc", 0)
            if change is None:
                change = 0
            if price and price > 0:
                out[tk] = {
                    "price": round(price, 2),
                    "change": round(change, 2)
                }

    return out


# ═══════════════════════════════════════════════════════════════
#  COMPANY INFO — Polygon Reference
# ═══════════════════════════════════════════════════════════════

@cached(ttl=CACHE_TTL["reference"], key_func=lambda tk: f"name:{tk}")
def get_name(tk):
    """Company name from Polygon ticker details."""
    data = _poly(f"/v3/reference/tickers/{tk}")
    if data and data.get("results"):
        name = data["results"].get("name")
        return name if name else tk
    return tk


@cached(ttl=CACHE_TTL["reference"], key_func=lambda tk: f"details:{tk}")
def get_ticker_details(tk):
    """Full ticker details from Polygon."""
    data = _poly(f"/v3/reference/tickers/{tk}")
    if data and data.get("results"):
        r = data["results"]
        return {
            "name": r.get("name", tk),
            "market_cap": r.get("market_cap"),
            "sector": r.get("sic_description", ""),
            "primary_exchange": r.get("primary_exchange", ""),
            "type": r.get("type", ""),
            "locale": r.get("locale", ""),
            "currency": r.get("currency_name", ""),
            "description": r.get("description", ""),
            "homepage": r.get("homepage_url", ""),
            "total_employees": r.get("total_employees"),
            "list_date": r.get("list_date"),
        }
    return {"name": tk}


# ═══════════════════════════════════════════════════════════════
#  MARKET INDICES — Polygon (SPY proxy for S&P)
# ═══════════════════════════════════════════════════════════════

@cached(ttl=CACHE_TTL["gate"], key_func=lambda: "sp500")
def get_sp500():
    """S&P 500 historical closes via SPY × 10 for gate checks."""
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=730)).strftime("%Y-%m-%d")

    data = _poly(
        f"/v2/aggs/ticker/SPY/range/1/day/{start_date}/{end_date}",
        {"adjusted": "true", "sort": "asc", "limit": "50000"}
    )
    if data and data.get("resultsCount", 0) > 200:
        results = data["results"]
        df = pd.DataFrame(results)
        df["date"] = pd.to_datetime(df["t"], unit="ms")
        df = df.set_index("date")
        return (df["c"] * 10).rename("Close")

    return None


@cached(ttl=CACHE_TTL["gate"], key_func=lambda: "vix")
def get_vix():
    """
    VIX proxy via VIXY ETF.
    Polygon plan doesn't include Indices, so VIXY is the closest proxy
    available on the Stocks tier. Returns VIXY price; gate.py thresholds
    are calibrated for VIXY values, not raw VIX.

    VIXY → VIX rough mapping:
      VIXY $40   ≈ VIX 18
      VIXY $45   ≈ VIX 20
      VIXY $55   ≈ VIX 25
      VIXY $65+  ≈ VIX 30+
    """
    data = _poly(
        "/v2/snapshot/locale/us/markets/stocks/tickers",
        {"tickers": "VIXY"}
    )
    if data and data.get("tickers"):
        for snap in data["tickers"]:
            if snap.get("ticker") == "VIXY":
                price = (
                    snap.get("lastTrade", {}).get("p")
                    or snap.get("min", {}).get("c")
                    or snap.get("day", {}).get("c")
                    or snap.get("prevDay", {}).get("c", 0)
                )
                if price and price > 0:
                    return round(price, 2)
    return None


# ═══════════════════════════════════════════════════════════════
#  MARKET STATUS — Polygon
# ═══════════════════════════════════════════════════════════════

@cached(ttl=CACHE_TTL["market_status"], key_func=lambda: "mkt_status")
def get_market_status():
    """Real market status from Polygon."""
    data = _poly("/v1/marketstatus/now")
    if data:
        return {
            "market": data.get("market", "unknown"),
            "exchanges": data.get("exchanges", {}),
            "currencies": data.get("currencies", {}),
            "server_time": data.get("serverTime"),
            "is_open": data.get("market") == "open",
            "after_hours": data.get("afterHours", False),
            "early_hours": data.get("earlyHours", False),
        }
    return {"market": "unknown", "is_open": False}


@cached(ttl=86400, key_func=lambda: "mkt_holidays")
def get_market_holidays():
    """Upcoming market holidays from Polygon."""
    data = _poly("/v1/marketstatus/upcoming")
    if data and isinstance(data, list):
        return [{"date": h.get("date"), "name": h.get("name"),
                 "status": h.get("status"), "exchange": h.get("exchange")}
                for h in data[:10]]
    return []


# ═══════════════════════════════════════════════════════════════
#  MACRO PULSE
# ═══════════════════════════════════════════════════════════════

@cached(ttl=CACHE_TTL["pulse"], key_func=lambda: "fg")
def get_fear_greed():
    """CNN Fear & Greed Index — Polygon does not provide this."""
    try:
        r = requests.get(
            "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
            timeout=5, headers={"User-Agent": "Mozilla/5.0"})
        d = r.json()["fear_and_greed"]
        return {"score": float(d["score"]), "label": d["rating"]}
    except Exception:
        return {"score": None, "label": None}


@cached(ttl=CACHE_TTL["pulse"], key_func=lambda: "fed")
def get_fed_rate():
    """
    Fed funds rate — derived from Polygon Treasury Yields if available.
    Returns None if not available (Polygon focuses on Treasury, not Fed Funds).
    """
    data = _poly("/fed/v1/treasury-yields", {"order": "desc", "limit": "5"})
    if data and data.get("results"):
        for r in data["results"]:
            # Some plans expose fed_funds_rate in this endpoint
            ff = r.get("fed_funds_rate") or r.get("federal_funds_rate")
            if ff is not None:
                return round(float(ff), 2)
    return None


@cached(ttl=CACHE_TTL["treasury"], key_func=lambda: "10y")
def get_10y_yield():
    """10-Year Treasury yield from Polygon."""
    data = _poly("/fed/v1/treasury-yields", {"order": "desc", "limit": "5"})
    if data and data.get("results"):
        for r in data["results"]:
            val = r.get("ten_year")
            if val is not None:
                return round(float(val), 2)
    return None


@cached(ttl=CACHE_TTL["treasury"], key_func=lambda: "yield_curve")
def get_yield_curve():
    """
    Full yield curve from Polygon — for 2s10s inversion checks.
    Returns dict with 2y, 5y, 10y, 30y yields.
    """
    data = _poly("/fed/v1/treasury-yields", {"order": "desc", "limit": "5"})
    if data and data.get("results"):
        for r in data["results"]:
            two = r.get("two_year")
            ten = r.get("ten_year")
            if two is not None and ten is not None:
                return {
                    "two_year": round(float(two), 2),
                    "five_year": round(float(r.get("five_year", 0) or 0), 2) or None,
                    "ten_year": round(float(ten), 2),
                    "thirty_year": round(float(r.get("thirty_year", 0) or 0), 2) or None,
                    "spread_2s10s": round(float(ten) - float(two), 2),
                    "inverted": float(ten) < float(two),
                    "date": r.get("date"),
                }
    return None


@cached(ttl=CACHE_TTL["overview"], key_func=lambda: "btcdom")
def get_btc_dominance():
    """BTC dominance — Polygon does not provide this."""
    try:
        r = requests.get("https://api.coingecko.com/api/v3/global", timeout=8)
        return round(r.json()["data"]["market_cap_percentage"]["btc"], 1)
    except Exception:
        return None


# ═══════════════════════════════════════════════════════════════
#  CRYPTO — Polygon
# ═══════════════════════════════════════════════════════════════

@cached(ttl=CACHE_TTL["overview"], key_func=lambda: "crypto")
def get_crypto():
    """Core Four crypto prices from Polygon."""
    result = {}
    for cid, meta in CORE_FOUR.items():
        poly_tk = meta["poly"]
        data = _poly(f"/v2/snapshot/locale/global/markets/crypto/tickers/{poly_tk}")
        if data and data.get("ticker"):
            snap = data["ticker"]
            price = (
                snap.get("lastTrade", {}).get("p")
                or snap.get("min", {}).get("c")
                or snap.get("day", {}).get("c")
                or snap.get("prevDay", {}).get("c", 0)
            )
            change = snap.get("todaysChangePerc", 0)
            if change is None:
                change = 0
            if price and price > 0:
                result[cid] = {
                    "usd": round(price, 2),
                    "usd_24h_change": round(change, 2),
                    "usd_market_cap": None,  # Polygon doesn't provide crypto market cap
                }
    return result


# ═══════════════════════════════════════════════════════════════
#  EARNINGS — Benzinga via Polygon
# ═══════════════════════════════════════════════════════════════

@cached(ttl=CACHE_TTL["earnings"], key_func=lambda tk: f"earn:{tk}")
def check_earnings(tk):
    """Check if ticker has earnings within EVENT_DAYS. Returns (clear, date)."""
    # Benzinga earnings calendar via Polygon
    today = datetime.now().strftime("%Y-%m-%d")
    end = (datetime.now() + timedelta(days=EVENT_DAYS)).strftime("%Y-%m-%d")
    data = _poly("/benzinga/v1/earnings", {
        "tickers": tk,
        "date.gte": today,
        "date.lte": end,
        "limit": "5"
    })
    if data:
        results = data if isinstance(data, list) else data.get("results", [])
        if results:
            ev_date = results[0].get("date") or results[0].get("earnings_date")
            if ev_date:
                return (False, ev_date[:10])

    # Polygon ticker events (alternative source)
    data = _poly(f"/vX/reference/tickers/{tk}/events")
    if data and data.get("results", {}).get("events"):
        events = data["results"]["events"]
        now = datetime.now()
        for ev in events:
            if "earnings" in ev.get("type", "").lower():
                ev_date_str = ev.get("date", "")
                if ev_date_str:
                    try:
                        ev_date = datetime.strptime(ev_date_str[:10], "%Y-%m-%d")
                        days_until = (ev_date - now).days
                        if 0 <= days_until <= EVENT_DAYS:
                            return (False, ev_date_str[:10])
                    except Exception:
                        pass

    return True, None


@cached(ttl=CACHE_TTL["earnings"], key_func=lambda: "earnings_week")
def get_upcoming_earnings():
    """Upcoming earnings this week — Benzinga via Polygon."""
    today = datetime.now().strftime("%Y-%m-%d")
    end = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
    data = _poly("/benzinga/v1/earnings", {
        "date.gte": today,
        "date.lte": end,
        "limit": "50"
    })
    if data:
        results = data if isinstance(data, list) else data.get("results", [])
        return [{
            "ticker": e.get("ticker") or e.get("symbol"),
            "date": (e.get("date") or e.get("earnings_date") or "")[:10],
            "hour": e.get("time") or e.get("hour", ""),
            "estimate": e.get("eps_estimate") or e.get("epsEstimate"),
        } for e in results[:20] if (e.get("ticker") or e.get("symbol"))]
    return []


# ═══════════════════════════════════════════════════════════════
#  NEWS — Benzinga via Polygon
# ═══════════════════════════════════════════════════════════════

@cached(ttl=CACHE_TTL["news"], key_func=lambda: "news")
def get_macro_news():
    """Market news — Benzinga via Polygon."""
    MUST_HAVE = [
        "federal reserve", "fed ", "fomc", "interest rate", "rate hike", "rate cut",
        "inflation", "cpi", "pce", "gdp", "jobs report", "payroll", "unemployment",
        "s&p 500", "nasdaq", "dow jones", "vix", "market rally", "market selloff",
        "market crash", "market drop", "stock market", "wall street",
        "recession", "earnings beat", "earnings miss", "guidance", "outlook",
        "oil price", "crude", "treasury yield", "10-year", "bond yield",
        "tariff", "trade war", "china trade", "bitcoin", "crypto market",
        "nvidia", "apple", "microsoft", "tesla", "amazon", "meta", "alphabet",
        "fed chair", "powell", "yellen", "debt ceiling", "bank failure",
        "ipo", "merger", "acquisition", "buyback", "dividend",
        "sanctions", "geopolitical", "war", "election", "pentagon",
        "sec", "doj", "antitrust", "regulation", "crypto regulation",
        "etf", "hedge fund", "short squeeze", "options", "volatility",
    ]
    BEAR = [
        "falls", "drops", "crashes", "declines", "warning", "recession", "concern",
        "misses", "disappoints", "cut guidance", "fear", "sells off", "plunges",
        "below expectations", "weaker", "slowdown", "contraction", "layoffs",
        "bankruptcy", "default", "crisis", "turmoil", "uncertainty", "risk",
        "loses", "sinks", "tumbles", "slumps", "retreats", "cut",
    ]
    BULL = [
        "rises", "gains", "rallies", "beats", "strong", "growth", "record high",
        "surges", "above expectations", "raises guidance", "expansion",
        "better than expected", "accelerates", "upgrade", "outperforms",
        "jumps", "soars", "climbs", "boosts", "record", "breakthrough",
    ]
    WARN = ["uncertain", "mixed", "flat", "awaits", "pending", "volatile", "caution", "watch"]

    def sentiment(text):
        t = text.lower()
        b = sum(1 for w in BULL if w in t)
        e = sum(1 for w in BEAR if w in t)
        if b > e: return "bull"
        if e > b: return "bear"
        if any(w in t for w in WARN): return "warn"
        return "neutral"

    seen = set()
    news = []

    # Benzinga news via Polygon
    data = _poly("/benzinga/v2/news", {"limit": "50"})
    items = []
    if data:
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict):
            items = data.get("results", data.get("news", []))

    for item in items:
        if len(news) >= 15:
            break
        hl = (item.get("title") or "").strip()
        if len(hl) < 15 or hl in seen:
            continue
        if any(kw in hl.lower() for kw in MUST_HAVE):
            seen.add(hl)
            news.append({
                "text": hl[:120],
                "sentiment": sentiment(hl),
                "source": item.get("author", "Benzinga")
            })

    # Supplement with Polygon ticker news
    if len(news) < 15:
        data = _poly("/v2/reference/news", {"limit": "50", "order": "desc"})
        if data and data.get("results"):
            for item in data["results"]:
                if len(news) >= 15:
                    break
                hl = (item.get("title") or "").strip()
                if len(hl) < 15 or hl in seen:
                    continue
                if any(kw in hl.lower() for kw in MUST_HAVE):
                    seen.add(hl)
                    news.append({
                        "text": hl[:120],
                        "sentiment": sentiment(hl),
                        "source": item.get("publisher", {}).get("name", "")
                    })

    return news


# ═══════════════════════════════════════════════════════════════
#  MARKET OVERVIEW — Polygon Snapshots
# ═══════════════════════════════════════════════════════════════

@cached(ttl=CACHE_TTL["overview"], key_func=lambda: "overview")
def get_market_overview():
    """Market overview — indexes via ETF proxies, crypto from Polygon."""
    result = {}

    etfs = {
        "S&P 500": {"sym": "SPY", "mult": 10},
        "NASDAQ":  {"sym": "QQQ", "mult": 37.2},
        "DOW":     {"sym": "DIA", "mult": 100},
        "RUSSELL": {"sym": "IWM", "mult": 10},
        "GOLD":    {"sym": "GLD", "mult": 1},
        "SILVER":  {"sym": "SLV", "mult": 1},
    }

    all_syms = ",".join([v["sym"] for v in etfs.values()])
    data = _poly("/v2/snapshot/locale/us/markets/stocks/tickers", {"tickers": all_syms})
    if data and data.get("tickers"):
        snap_map = {s["ticker"]: s for s in data["tickers"]}
        for label, info in etfs.items():
            snap = snap_map.get(info["sym"])
            if snap:
                price_raw = (
                    snap.get("lastTrade", {}).get("p")
                    or snap.get("min", {}).get("c")
                    or snap.get("day", {}).get("c")
                    or snap.get("prevDay", {}).get("c", 0)
                )
                change = snap.get("todaysChangePerc", 0) or 0
                if price_raw and price_raw > 0:
                    price = round(price_raw * info["mult"], 2) if info["mult"] != 1 else round(price_raw, 2)
                    result[label] = {"price": price, "change": round(change, 2)}

    # VIX proxy (VIXY)
    vix = get_vix()
    if vix:
        result["VIX"] = {"price": vix, "change": 0}

    # Crypto via Polygon
    for label, poly_tk in {"BTC": "X:BTCUSD", "ETH": "X:ETHUSD"}.items():
        data = _poly(f"/v2/snapshot/locale/global/markets/crypto/tickers/{poly_tk}")
        if data and data.get("ticker"):
            snap = data["ticker"]
            price = (
                snap.get("lastTrade", {}).get("p")
                or snap.get("min", {}).get("c")
                or snap.get("day", {}).get("c")
                or snap.get("prevDay", {}).get("c", 0)
            )
            change = snap.get("todaysChangePerc", 0) or 0
            if price and price > 0:
                result[label] = {
                    "price": round(price, 2),
                    "change": round(change, 2),
                }

    return result


# ═══════════════════════════════════════════════════════════════
#  SHORT INTEREST & SHORT VOLUME — Polygon (catalyst signals)
# ═══════════════════════════════════════════════════════════════

@cached(ttl=CACHE_TTL["shorts"], key_func=lambda tk: f"shorts:{tk}")
def get_short_interest(tk):
    """
    Short interest data from Polygon.
    Returns latest short interest with ratio and history.
    """
    data = _poly("/stocks/v1/short-interest", {
        "ticker": tk, "limit": "5", "order": "desc"
    })
    if data and data.get("results"):
        latest = data["results"][0]
        return {
            "short_interest": latest.get("short_volume") or latest.get("shortVolume"),
            "short_interest_ratio": latest.get("short_interest_ratio"),
            "days_to_cover": latest.get("days_to_cover"),
            "date": latest.get("settlement_date") or latest.get("date"),
            "history": [{
                "date": r.get("settlement_date") or r.get("date"),
                "volume": r.get("short_volume") or r.get("shortVolume")
            } for r in data["results"][:5]],
        }
    return None


@cached(ttl=CACHE_TTL["shorts"], key_func=lambda tk: f"shortvol:{tk}")
def get_short_volume(tk):
    """
    Daily short volume from Polygon.
    Returns short_volume / total_volume ratio for today.
    Spikes >55% indicate aggressive selling.
    """
    data = _poly("/stocks/v1/short-volume", {
        "ticker": tk, "limit": "5", "order": "desc"
    })
    if data and data.get("results"):
        latest = data["results"][0]
        sv = latest.get("short_volume") or latest.get("shortVolume") or 0
        tv = latest.get("total_volume") or latest.get("totalVolume") or 1
        return {
            "short_volume": sv,
            "total_volume": tv,
            "date": latest.get("date"),
            "ratio": round((sv / max(tv, 1)) * 100, 1),
        }
    return None


# ═══════════════════════════════════════════════════════════════
#  ANALYST DATA — Benzinga via Polygon (catalyst signals)
# ═══════════════════════════════════════════════════════════════

@cached(ttl=CACHE_TTL["analysts"], key_func=lambda tk: f"consensus:{tk}")
def get_analyst_consensus(tk):
    """
    Analyst consensus ratings from Benzinga via Polygon.
    Returns buy/hold/sell breakdown and price targets.
    """
    data = _poly(f"/benzinga/v1/consensus-ratings/{tk}")
    if data:
        ratings = data if isinstance(data, dict) and "consensus" in data else data.get("results", data)
        if isinstance(ratings, dict):
            buy = ratings.get("buy", 0) or 0
            hold = ratings.get("hold", 0) or 0
            sell = ratings.get("sell", 0) or 0
            total = buy + hold + sell
            return {
                "consensus": ratings.get("consensus"),
                "buy": buy,
                "hold": hold,
                "sell": sell,
                "total": total,
                "buy_pct": round(buy / total * 100, 1) if total > 0 else 0,
                "sell_pct": round(sell / total * 100, 1) if total > 0 else 0,
                "target_mean": ratings.get("target_mean") or ratings.get("priceTarget", {}).get("mean"),
                "target_high": ratings.get("target_high") or ratings.get("priceTarget", {}).get("high"),
                "target_low": ratings.get("target_low") or ratings.get("priceTarget", {}).get("low"),
            }
    return None


@cached(ttl=CACHE_TTL["analysts"], key_func=lambda tk: f"ratings:{tk}")
def get_analyst_ratings(tk):
    """
    Recent analyst ratings actions from Benzinga via Polygon.
    Returns last 10 rating changes — upgrades, downgrades, target changes.
    """
    data = _poly("/benzinga/v1/ratings", {"ticker": tk, "limit": "10"})
    results = []
    if data:
        items = data if isinstance(data, list) else data.get("results", [])
        for r in items[:10]:
            results.append({
                "analyst": r.get("analyst", ""),
                "firm": r.get("analyst_firm", ""),
                "rating": r.get("rating_current", ""),
                "prior": r.get("rating_prior", ""),
                "action": r.get("action_pt") or r.get("action_company", ""),
                "target": r.get("pt_current"),
                "prior_target": r.get("pt_prior"),
                "date": r.get("date"),
            })
    return results


@cached(ttl=CACHE_TTL["analysts"], key_func=lambda tk: f"ratings_summary:{tk}")
def get_analyst_ratings_summary(tk):
    """
    Summary of recent analyst activity — for catalyst scoring.
    Counts upgrades/downgrades/target raises in last 30 days from major firms.
    """
    MAJOR_FIRMS = {
        "goldman sachs", "morgan stanley", "jpmorgan", "jp morgan",
        "bank of america", "citi", "citigroup", "wells fargo",
        "barclays", "deutsche bank", "ubs", "credit suisse",
        "raymond james", "jefferies", "bernstein", "evercore",
        "wedbush", "piper sandler", "rbc", "stifel", "guggenheim",
        "oppenheimer", "needham", "cowen", "td cowen", "baird",
    }
    UPGRADE_WORDS = {"upgrade", "raised", "buy", "outperform", "overweight", "strong buy"}
    DOWNGRADE_WORDS = {"downgrade", "lowered", "sell", "underperform", "underweight"}

    data = _poly("/benzinga/v1/ratings", {"ticker": tk, "limit": "30"})
    items = []
    if data:
        items = data if isinstance(data, list) else data.get("results", [])

    cutoff = datetime.now() - timedelta(days=30)
    upgrades_major = 0
    downgrades_major = 0
    target_raises = 0
    target_cuts = 0

    for r in items:
        date_str = r.get("date", "")
        if not date_str:
            continue
        try:
            r_date = datetime.strptime(date_str[:10], "%Y-%m-%d")
            if r_date < cutoff:
                continue
        except Exception:
            continue

        firm = (r.get("analyst_firm") or "").lower()
        is_major = any(mf in firm for mf in MAJOR_FIRMS)

        rating = (r.get("rating_current") or "").lower()
        prior = (r.get("rating_prior") or "").lower()
        action = (r.get("action_pt") or r.get("action_company") or "").lower()

        if is_major:
            if "upgrade" in action or (any(w in rating for w in UPGRADE_WORDS) and
                                       not any(w in prior for w in UPGRADE_WORDS) and prior):
                upgrades_major += 1
            elif "downgrade" in action or (any(w in rating for w in DOWNGRADE_WORDS) and
                                           not any(w in prior for w in DOWNGRADE_WORDS) and prior):
                downgrades_major += 1

        pt_curr = r.get("pt_current")
        pt_prior = r.get("pt_prior")
        try:
            if pt_curr and pt_prior:
                if float(pt_curr) > float(pt_prior):
                    target_raises += 1
                elif float(pt_curr) < float(pt_prior):
                    target_cuts += 1
        except Exception:
            pass

    return {
        "upgrades_major_30d": upgrades_major,
        "downgrades_major_30d": downgrades_major,
        "target_raises_30d": target_raises,
        "target_cuts_30d": target_cuts,
        "total_actions_30d": len([r for r in items if r.get("date")]),
    }


@cached(ttl=CACHE_TTL["analysts"], key_func=lambda tk: f"guidance:{tk}")
def get_guidance(tk):
    """
    Corporate guidance from Benzinga via Polygon.
    Returns recent EPS/revenue guidance updates from the company itself.
    """
    data = _poly("/benzinga/v1/guidance", {"tickers": tk, "limit": "10"})
    results = []
    if data:
        items = data if isinstance(data, list) else data.get("results", [])
        for g in items[:10]:
            results.append({
                "date": g.get("date"),
                "period": g.get("fiscal_period") or g.get("period"),
                "fiscal_year": g.get("fiscal_year"),
                "eps_guidance": g.get("eps_guidance") or g.get("eps_estimate"),
                "revenue_guidance": g.get("revenue_guidance") or g.get("revenue_estimate"),
                "prior_eps": g.get("prior_eps_guidance"),
                "prior_revenue": g.get("prior_revenue_guidance"),
            })
    return results


# ═══════════════════════════════════════════════════════════════
#  FINANCIALS, DIVIDENDS, REFERENCE — Polygon (unchanged)
# ═══════════════════════════════════════════════════════════════

@cached(ttl=CACHE_TTL["financials"], key_func=lambda tk: f"financials:{tk}")
def get_financials(tk):
    """Company financials from Polygon."""
    data = _poly("/vX/reference/financials", {
        "ticker": tk, "limit": "4", "sort": "filing_date",
        "order": "desc", "timeframe": "quarterly"
    })
    if data and data.get("results"):
        quarters = []
        for q in data["results"]:
            fins = q.get("financials", {})
            income = fins.get("income_statement", {})
            balance = fins.get("balance_sheet", {})
            cf = fins.get("cash_flow_statement", {})
            quarters.append({
                "period": q.get("fiscal_period"),
                "fiscal_year": q.get("fiscal_year"),
                "filing_date": q.get("filing_date"),
                "revenue": income.get("revenues", {}).get("value"),
                "net_income": income.get("net_income_loss", {}).get("value"),
                "eps_basic": income.get("basic_earnings_per_share", {}).get("value"),
                "eps_diluted": income.get("diluted_earnings_per_share", {}).get("value"),
                "gross_profit": income.get("gross_profit", {}).get("value"),
                "operating_income": income.get("operating_income_loss", {}).get("value"),
                "total_assets": balance.get("assets", {}).get("value"),
                "total_liabilities": balance.get("liabilities", {}).get("value"),
                "equity": balance.get("equity", {}).get("value"),
                "operating_cash_flow": cf.get("net_cash_flow_from_operating_activities", {}).get("value"),
                "free_cash_flow": cf.get("net_cash_flow", {}).get("value"),
            })
        return quarters
    return []


@cached(ttl=CACHE_TTL["dividends"], key_func=lambda tk: f"div:{tk}")
def get_dividends(tk):
    """Dividend data from Polygon."""
    data = _poly("/v3/reference/dividends", {
        "ticker": tk, "limit": "12", "order": "desc"
    })
    if data and data.get("results"):
        divs = data["results"]
        total_annual = 0
        this_year = datetime.now().year
        for d in divs:
            pay_date = d.get("pay_date", "")
            if str(this_year) in pay_date or str(this_year - 1) in pay_date:
                total_annual += d.get("cash_amount", 0)

        return {
            "pays": len(divs) > 0,
            "latest_amount": divs[0].get("cash_amount") if divs else None,
            "frequency": divs[0].get("frequency") if divs else None,
            "ex_date": divs[0].get("ex_dividend_date") if divs else None,
            "pay_date": divs[0].get("pay_date") if divs else None,
            "annual_estimate": round(total_annual, 2) if total_annual > 0 else None,
            "history": [{
                "date": d.get("ex_dividend_date"),
                "amount": d.get("cash_amount"),
                "type": d.get("dividend_type")
            } for d in divs[:8]],
        }
    return {"pays": False}


@cached(ttl=CACHE_TTL["reference"], key_func=lambda tk: f"related:{tk}")
def get_related_tickers(tk):
    """Related companies from Polygon."""
    data = _poly(f"/v1/related-companies/{tk}")
    if data and data.get("results"):
        return [r.get("ticker") for r in data["results"][:10] if r.get("ticker")]
    return []


@cached(ttl=CACHE_TTL["overview"], key_func=lambda: "gainers")
def get_gainers():
    """Top stock gainers from Polygon snapshot."""
    data = _poly("/v2/snapshot/locale/us/markets/stocks/gainers")
    if data and data.get("tickers"):
        return [{
            "ticker": s.get("ticker"),
            "price": s.get("day", {}).get("c") or s.get("lastTrade", {}).get("p"),
            "change": s.get("todaysChangePerc"),
        } for s in data["tickers"][:10]]
    return []


@cached(ttl=CACHE_TTL["overview"], key_func=lambda: "losers")
def get_losers():
    """Top stock losers from Polygon snapshot."""
    data = _poly("/v2/snapshot/locale/us/markets/stocks/losers")
    if data and data.get("tickers"):
        return [{
            "ticker": s.get("ticker"),
            "price": s.get("day", {}).get("c") or s.get("lastTrade", {}).get("p"),
            "change": s.get("todaysChangePerc"),
        } for s in data["tickers"][:10]]
    return []


@cached(ttl=CACHE_TTL["reference"], key_func=lambda tk: f"splits:{tk}")
def get_splits(tk):
    """Stock splits from Polygon."""
    data = _poly("/v3/reference/splits", {
        "ticker": tk, "limit": "5", "order": "desc"
    })
    if data and data.get("results"):
        return [{
            "date": s.get("execution_date"),
            "ratio": f"{s.get('split_to')}:{s.get('split_from')}"
        } for s in data["results"]]
    return []


@cached(ttl=CACHE_TTL["reference"], key_func=lambda tk: f"tickernews:{tk}")
def get_ticker_news(tk):
    """News for a specific ticker from Polygon."""
    data = _poly("/v2/reference/news", {
        "ticker": tk, "limit": "10", "order": "desc"
    })
    if data and data.get("results"):
        return [{
            "title": n.get("title", ""),
            "published": n.get("published_utc", ""),
            "source": n.get("publisher", {}).get("name", ""),
            "url": n.get("article_url", ""),
            "tickers": n.get("tickers", []),
        } for n in data["results"][:10]]
    return []
