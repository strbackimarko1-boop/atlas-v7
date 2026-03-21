"""
ATLAS API — Data Fetchers v3
All external data sources: yfinance, CoinGecko, Finnhub, FRED, FMP.
Market overview uses Finnhub (works from datacenter).
"""
import yfinance as yf
import requests
import pandas as pd
from datetime import datetime, timedelta
import pytz

from config import (FINNHUB_KEY, FRED_KEY, FMP_KEY, CORE_FOUR,
                    EVENT_DAYS, CACHE_TTL)
from cache import cached


def session_key():
    et = pytz.timezone("America/New_York")
    now = datetime.now(et)
    c = now.replace(hour=16, minute=30, second=0, microsecond=0)
    if now < c:
        c -= timedelta(days=1)
    while c.weekday() >= 5:
        c -= timedelta(days=1)
    return c.strftime("%Y-%m-%d")


@cached(ttl=CACHE_TTL["chart"], key_func=lambda tk, period="2y": f"daily:{tk}:{period}")
def get_daily(tk, period="2y"):
    try:
        df = yf.Ticker(tk).history(period=period, interval="1d")
        if df is None or len(df) < 50:
            return None
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        return df[["Open", "High", "Low", "Close", "Volume"]].dropna()
    except Exception:
        return None


@cached(ttl=CACHE_TTL["overview"], key_func=lambda tickers: f"prices:{','.join(sorted(tickers))}")
def get_prices(tickers):
    if not tickers:
        return {}
    out = {}
    # FMP primary
    try:
        syms = ",".join(tickers)
        r = requests.get(
            f"https://financialmodelingprep.com/stable/quote?symbol={syms}&apikey={FMP_KEY}",
            timeout=8)
        if r.status_code == 200:
            for q in r.json():
                sym = q.get("symbol", "")
                if sym in tickers:
                    out[sym] = {
                        "price": q.get("price"),
                        "change": round(q.get("changesPercentage", 0), 2)
                    }
    except Exception:
        pass
    # yfinance fallback
    for tk in [t for t in tickers if t not in out]:
        try:
            h = yf.Ticker(tk).history(period="3d", interval="1d")
            if h is not None and len(h) >= 2:
                if isinstance(h.columns, pd.MultiIndex):
                    h.columns = h.columns.get_level_values(0)
                c1 = float(h["Close"].iloc[-1])
                c2 = float(h["Close"].iloc[-2])
                out[tk] = {"price": c1, "change": round((c1 - c2) / c2 * 100, 2)}
        except Exception:
            pass
    return out


@cached(ttl=86400, key_func=lambda tk: f"name:{tk}")
def get_name(tk):
    """Fetch company name from FMP. Cached 24h."""
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


@cached(ttl=CACHE_TTL["gate"], key_func=lambda: "sp500")
def get_sp500():
    try:
        df = yf.Ticker("^GSPC").history(period="2y", interval="1d")
        if df is not None and len(df) > 50:
            return df["Close"].dropna()
    except Exception:
        pass
    try:
        r = requests.get(
            f"https://financialmodelingprep.com/stable/historical-price-full?symbol=%5EGSPC&apikey={FMP_KEY}",
            timeout=8)
        if r.status_code == 200:
            data = r.json().get("historical", [])[:504]
            if data:
                df = pd.DataFrame(data)
                df["date"] = pd.to_datetime(df["date"])
                df = df.sort_values("date").set_index("date")
                return df["close"].rename("Close")
    except Exception:
        pass
    return None


@cached(ttl=CACHE_TTL["gate"], key_func=lambda: "vix")
def get_vix():
    try:
        df = yf.Ticker("^VIX").history(period="5d", interval="1d")
        if df is not None and len(df) > 0:
            return round(float(df["Close"].iloc[-1]), 2)
    except Exception:
        pass
    try:
        r = requests.get(
            f"https://financialmodelingprep.com/stable/quote?symbol=%5EVIX&apikey={FMP_KEY}",
            timeout=5)
        if r.status_code == 200 and r.json():
            return round(r.json()[0].get("price", 0), 2)
    except Exception:
        pass
    return None


@cached(ttl=CACHE_TTL["pulse"], key_func=lambda: "fg")
def get_fear_greed():
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


@cached(ttl=CACHE_TTL["overview"], key_func=lambda: "crypto")
def get_crypto():
    try:
        ids = ",".join(CORE_FOUR.keys())
        r = requests.get(
            f"https://api.coingecko.com/api/v3/simple/price?ids={ids}"
            "&vs_currencies=usd&include_24hr_change=true&include_market_cap=true",
            timeout=10, headers={"User-Agent": "Mozilla/5.0"})
        if r.status_code == 200:
            d = r.json()
            if d and "bitcoin" in d:
                return d
    except Exception:
        pass
    try:
        r2 = requests.get(
            "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd"
            "&ids=bitcoin,ethereum,solana,ripple&order=market_cap_desc",
            timeout=10, headers={"User-Agent": "Mozilla/5.0"})
        if r2.status_code == 200:
            res = {}
            for c in r2.json():
                res[c["id"]] = {
                    "usd": c.get("current_price"),
                    "usd_24h_change": c.get("price_change_percentage_24h"),
                    "usd_market_cap": c.get("market_cap"),
                }
            return res
    except Exception:
        pass
    try:
        r = requests.get(
            f"https://financialmodelingprep.com/stable/quote?symbol=BTCUSD,ETHUSD,SOLUSD,XRPUSD&apikey={FMP_KEY}",
            timeout=8)
        if r.status_code == 200:
            m = {"BTCUSD": "bitcoin", "ETHUSD": "ethereum", "SOLUSD": "solana", "XRPUSD": "ripple"}
            res = {}
            for q in r.json():
                cid = m.get(q["symbol"])
                if cid:
                    res[cid] = {"usd": q.get("price"), "usd_24h_change": q.get("changesPercentage"), "usd_market_cap": None}
            return res
    except Exception:
        pass
    return {}


@cached(ttl=CACHE_TTL["overview"], key_func=lambda: "btcdom")
def get_btc_dominance():
    try:
        r = requests.get("https://api.coingecko.com/api/v3/global", timeout=8)
        return round(r.json()["data"]["market_cap_percentage"]["btc"], 1)
    except Exception:
        return None


@cached(ttl=CACHE_TTL["pulse"], key_func=lambda: "fed")
def get_fed_rate():
    try:
        r = requests.get(
            f"https://api.stlouisfed.org/fred/series/observations"
            f"?series_id=FEDFUNDS&limit=1&sort_order=desc&api_key={FRED_KEY}&file_type=json",
            timeout=5)
        return float(r.json()["observations"][0]["value"])
    except Exception:
        return None


@cached(ttl=CACHE_TTL["pulse"], key_func=lambda: "10y")
def get_10y_yield():
    try:
        r = requests.get(
            f"https://api.stlouisfed.org/fred/series/observations"
            f"?series_id=DGS10&limit=5&sort_order=desc&api_key={FRED_KEY}&file_type=json",
            timeout=5)
        obs = [o for o in r.json()["observations"] if o["value"] != "."]
        return float(obs[0]["value"]) if obs else None
    except Exception:
        return None


@cached(ttl=CACHE_TTL["earnings"], key_func=lambda tk: f"earn:{tk}")
def check_earnings(tk):
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


@cached(ttl=CACHE_TTL["news"], key_func=lambda: "news")
def get_macro_news():
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
                news.append({"text": hl[:120], "sentiment": sentiment(hl), "source": item.get("source", "")})
    except Exception:
        pass

    if len(news) < 15:
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
                    news.append({"text": hl[:120], "sentiment": sentiment(hl), "source": item.get("site") or ""})
        except Exception:
            pass

    if len(news) < 10:
        try:
            r = requests.get(
                f"https://finnhub.io/api/v1/news?category=merger&token={FINNHUB_KEY}",
                timeout=5)
            for item in r.json()[:20]:
                if len(news) >= 15:
                    break
                hl = item.get("headline", "").strip()
                if len(hl) < 15 or hl in seen:
                    continue
                seen.add(hl)
                news.append({"text": hl[:120], "sentiment": sentiment(hl), "source": item.get("source", "")})
        except Exception:
            pass

    return news


@cached(ttl=CACHE_TTL["earnings"], key_func=lambda: "earnings_week")
def get_upcoming_earnings():
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


@cached(ttl=CACHE_TTL["overview"], key_func=lambda: "overview")
def get_market_overview():
    """Market overview using Finnhub ETF proxies (works from datacenter)."""
    result = {}
    etfs = {
        "S&P 500": {"sym": "SPY", "mult": 10},
        "NASDAQ":  {"sym": "QQQ", "mult": 37.2},
        "DOW":     {"sym": "DIA", "mult": 100},
        "RUSSELL": {"sym": "IWM", "mult": 10},
        "GOLD":    {"sym": "GLD", "mult": 1},
        "SILVER":  {"sym": "SLV", "mult": 1},
    }
    for label, info in etfs.items():
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
    # Crypto
    for label, sym in {"BTC": "BINANCE:BTCUSDT", "ETH": "BINANCE:ETHUSDT"}.items():
        try:
            r = requests.get(
                f"https://finnhub.io/api/v1/quote?symbol={sym}&token={FINNHUB_KEY}",
                timeout=5)
            if r.status_code == 200:
                d = r.json()
                c = d.get("c", 0)
                pc = d.get("pc", 0)
                if c and c > 0:
                    result[label] = {"price": round(c, 2), "change": round((c - pc) / pc * 100, 2) if pc else 0}
        except Exception:
            pass
    return result
