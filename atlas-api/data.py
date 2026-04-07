"""
ATLAS API — Data Fetchers v8
Polygon.io is PRIMARY for all market data (paid plan — real-time).
Fallbacks: FMP, Finnhub, CoinGecko, FRED (only if Polygon fails).

Polygon endpoints used:
  /v2/aggs/ticker/{tk}/range/1/day/{from}/{to}  — Historical OHLCV
  /v2/snapshot/locale/us/markets/stocks/tickers  — All stock snapshots (real-time)
  /v2/snapshot/locale/global/markets/crypto/tickers — Crypto snapshots
  /v3/reference/tickers/{tk}                     — Company details (name, sector, cap)
  /v2/aggs/ticker/{tk}/prev                      — Previous close
  /v1/marketstatus/now                           — Market open/closed
  /v1/marketstatus/upcoming                      — Market holidays
  /v2/reference/news                             — Ticker news
  /fed/v1/treasury-yields                        — Treasury yields (replaces FRED 10Y)
  /benzinga/v2/news                              — Macro news (Benzinga via Polygon)
  /benzinga/v1/consensus-ratings/{tk}            — Analyst consensus
  /benzinga/v1/ratings                           — Analyst ratings
  /stocks/v1/short-interest                      — Short interest
  /vX/reference/financials                       — Company financials
  /v3/reference/dividends                        — Dividends
  /v1/related-companies/{tk}                     — Related tickers
  /vX/reference/tickers/{tk}/events              — Ticker events (earnings)
"""
import requests
import pandas as pd
from datetime import datetime, timedelta
import pytz

from config import (POLYGON_KEY, POLYGON_BASE, FINNHUB_KEY, FRED_KEY, FMP_KEY,
                    CORE_FOUR, CRYPTO_POLYGON_MAP, EVENT_DAYS, CACHE_TTL)
from cache import cached


# ─── Helpers ──────────────────────────────────────────────────

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
#  HISTORICAL OHLCV — Polygon Primary
# ═══════════════════════════════════════════════════════════════

@cached(ttl=CACHE_TTL["chart"], key_func=lambda tk, period="2y": f"daily:{tk}:{period}")
def get_daily(tk, period="2y"):
    """
    Fetch daily OHLCV bars from Polygon.
    Polygon endpoint: /v2/aggs/ticker/{tk}/range/1/day/{from}/{to}
    Returns DataFrame with columns: Open, High, Low, Close, Volume
    """
    period_days = {"6mo": 180, "1y": 365, "2y": 730, "5y": 1825}
    days = period_days.get(period, 730)
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

    # Handle crypto tickers: BTC-USD → X:BTCUSD
    poly_tk = CRYPTO_POLYGON_MAP.get(tk, tk)

    # PRIMARY: Polygon
    data = _poly(
        f"/v2/aggs/ticker/{poly_tk}/range/1/day/{start_date}/{end_date}",
        {"adjusted": "true", "sort": "asc", "limit": "50000"}
    )
    if data and data.get("resultsCount", 0) > 50:
        results = data["results"]
        df = pd.DataFrame(results)
        df["date"] = pd.to_datetime(df["t"], unit="ms")
        df = df.set_index("date")
        df = df.rename(columns={"o": "Open", "h": "High", "l": "Low", "c": "Close", "v": "Volume"})
        df = df[["Open", "High", "Low", "Close", "Volume"]].dropna()
        if len(df) >= 50:
            return df

    # FALLBACK: FMP historical
    try:
        r = requests.get(
            f"https://financialmodelingprep.com/stable/historical-price-full"
            f"?symbol={tk}&apikey={FMP_KEY}",
            timeout=8)
        if r.status_code == 200:
            hist = r.json().get("historical", [])
            if len(hist) > 50:
                df = pd.DataFrame(hist)
                df["date"] = pd.to_datetime(df["date"])
                df = df.sort_values("date").set_index("date")
                df = df.rename(columns={"open": "Open", "high": "High", "low": "Low",
                                        "close": "Close", "volume": "Volume"})
                df = df[["Open", "High", "Low", "Close", "Volume"]].dropna()
                if len(df) >= 50:
                    return df
    except Exception:
        pass

    # LAST RESORT: yfinance (unreliable from datacenter but sometimes works)
    try:
        import yfinance as yf
        df = yf.Ticker(tk).history(period=period, interval="1d")
        if df is not None and len(df) >= 50:
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            return df[["Open", "High", "Low", "Close", "Volume"]].dropna()
    except Exception:
        pass

    return None


# ═══════════════════════════════════════════════════════════════
#  REAL-TIME PRICES — Polygon Snapshot
# ═══════════════════════════════════════════════════════════════

@cached(ttl=CACHE_TTL["snapshot"], key_func=lambda tickers: f"prices:{','.join(sorted(tickers))}")
def get_prices(tickers):
    """
    Get real-time prices for a list of tickers.
    Polygon endpoint: /v2/snapshot/locale/us/markets/stocks/tickers
    One API call gets ALL stock snapshots — much faster than per-ticker.
    """
    if not tickers:
        return {}
    out = {}

    # Separate stocks from crypto
    stock_tickers = [t for t in tickers if not t.endswith("-USD")]
    crypto_tickers = [t for t in tickers if t.endswith("-USD")]

    # PRIMARY: Polygon stock snapshot (one call for all stocks)
    if stock_tickers:
        tickers_param = ",".join(stock_tickers)
        data = _poly(
            "/v2/snapshot/locale/us/markets/stocks/tickers",
            {"tickers": tickers_param}
        )
        if data and data.get("tickers"):
            for snap in data["tickers"]:
                sym = snap.get("ticker", "")
                if sym in stock_tickers:
                    day = snap.get("day", {})
                    prev = snap.get("prevDay", {})
                    price = day.get("c") or snap.get("lastTrade", {}).get("p", 0)
                    prev_close = prev.get("c", 0)
                    change = 0
                    if price and prev_close and prev_close > 0:
                        change = round((price - prev_close) / prev_close * 100, 2)
                    if price and price > 0:
                        out[sym] = {"price": round(price, 2), "change": change}

    # PRIMARY: Polygon crypto snapshot
    for tk in crypto_tickers:
        poly_tk = CRYPTO_POLYGON_MAP.get(tk)
        if poly_tk:
            data = _poly(f"/v2/snapshot/locale/global/markets/crypto/tickers/{poly_tk}")
            if data and data.get("ticker"):
                snap = data["ticker"]
                day = snap.get("day", {})
                prev = snap.get("prevDay", {})
                price = day.get("c") or snap.get("lastTrade", {}).get("p", 0)
                prev_close = prev.get("c", 0)
                change = 0
                if price and prev_close and prev_close > 0:
                    change = round((price - prev_close) / prev_close * 100, 2)
                if price and price > 0:
                    out[tk] = {"price": round(price, 2), "change": change}

    # FALLBACK: FMP for any missing tickers
    missing = [t for t in tickers if t not in out]
    if missing:
        try:
            syms = ",".join(missing)
            r = requests.get(
                f"https://financialmodelingprep.com/stable/quote?symbol={syms}&apikey={FMP_KEY}",
                timeout=8)
            if r.status_code == 200:
                for q in r.json():
                    sym = q.get("symbol", "")
                    if sym in missing:
                        out[sym] = {
                            "price": q.get("price"),
                            "change": round(q.get("changesPercentage", 0), 2)
                        }
        except Exception:
            pass

    return out


# ═══════════════════════════════════════════════════════════════
#  COMPANY INFO — Polygon Reference
# ═══════════════════════════════════════════════════════════════

@cached(ttl=CACHE_TTL["reference"], key_func=lambda tk: f"name:{tk}")
def get_name(tk):
    """Company name from Polygon ticker details. Cached 24h."""
    # PRIMARY: Polygon
    data = _poly(f"/v3/reference/tickers/{tk}")
    if data and data.get("results"):
        name = data["results"].get("name", tk)
        return name if name else tk

    # FALLBACK: FMP
    try:
        r = requests.get(
            f"https://financialmodelingprep.com/stable/profile"
            f"?symbol={tk}&apikey={FMP_KEY}", timeout=4)
        if r.status_code == 200 and r.json():
            name = r.json()[0].get("companyName", tk)
            return name if name else tk
    except Exception:
        pass
    return tk


@cached(ttl=CACHE_TTL["reference"], key_func=lambda tk: f"details:{tk}")
def get_ticker_details(tk):
    """
    Full ticker details from Polygon: name, market cap, sector, SIC, description, etc.
    Polygon endpoint: /v3/reference/tickers/{tk}
    """
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
#  MARKET INDICES — Polygon
# ═══════════════════════════════════════════════════════════════

@cached(ttl=CACHE_TTL["gate"], key_func=lambda: "sp500")
def get_sp500():
    """S&P 500 historical closes for gate checks (200MA, 50MA)."""
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=730)).strftime("%Y-%m-%d")

    # PRIMARY: Polygon via SPY × 10 multiplier
    data = _poly(
        f"/v2/aggs/ticker/SPY/range/1/day/{start_date}/{end_date}",
        {"adjusted": "true", "sort": "asc", "limit": "50000"}
    )
    if data and data.get("resultsCount", 0) > 200:
        results = data["results"]
        df = pd.DataFrame(results)
        df["date"] = pd.to_datetime(df["t"], unit="ms")
        df = df.set_index("date")
        # SPY ≈ S&P/10, so multiply by 10 for approximate S&P level
        return (df["c"] * 10).rename("Close")

    # FALLBACK: FMP
    try:
        r = requests.get(
            f"https://financialmodelingprep.com/stable/historical-price-full"
            f"?symbol=%5EGSPC&apikey={FMP_KEY}",
            timeout=8)
        if r.status_code == 200:
            hist = r.json().get("historical", [])[:504]
            if hist:
                df = pd.DataFrame(hist)
                df["date"] = pd.to_datetime(df["date"])
                df = df.sort_values("date").set_index("date")
                return df["close"].rename("Close")
    except Exception:
        pass

    # LAST RESORT: yfinance
    try:
        import yfinance as yf
        df = yf.Ticker("^GSPC").history(period="2y", interval="1d")
        if df is not None and len(df) > 50:
            return df["Close"].dropna()
    except Exception:
        pass
    return None


@cached(ttl=CACHE_TTL["gate"], key_func=lambda: "vix")
def get_vix():
    """Current VIX level."""
    # PRIMARY: Polygon previous close for VIX
    # Note: VIX on Polygon uses ticker "VIX" in indices or we use VIXY/VXX as proxy
    # The most reliable way is the snapshot or prev close
    data = _poly("/v2/aggs/ticker/I:VIX/prev")
    if data and data.get("results"):
        results = data["results"]
        if results:
            return round(results[0].get("c", 0), 2)

    # Try VIX ETF proxy (VIXY)
    data = _poly("/v2/snapshot/locale/us/markets/stocks/tickers", {"tickers": "VIXY"})
    if data and data.get("tickers"):
        for snap in data["tickers"]:
            if snap.get("ticker") == "VIXY":
                price = snap.get("day", {}).get("c", 0)
                if price and price > 0:
                    # VIXY roughly tracks VIX but not 1:1 — use as rough indicator
                    return round(price, 2)

    # FALLBACK: FMP
    try:
        r = requests.get(
            f"https://financialmodelingprep.com/stable/quote?symbol=%5EVIX&apikey={FMP_KEY}",
            timeout=5)
        if r.status_code == 200 and r.json():
            return round(r.json()[0].get("price", 0), 2)
    except Exception:
        pass

    # FALLBACK: Finnhub
    try:
        r = requests.get(
            f"https://finnhub.io/api/v1/quote?symbol=%5EVIX&token={FINNHUB_KEY}",
            timeout=5)
        if r.status_code == 200:
            d = r.json()
            c = d.get("c", 0)
            if c and c > 0:
                return round(c, 2)
    except Exception:
        pass
    return None


# ═══════════════════════════════════════════════════════════════
#  MARKET STATUS — Polygon
# ═══════════════════════════════════════════════════════════════

@cached(ttl=CACHE_TTL["market_status"], key_func=lambda: "mkt_status")
def get_market_status():
    """
    Real market status from Polygon.
    Polygon endpoint: /v1/marketstatus/now
    Returns: {"market": "open"|"closed"|"extended-hours", "exchanges": {...}, ...}
    """
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
#  MACRO PULSE — Mixed sources
# ═══════════════════════════════════════════════════════════════

@cached(ttl=CACHE_TTL["pulse"], key_func=lambda: "fg")
def get_fear_greed():
    """CNN Fear & Greed Index — no Polygon equivalent."""
    try:
        r = requests.get(
            "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
            timeout=5, headers={"User-Agent": "Mozilla/5.0"})
        d = r.json()["fear_and_greed"]
        return {"score": float(d["score"]), "label": d["rating"]}
    except Exception:
        try:
            r = requests.get("https://api.alternative.me/fng/?limit=1", timeout=5)
            d = r.json()["data"][0]
            return {"score": int(d["value"]), "label": d["value_classification"]}
        except Exception:
            return {"score": None, "label": None}


@cached(ttl=CACHE_TTL["pulse"], key_func=lambda: "fed")
def get_fed_rate():
    """Fed funds rate — FRED only (Polygon doesn't have this)."""
    try:
        r = requests.get(
            f"https://api.stlouisfed.org/fred/series/observations"
            f"?series_id=FEDFUNDS&limit=1&sort_order=desc&api_key={FRED_KEY}&file_type=json",
            timeout=5)
        return float(r.json()["observations"][0]["value"])
    except Exception:
        return None


@cached(ttl=CACHE_TTL["treasury"], key_func=lambda: "10y")
def get_10y_yield():
    """
    10-Year Treasury yield.
    PRIMARY: Polygon /fed/v1/treasury-yields
    FALLBACK: FRED
    """
    # PRIMARY: Polygon treasury yields
    data = _poly("/fed/v1/treasury-yields", {"order": "desc", "limit": "5"})
    if data and data.get("results"):
        for r in data["results"]:
            val = r.get("ten_year")
            if val is not None:
                return round(float(val), 2)

    # FALLBACK: FRED
    try:
        r = requests.get(
            f"https://api.stlouisfed.org/fred/series/observations"
            f"?series_id=DGS10&limit=5&sort_order=desc&api_key={FRED_KEY}&file_type=json",
            timeout=5)
        obs = [o for o in r.json()["observations"] if o["value"] != "."]
        return float(obs[0]["value"]) if obs else None
    except Exception:
        return None


@cached(ttl=CACHE_TTL["overview"], key_func=lambda: "btcdom")
def get_btc_dominance():
    """BTC dominance % — CoinGecko only (Polygon doesn't have this)."""
    try:
        r = requests.get("https://api.coingecko.com/api/v3/global", timeout=8)
        return round(r.json()["data"]["market_cap_percentage"]["btc"], 1)
    except Exception:
        return None


# ═══════════════════════════════════════════════════════════════
#  CRYPTO — Polygon Primary
# ═══════════════════════════════════════════════════════════════

@cached(ttl=CACHE_TTL["overview"], key_func=lambda: "crypto")
def get_crypto():
    """Core Four crypto prices from Polygon."""
    result = {}

    # PRIMARY: Polygon crypto snapshots
    for cid, meta in CORE_FOUR.items():
        poly_tk = meta["poly"]
        data = _poly(f"/v2/snapshot/locale/global/markets/crypto/tickers/{poly_tk}")
        if data and data.get("ticker"):
            snap = data["ticker"]
            day = snap.get("day", {})
            prev = snap.get("prevDay", {})
            price = day.get("c") or snap.get("lastTrade", {}).get("p", 0)
            prev_close = prev.get("c", 0)
            change = 0
            if price and prev_close and prev_close > 0:
                change = round((price - prev_close) / prev_close * 100, 2)
            if price and price > 0:
                result[cid] = {
                    "usd": round(price, 2),
                    "usd_24h_change": change,
                    "usd_market_cap": None,  # Polygon doesn't provide market cap for crypto
                }

    # FALLBACK: CoinGecko for any missing
    missing = [cid for cid in CORE_FOUR if cid not in result]
    if missing:
        try:
            ids = ",".join(missing)
            r = requests.get(
                f"https://api.coingecko.com/api/v3/simple/price?ids={ids}"
                "&vs_currencies=usd&include_24hr_change=true&include_market_cap=true",
                timeout=10, headers={"User-Agent": "Mozilla/5.0"})
            if r.status_code == 200:
                d = r.json()
                for cid in missing:
                    if cid in d:
                        result[cid] = {
                            "usd": d[cid].get("usd"),
                            "usd_24h_change": d[cid].get("usd_24h_change"),
                            "usd_market_cap": d[cid].get("usd_market_cap"),
                        }
        except Exception:
            pass

    # Fill market cap from CoinGecko for those that have price from Polygon
    needs_cap = [cid for cid in result if result[cid].get("usd_market_cap") is None]
    if needs_cap:
        try:
            ids = ",".join(needs_cap)
            r = requests.get(
                f"https://api.coingecko.com/api/v3/simple/price?ids={ids}"
                "&vs_currencies=usd&include_market_cap=true",
                timeout=8, headers={"User-Agent": "Mozilla/5.0"})
            if r.status_code == 200:
                d = r.json()
                for cid in needs_cap:
                    if cid in d:
                        result[cid]["usd_market_cap"] = d[cid].get("usd_market_cap")
        except Exception:
            pass

    return result


# ═══════════════════════════════════════════════════════════════
#  EARNINGS — Finnhub (Polygon events as supplement)
# ═══════════════════════════════════════════════════════════════

@cached(ttl=CACHE_TTL["earnings"], key_func=lambda tk: f"earn:{tk}")
def check_earnings(tk):
    """Check if ticker has earnings within EVENT_DAYS. Returns (clear, date)."""
    # TRY: Polygon ticker events
    data = _poly(f"/vX/reference/tickers/{tk}/events")
    if data and data.get("results", {}).get("events"):
        events = data["results"]["events"]
        now = datetime.now()
        for ev in events:
            if "earnings" in ev.get("type", "").lower() or "dividend" in ev.get("type", "").lower():
                ev_date_str = ev.get("date", "")
                if ev_date_str:
                    try:
                        ev_date = datetime.strptime(ev_date_str[:10], "%Y-%m-%d")
                        days_until = (ev_date - now).days
                        if 0 <= days_until <= EVENT_DAYS:
                            return (False, ev_date_str[:10])
                    except Exception:
                        pass

    # FALLBACK: Finnhub earnings calendar
    try:
        t = datetime.now().strftime("%Y-%m-%d")
        t2 = (datetime.now() + timedelta(days=EVENT_DAYS)).strftime("%Y-%m-%d")
        r = requests.get(
            f"https://finnhub.io/api/v1/calendar/earnings?from={t}&to={t2}"
            f"&symbol={tk}&token={FINNHUB_KEY}",
            timeout=5)
        cal = r.json().get("earningsCalendar", [])
        return (False, cal[0].get("date")) if cal else (True, None)
    except Exception:
        return True, None


@cached(ttl=CACHE_TTL["earnings"], key_func=lambda: "earnings_week")
def get_upcoming_earnings():
    """Upcoming earnings this week — Finnhub primary."""
    try:
        t = datetime.now().strftime("%Y-%m-%d")
        t2 = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        r = requests.get(
            f"https://finnhub.io/api/v1/calendar/earnings?from={t}&to={t2}"
            f"&token={FINNHUB_KEY}",
            timeout=5)
        cal = r.json().get("earningsCalendar", [])
        return [{"ticker": e.get("symbol"), "date": e.get("date"),
                 "hour": e.get("hour", ""),
                 "estimate": e.get("epsEstimate")} for e in cal[:20]]
    except Exception:
        return []


# ═══════════════════════════════════════════════════════════════
#  NEWS — Benzinga via Polygon (primary), Finnhub fallback
# ═══════════════════════════════════════════════════════════════

@cached(ttl=CACHE_TTL["news"], key_func=lambda: "news")
def get_macro_news():
    """Market news — Benzinga via Polygon, then Finnhub, then FMP."""
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

    # PRIMARY: Benzinga news via Polygon
    data = _poly("/benzinga/v2/news", {"limit": "50"})
    if data and isinstance(data, list):
        for item in data:
            if len(news) >= 15:
                break
            hl = (item.get("title") or "").strip()
            if len(hl) < 15 or hl in seen:
                continue
            if any(kw in hl.lower() for kw in MUST_HAVE):
                seen.add(hl)
                news.append({"text": hl[:120], "sentiment": sentiment(hl),
                             "source": item.get("author", "Benzinga")})
    # Also check if Benzinga wraps in a results key
    elif data and isinstance(data, dict):
        items = data.get("results", data.get("news", []))
        for item in items:
            if len(news) >= 15:
                break
            hl = (item.get("title") or "").strip()
            if len(hl) < 15 or hl in seen:
                continue
            if any(kw in hl.lower() for kw in MUST_HAVE):
                seen.add(hl)
                news.append({"text": hl[:120], "sentiment": sentiment(hl),
                             "source": item.get("author", "Benzinga")})

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
                    news.append({"text": hl[:120], "sentiment": sentiment(hl),
                                 "source": item.get("publisher", {}).get("name", "")})

    # FALLBACK: Finnhub
    if len(news) < 10:
        try:
            r = requests.get(
                f"https://finnhub.io/api/v1/news?category=general&token={FINNHUB_KEY}",
                timeout=5)
            for item in r.json()[:60]:
                if len(news) >= 15:
                    break
                hl = item.get("headline", "").strip()
                if len(hl) < 15 or hl in seen:
                    continue
                if any(kw in hl.lower() for kw in MUST_HAVE):
                    seen.add(hl)
                    news.append({"text": hl[:120], "sentiment": sentiment(hl),
                                 "source": item.get("source", "")})
        except Exception:
            pass

    # FALLBACK: FMP
    if len(news) < 10:
        try:
            r = requests.get(
                f"https://financialmodelingprep.com/stable/news/general-latest"
                f"?limit=50&apikey={FMP_KEY}",
                timeout=5)
            for item in r.json():
                if len(news) >= 15:
                    break
                hl = (item.get("title") or item.get("text") or "").strip()
                if len(hl) < 15 or hl in seen:
                    continue
                if any(kw in hl.lower() for kw in MUST_HAVE):
                    seen.add(hl)
                    news.append({"text": hl[:120], "sentiment": sentiment(hl),
                                 "source": item.get("site") or ""})
        except Exception:
            pass

    return news


# ═══════════════════════════════════════════════════════════════
#  MARKET OVERVIEW — Polygon Snapshots
# ═══════════════════════════════════════════════════════════════

@cached(ttl=CACHE_TTL["overview"], key_func=lambda: "overview")
def get_market_overview():
    """
    Market overview — indexes, commodities, crypto.
    PRIMARY: Polygon snapshots for all.
    """
    result = {}

    # Stock ETF proxies for indexes
    etfs = {
        "S&P 500": {"sym": "SPY", "mult": 10},
        "NASDAQ":  {"sym": "QQQ", "mult": 37.2},
        "DOW":     {"sym": "DIA", "mult": 100},
        "RUSSELL": {"sym": "IWM", "mult": 10},
        "GOLD":    {"sym": "GLD", "mult": 1},
        "SILVER":  {"sym": "SLV", "mult": 1},
    }

    # PRIMARY: Polygon snapshot for all ETFs in one call
    all_syms = ",".join([v["sym"] for v in etfs.values()])
    data = _poly("/v2/snapshot/locale/us/markets/stocks/tickers", {"tickers": all_syms})
    if data and data.get("tickers"):
        snap_map = {s["ticker"]: s for s in data["tickers"]}
        for label, info in etfs.items():
            snap = snap_map.get(info["sym"])
            if snap:
                day = snap.get("day", {})
                prev = snap.get("prevDay", {})
                c = day.get("c") or snap.get("lastTrade", {}).get("p", 0)
                pc = prev.get("c", 0)
                if c and c > 0:
                    price = round(c * info["mult"], 2) if info["mult"] != 1 else round(c, 2)
                    chg = round((c - pc) / pc * 100, 2) if pc and pc > 0 else 0
                    result[label] = {"price": price, "change": chg}

    # FALLBACK: Finnhub for any missing
    for label, info in etfs.items():
        if label not in result:
            try:
                r = requests.get(
                    f"https://finnhub.io/api/v1/quote?symbol={info['sym']}&token={FINNHUB_KEY}",
                    timeout=5)
                if r.status_code == 200:
                    d = r.json()
                    c = d.get("c", 0)
                    pc = d.get("pc", 0)
                    if c and c > 0:
                        price = round(c * info["mult"], 2) if info["mult"] != 1 else round(c, 2)
                        chg = round((c - pc) / pc * 100, 2) if pc else 0
                        result[label] = {"price": price, "change": chg}
            except Exception:
                pass

    # VIX
    vix = get_vix()
    if vix:
        result["VIX"] = {"price": vix, "change": 0}

    # Crypto via Polygon
    for label, poly_tk in {"BTC": "X:BTCUSD", "ETH": "X:ETHUSD"}.items():
        data = _poly(f"/v2/snapshot/locale/global/markets/crypto/tickers/{poly_tk}")
        if data and data.get("ticker"):
            snap = data["ticker"]
            day = snap.get("day", {})
            prev = snap.get("prevDay", {})
            c = day.get("c") or snap.get("lastTrade", {}).get("p", 0)
            pc = prev.get("c", 0)
            if c and c > 0:
                result[label] = {
                    "price": round(c, 2),
                    "change": round((c - pc) / pc * 100, 2) if pc and pc > 0 else 0,
                }

    # FALLBACK: Finnhub for crypto if Polygon missed
    for label, sym in {"BTC": "BINANCE:BTCUSDT", "ETH": "BINANCE:ETHUSDT"}.items():
        if label not in result:
            try:
                r = requests.get(
                    f"https://finnhub.io/api/v1/quote?symbol={sym}&token={FINNHUB_KEY}",
                    timeout=5)
                if r.status_code == 200:
                    d = r.json()
                    c = d.get("c", 0)
                    pc = d.get("pc", 0)
                    if c and c > 0:
                        result[label] = {"price": round(c, 2),
                                         "change": round((c - pc) / pc * 100, 2) if pc else 0}
            except Exception:
                pass

    return result


# ═══════════════════════════════════════════════════════════════
#  NEW DATA — Polygon-exclusive endpoints
# ═══════════════════════════════════════════════════════════════

@cached(ttl=CACHE_TTL["shorts"], key_func=lambda tk: f"shorts:{tk}")
def get_short_interest(tk):
    """
    Short interest data from Polygon.
    Polygon endpoint: /stocks/v1/short-interest?ticker={tk}
    """
    data = _poly("/stocks/v1/short-interest", {"ticker": tk, "limit": "5", "order": "desc"})
    if data and data.get("results"):
        latest = data["results"][0]
        return {
            "short_interest": latest.get("short_volume") or latest.get("shortVolume"),
            "short_interest_ratio": latest.get("short_interest_ratio"),
            "date": latest.get("settlement_date") or latest.get("date"),
            "history": [{"date": r.get("settlement_date") or r.get("date"),
                         "volume": r.get("short_volume") or r.get("shortVolume")}
                        for r in data["results"][:5]],
        }
    return None


@cached(ttl=CACHE_TTL["analysts"], key_func=lambda tk: f"consensus:{tk}")
def get_analyst_consensus(tk):
    """
    Analyst consensus ratings from Benzinga via Polygon.
    Polygon endpoint: /benzinga/v1/consensus-ratings/{tk}
    """
    data = _poly(f"/benzinga/v1/consensus-ratings/{tk}")
    if data:
        # Handle both direct response and nested results
        ratings = data if isinstance(data, dict) and "consensus" in data else data.get("results", data)
        if isinstance(ratings, dict):
            return {
                "consensus": ratings.get("consensus"),
                "buy": ratings.get("buy", 0),
                "hold": ratings.get("hold", 0),
                "sell": ratings.get("sell", 0),
                "target_mean": ratings.get("target_mean") or ratings.get("priceTarget", {}).get("mean"),
                "target_high": ratings.get("target_high") or ratings.get("priceTarget", {}).get("high"),
                "target_low": ratings.get("target_low") or ratings.get("priceTarget", {}).get("low"),
            }
    return None


@cached(ttl=CACHE_TTL["analysts"], key_func=lambda tk: f"ratings:{tk}")
def get_analyst_ratings(tk):
    """
    Individual analyst ratings from Benzinga via Polygon.
    Polygon endpoint: /benzinga/v1/ratings?ticker={tk}
    """
    data = _poly("/benzinga/v1/ratings", {"ticker": tk, "limit": "10"})
    if data and isinstance(data, list):
        return [{"analyst": r.get("analyst", ""), "firm": r.get("analyst_firm", ""),
                 "rating": r.get("rating_current", ""), "prior": r.get("rating_prior", ""),
                 "target": r.get("pt_current"), "prior_target": r.get("pt_prior"),
                 "date": r.get("date")} for r in data[:10]]
    elif data and data.get("results"):
        return [{"analyst": r.get("analyst", ""), "firm": r.get("analyst_firm", ""),
                 "rating": r.get("rating_current", ""), "prior": r.get("rating_prior", ""),
                 "target": r.get("pt_current"), "prior_target": r.get("pt_prior"),
                 "date": r.get("date")} for r in data["results"][:10]]
    return []


@cached(ttl=CACHE_TTL["financials"], key_func=lambda tk: f"financials:{tk}")
def get_financials(tk):
    """
    Company financials from Polygon.
    Polygon endpoint: /vX/reference/financials?ticker={tk}
    """
    data = _poly("/vX/reference/financials", {"ticker": tk, "limit": "4", "sort": "filing_date",
                                               "order": "desc", "timeframe": "quarterly"})
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
    """
    Dividend data from Polygon.
    Polygon endpoint: /v3/reference/dividends?ticker={tk}
    """
    data = _poly("/v3/reference/dividends", {"ticker": tk, "limit": "12", "order": "desc"})
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
            "history": [{"date": d.get("ex_dividend_date"), "amount": d.get("cash_amount"),
                         "type": d.get("dividend_type")} for d in divs[:8]],
        }
    return {"pays": False}


@cached(ttl=CACHE_TTL["reference"], key_func=lambda tk: f"related:{tk}")
def get_related_tickers(tk):
    """
    Related companies from Polygon.
    Polygon endpoint: /v1/related-companies/{tk}
    """
    data = _poly(f"/v1/related-companies/{tk}")
    if data and data.get("results"):
        return [r.get("ticker") for r in data["results"][:10] if r.get("ticker")]
    return []


@cached(ttl=CACHE_TTL["shorts"], key_func=lambda tk: f"shortvol:{tk}")
def get_short_volume(tk):
    """
    Short volume data from Polygon.
    Polygon endpoint: /stocks/v1/short-volume?ticker={tk}
    """
    data = _poly("/stocks/v1/short-volume", {"ticker": tk, "limit": "5", "order": "desc"})
    if data and data.get("results"):
        latest = data["results"][0]
        return {
            "short_volume": latest.get("short_volume") or latest.get("shortVolume"),
            "total_volume": latest.get("total_volume") or latest.get("totalVolume"),
            "date": latest.get("date"),
            "ratio": round(
                (latest.get("short_volume", 0) or 0) /
                max(latest.get("total_volume", 1) or 1, 1) * 100, 1
            ),
        }
    return None


@cached(ttl=CACHE_TTL["overview"], key_func=lambda: "gainers")
def get_gainers():
    """Top stock gainers from Polygon snapshot."""
    data = _poly("/v2/snapshot/locale/us/markets/stocks/gainers")
    if data and data.get("tickers"):
        return [{
            "ticker": s.get("ticker"),
            "price": s.get("day", {}).get("c"),
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
            "price": s.get("day", {}).get("c"),
            "change": s.get("todaysChangePerc"),
        } for s in data["tickers"][:10]]
    return []


@cached(ttl=CACHE_TTL["reference"], key_func=lambda tk: f"splits:{tk}")
def get_splits(tk):
    """Stock splits from Polygon."""
    data = _poly("/v3/reference/splits", {"ticker": tk, "limit": "5", "order": "desc"})
    if data and data.get("results"):
        return [{"date": s.get("execution_date"), "ratio": f"{s.get('split_to')}:{s.get('split_from')}"}
                for s in data["results"]]
    return []


@cached(ttl=CACHE_TTL["reference"], key_func=lambda tk: f"tickernews:{tk}")
def get_ticker_news(tk):
    """News for a specific ticker from Polygon."""
    data = _poly("/v2/reference/news", {"ticker": tk, "limit": "10", "order": "desc"})
    if data and data.get("results"):
        return [{
            "title": n.get("title", ""),
            "published": n.get("published_utc", ""),
            "source": n.get("publisher", {}).get("name", ""),
            "url": n.get("article_url", ""),
            "tickers": n.get("tickers", []),
        } for n in data["results"][:10]]
    return []
