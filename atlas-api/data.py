"""
ATLAS API — Data Fetchers
All external data sources: yfinance, CoinGecko, Finnhub, FRED, FMP, OpenInsider.
Extracted from atlas_dashboard.py with caching added.
"""
import yfinance as yf
import requests
import pandas as pd
from datetime import datetime, timedelta
import pytz

from config import (FINNHUB_KEY, FRED_KEY, FMP_KEY, CORE_FOUR,
                    EVENT_DAYS, CACHE_TTL)
from cache import cached


# ─── Session Key (same as Streamlit version) ─────────────────
def session_key():
    et  = pytz.timezone("America/New_York")
    now = datetime.now(et)
    c   = now.replace(hour=16, minute=30, second=0, microsecond=0)
    if now < c:
        c -= timedelta(days=1)
    while c.weekday() >= 5:
        c -= timedelta(days=1)
    return c.strftime("%Y-%m-%d")


# ─── Price Data ───────────────────────────────────────────────
@cached(ttl=CACHE_TTL["chart"], key_func=lambda tk, period="2y": f"daily:{tk}:{period}")
def get_daily(tk, period="2y"):
    """Fetch daily OHLCV for a ticker."""
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
    """Batch fetch latest prices and daily change for a list of tickers."""
    if not tickers:
        return {}
    out = {}
    try:
        raw = yf.download(" ".join(tickers), period="3d", interval="1d",
                           auto_adjust=True, progress=False, threads=True)
        if raw is not None and len(raw) >= 2:
            if len(tickers) == 1:
                tk = tickers[0]
                try:
                    c = raw["Close"].dropna()
                    if len(c) >= 2:
                        out[tk] = {
                            "price": float(c.iloc[-1]),
                            "change": round((float(c.iloc[-1]) - float(c.iloc[-2])) / float(c.iloc[-2]) * 100, 2)
                        }
                except Exception:
                    pass
            else:
                for tk in tickers:
                    try:
                        key = ("Close", tk) if ("Close", tk) in raw.columns else None
                        c = raw[key].dropna() if key else raw["Close"][tk].dropna()
                        if len(c) >= 2:
                            out[tk] = {
                                "price": float(c.iloc[-1]),
                                "change": round((float(c.iloc[-1]) - float(c.iloc[-2])) / float(c.iloc[-2]) * 100, 2)
                            }
                    except Exception:
                        pass
    except Exception:
        pass
    # Fallback for missing tickers
    for tk in [t for t in tickers if t not in out]:
        try:
            h = yf.Ticker(tk).history(period="3d", interval="1d")
            if h is not None and len(h) >= 2:
                if isinstance(h.columns, pd.MultiIndex):
                    h.columns = h.columns.get_level_values(0)
                out[tk] = {
                    "price": float(h["Close"].iloc[-1]),
                    "change": round((float(h["Close"].iloc[-1]) - float(h["Close"].iloc[-2])) / float(h["Close"].iloc[-2]) * 100, 2)
                }
        except Exception:
            pass
    return out


# ─── S&P 500 ─────────────────────────────────────────────────
@cached(ttl=CACHE_TTL["gate"], key_func=lambda: "sp500")
def get_sp500():
    """Fetch S&P 500 close series (2 years)."""
    try:
        df = yf.Ticker("^GSPC").history(period="2y", interval="1d")
        return df["Close"].dropna() if df is not None else None
    except Exception:
        return None


# ─── VIX ──────────────────────────────────────────────────────
@cached(ttl=CACHE_TTL["gate"], key_func=lambda: "vix")
def get_vix():
    """Fetch current VIX level."""
    try:
        df = yf.Ticker("^VIX").history(period="5d", interval="1d")
        return round(float(df["Close"].iloc[-1]), 2) if df is not None and len(df) > 0 else None
    except Exception:
        return None


# ─── Fear & Greed ─────────────────────────────────────────────
@cached(ttl=CACHE_TTL["pulse"], key_func=lambda: "fg")
def get_fear_greed():
    """Fetch Fear & Greed index. CNN primary, Alternative.me fallback."""
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


# ─── Crypto (Core Four) ──────────────────────────────────────
@cached(ttl=CACHE_TTL["overview"], key_func=lambda: "crypto")
def get_crypto():
    """Fetch Core Four crypto prices. CoinGecko primary, yfinance fallback."""
    # Try CoinGecko simple/price
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
    # Fallback: CoinGecko markets
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
    # Fallback: yfinance
    try:
        m = {"bitcoin": "BTC-USD", "ethereum": "ETH-USD",
             "solana": "SOL-USD", "ripple": "XRP-USD"}
        res = {}
        for cid, ys in m.items():
            h = yf.Ticker(ys).history(period="2d", interval="1d")
            if h is not None and len(h) >= 2:
                c, p = float(h["Close"].iloc[-1]), float(h["Close"].iloc[-2])
                res[cid] = {"usd": c, "usd_24h_change": (c - p) / p * 100, "usd_market_cap": None}
        return res
    except Exception:
        return {}


# ─── BTC Dominance ────────────────────────────────────────────
@cached(ttl=CACHE_TTL["overview"], key_func=lambda: "btcdom")
def get_btc_dominance():
    try:
        r = requests.get("https://api.coingecko.com/api/v3/global", timeout=8)
        return round(r.json()["data"]["market_cap_percentage"]["btc"], 1)
    except Exception:
        return None


# ─── Fed Rate ─────────────────────────────────────────────────
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


# ─── 10Y Yield ────────────────────────────────────────────────
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


# ─── Earnings Check ───────────────────────────────────────────
@cached(ttl=CACHE_TTL["earnings"], key_func=lambda tk: f"earn:{tk}")
def check_earnings(tk):
    """Check if ticker has earnings within EVENT_DAYS days. Returns (is_clear, date)."""
    try:
        t  = datetime.now().strftime("%Y-%m-%d")
        t2 = (datetime.now() + timedelta(days=EVENT_DAYS)).strftime("%Y-%m-%d")
        r  = requests.get(
            f"https://finnhub.io/api/v1/calendar/earnings?from={t}&to={t2}"
            f"&symbol={tk}&token={FINNHUB_KEY}",
            timeout=5)
        cal = r.json().get("earningsCalendar", [])
        return (False, cal[0].get("date")) if cal else (True, None)
    except Exception:
        return True, None


# ─── Macro News ───────────────────────────────────────────────
@cached(ttl=CACHE_TTL["news"], key_func=lambda: "news")
def get_macro_news():
    """Filtered macro news with sentiment scoring."""
    MUST_HAVE = [
        "federal reserve", "fed ", "fomc", "interest rate", "rate hike", "rate cut",
        "inflation", "cpi", "pce", "gdp", "jobs report", "payroll", "unemployment",
        "s&p 500", "nasdaq", "dow jones", "vix", "market rally", "market selloff",
        "recession", "earnings beat", "earnings miss", "guidance", "outlook",
        "oil price", "crude", "treasury yield", "10-year", "bond yield",
        "tariff", "trade war", "china trade", "bitcoin", "crypto market",
        "nvidia", "fed chair", "powell", "debt ceiling", "bank failure",
    ]
    BEAR = ["falls", "drops", "crashes", "declines", "warning", "recession", "concern",
            "misses", "disappoints", "cut guidance", "fear", "sells off", "plunges",
            "below expectations", "weaker", "slowdown", "contraction"]
    BULL = ["rises", "gains", "rallies", "beats", "strong", "growth", "record high",
            "surges", "above expectations", "raises guidance", "expansion",
            "better than expected", "accelerates", "upgrade", "outperforms"]
    WARN = ["uncertain", "mixed", "flat", "awaits", "pending", "volatile", "caution"]

    def sentiment(text):
        t = text.lower()
        b = sum(1 for w in BULL if w in t)
        e = sum(1 for w in BEAR if w in t)
        if b > e: return "bull"
        if e > b: return "bear"
        if any(w in t for w in WARN): return "warn"
        return "neutral"

    news = []
    try:
        r = requests.get(
            f"https://finnhub.io/api/v1/news?category=general&token={FINNHUB_KEY}",
            timeout=5)
        for item in r.json()[:40]:
            hl = item.get("headline", "")
            if len(hl) < 15:
                continue
            if any(kw in hl.lower() for kw in MUST_HAVE):
                news.append({"text": hl[:90], "sentiment": sentiment(hl)})
            if len(news) >= 7:
                break
    except Exception:
        pass
    return news


# ─── Upcoming Earnings (this week) ────────────────────────────
@cached(ttl=CACHE_TTL["earnings"], key_func=lambda: "earnings_week")
def get_upcoming_earnings():
    """Get earnings happening this week."""
    try:
        t  = datetime.now().strftime("%Y-%m-%d")
        t2 = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        r  = requests.get(
            f"https://finnhub.io/api/v1/calendar/earnings?from={t}&to={t2}"
            f"&token={FINNHUB_KEY}",
            timeout=5)
        cal = r.json().get("earningsCalendar", [])
        return [{"ticker": e.get("symbol"), "date": e.get("date"),
                 "hour": e.get("hour", ""),
                 "estimate": e.get("epsEstimate")} for e in cal[:20]]
    except Exception:
        return []


# ─── Market Overview (indexes + commodities) ──────────────────
@cached(ttl=CACHE_TTL["overview"], key_func=lambda: "overview")
def get_market_overview():
    """Batch fetch index and commodity prices."""
    symbols = {
        "^GSPC": "S&P 500", "^IXIC": "NASDAQ", "^DJI": "DOW",
        "^RUT": "RUSSELL", "^VIX": "VIX", "GLD": "GOLD", "SLV": "SILVER",
    }
    result = {}
    try:
        tickers = list(symbols.keys())
        raw = yf.download(" ".join(tickers), period="3d", interval="1d",
                           auto_adjust=True, progress=False, threads=True)
        for sym, label in symbols.items():
            try:
                key = ("Close", sym) if ("Close", sym) in raw.columns else None
                c = raw[key].dropna() if key else raw["Close"][sym].dropna()
                if len(c) >= 2:
                    price = float(c.iloc[-1])
                    prev  = float(c.iloc[-2])
                    chg   = round((price - prev) / prev * 100, 2)
                    result[label] = {"price": price, "change": chg}
            except Exception:
                result[label] = {"price": None, "change": None}
    except Exception:
        pass
    return result
