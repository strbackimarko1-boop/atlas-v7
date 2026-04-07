"""
ATLAS API — FastAPI Application v8
All endpoints for the ATLAS Signal Dashboard.
Polygon.io is primary data source.

Run: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
import pandas as pd
import pytz

from config import (STOCKS_UNIVERSE, CRYPTO_UNIVERSE, LVRG_UNIVERSE,
                    CORE_FOUR, CACHE_TTL)
from cache import cache
from data import (session_key, get_sp500, get_vix, get_fear_greed, get_crypto,
                  get_btc_dominance, get_fed_rate, get_10y_yield,
                  get_macro_news, get_upcoming_earnings, get_market_overview,
                  get_prices, get_daily, get_name, get_ticker_details,
                  get_market_status, get_market_holidays,
                  get_short_interest, get_short_volume,
                  get_analyst_consensus, get_analyst_ratings,
                  get_financials, get_dividends, get_related_tickers,
                  get_gainers, get_losers, get_splits, get_ticker_news)
from gate import macro_gate
from scoring import score, upgrade_signal
from catalyst import get_catalyst, compute_full_catalyst
from indicators import calc_ind
from analyze import analyze as analyze_ticker


# ─── App Setup ────────────────────────────────────────────────
app = FastAPI(
    title="ATLAS Signal API",
    description="14-Rule Trading Signal Engine — Powered by Polygon.io",
    version="8.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Helpers ──────────────────────────────────────────────────
def now_et():
    et = pytz.timezone("America/New_York")
    return datetime.now(et)


def market_status():
    """Market status — uses Polygon real-time status with manual fallback."""
    poly_status = get_market_status()
    n = now_et()

    if poly_status and poly_status.get("market") != "unknown":
        is_open = poly_status.get("is_open", False)
        entry_window = is_open and (630 <= n.hour * 60 + n.minute < 930)
        return {
            "is_open": is_open,
            "after_hours": poly_status.get("after_hours", False),
            "early_hours": poly_status.get("early_hours", False),
            "entry_window": entry_window,
            "time_et": n.strftime("%H:%M:%S"),
            "date": n.strftime("%b %d, %Y"),
            "session": session_key(),
            "source": "polygon",
        }

    # Fallback: manual calculation
    is_open = (n.weekday() < 5 and 570 <= n.hour * 60 + n.minute < 960)
    entry_window = (is_open and 630 <= n.hour * 60 + n.minute < 930)
    return {
        "is_open": is_open,
        "after_hours": False,
        "early_hours": False,
        "entry_window": entry_window,
        "time_et": n.strftime("%H:%M:%S"),
        "date": n.strftime("%b %d, %Y"),
        "session": session_key(),
        "source": "manual",
    }


# ═══════════════════════════════════════════════════════════════
#  CORE ENDPOINTS (existing — unchanged logic)
# ═══════════════════════════════════════════════════════════════

@app.get("/")
def root():
    return {
        "name": "ATLAS Signal API",
        "version": "8.0",
        "engine": "Polygon.io Primary",
        "status": "running",
        "market": market_status(),
    }


@app.get("/api/gate")
def api_gate():
    """Macro gate: GO / CAUTION / WARN / STOP."""
    sp  = get_sp500()
    vix = get_vix()
    g   = macro_gate(sp, vix)
    g["market"] = market_status()
    return g


@app.get("/api/pulse")
def api_pulse():
    """Market pulse: S&P, VIX, F&G, Fed, 10Y, BTC dominance."""
    sp = get_sp500()
    sp_price = round(float(sp.iloc[-1]), 2) if sp is not None and len(sp) > 0 else None
    sp_chg = None
    if sp is not None and len(sp) >= 2:
        sp_chg = round((float(sp.iloc[-1]) - float(sp.iloc[-2])) / float(sp.iloc[-2]) * 100, 2)

    vix = get_vix()
    fg  = get_fear_greed()
    fed = get_fed_rate()
    t10 = get_10y_yield()
    btd = get_btc_dominance()

    return {
        "sp500": {"price": sp_price, "change": sp_chg},
        "vix": {"value": vix},
        "fear_greed": fg,
        "fed_rate": fed,
        "yield_10y": t10,
        "btc_dominance": btd,
        "market": market_status(),
    }


@app.get("/api/scan/{mode}")
def api_scan(mode: str):
    """
    Run full scan for a universe.
    mode: stocks | crypto | leveraged
    Returns ranked results with scores, levels, sparklines.
    """
    universes = {
        "stocks": STOCKS_UNIVERSE,
        "crypto": CRYPTO_UNIVERSE,
        "leveraged": LVRG_UNIVERSE,
    }
    if mode not in universes:
        raise HTTPException(status_code=400, detail=f"Invalid mode: {mode}. Use: stocks, crypto, leveraged")

    universe = universes[mode]
    results = []
    prices = get_prices(universe)

    for tk in universe:
        sd = score(tk)
        if sd is None:
            continue
        if sd["tech_score"] < 50 or not sd["tiers"]["survival_pass"]:
            continue

        # Get live price from Polygon snapshot
        lp = prices.get(tk, {})
        if lp.get("price"):
            sd["price"] = lp["price"]
            sd["change"] = lp.get("change", 0)
        else:
            sd["change"] = 0

        results.append(sd)

    # Sort by tech score descending
    results.sort(key=lambda x: x["tech_score"], reverse=True)

    # Add rank and company name
    for i, r in enumerate(results):
        r["rank"] = i + 1
        r["name"] = get_name(r["ticker"])

    labels = {
        "stocks": "S&P 500 stocks",
        "crypto": "Crypto ETFs + spot",
        "leveraged": "Leveraged ETFs + Mag7",
    }

    return {
        "mode": mode,
        "label": labels[mode],
        "scanned": len(universe),
        "found": len(results),
        "results": results[:15],
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "market": market_status(),
    }


@app.get("/api/score/{ticker}")
def api_score(ticker: str):
    """Full score for a single ticker."""
    tk = ticker.upper()
    sd = score(tk)
    if sd is None:
        raise HTTPException(status_code=404, detail=f"No data for {tk}")

    # Load full catalyst
    cat = compute_full_catalyst(
        tk,
        mfi_cat=sd["catalyst_components"]["mfi"],
        ped_cat=sd["catalyst_components"]["post_earnings_drift"],
        rs_cat=sd["catalyst_components"]["relative_strength"],
    )

    # Upgrade signal with full catalyst
    sig, cls, chip = upgrade_signal(sd, cat["total"])
    sd["signal"] = sig
    sd["signal_cls"] = cls
    sd["chip"] = chip
    sd["catalyst"] = cat

    return sd


@app.get("/api/chart/{ticker}")
def api_chart(ticker: str, period: str = "6mo"):
    """OHLCV + indicators for charting."""
    tk = ticker.upper()
    df = get_daily(tk, period="2y")
    if df is None:
        raise HTTPException(status_code=404, detail=f"No data for {tk}")

    d = calc_ind(df)

    # Filter by period
    period_map = {
        "1mo": 21, "3mo": 63, "6mo": 126,
        "1y": 252, "2y": 504, "5y": 1260,
    }
    days = period_map.get(period, 126)
    d = d.iloc[-days:]

    # Build response
    candles = []
    for idx, row in d.iterrows():
        candles.append({
            "date": idx.strftime("%Y-%m-%d"),
            "open": round(float(row["Open"]), 2),
            "high": round(float(row["High"]), 2),
            "low": round(float(row["Low"]), 2),
            "close": round(float(row["Close"]), 2),
            "volume": int(row["Volume"]),
            "ma50": round(float(row["MA50"]), 2) if not pd.isna(row.get("MA50")) else None,
            "ma200": round(float(row["MA200"]), 2) if not pd.isna(row.get("MA200")) else None,
            "ema21": round(float(row["EMA21"]), 2) if not pd.isna(row.get("EMA21")) else None,
            "rsi": round(float(row["RSI"]), 1) if not pd.isna(row.get("RSI")) else None,
            "mfi": round(float(row["MFI"]), 1) if not pd.isna(row.get("MFI")) else None,
        })

    return {
        "ticker": tk,
        "period": period,
        "candles": candles,
        "latest": candles[-1] if candles else None,
    }


@app.get("/api/catalyst/{ticker}")
def api_catalyst(ticker: str):
    """Catalyst data for a ticker (FMP + OpenInsider)."""
    tk = ticker.upper()
    cat = get_catalyst(tk)
    return {"ticker": tk, "catalyst": cat}


@app.get("/api/news")
def api_news():
    """Macro news with sentiment — Benzinga via Polygon primary."""
    return {"news": get_macro_news()}


@app.get("/api/earnings")
def api_earnings():
    """Upcoming earnings this week."""
    return {"earnings": get_upcoming_earnings()}


@app.get("/api/overview")
def api_overview():
    """Crypto Core Four + market overview."""
    crypto = get_crypto()
    overview = get_market_overview()

    # Format Core Four
    core_four = []
    for cid, meta in CORE_FOUR.items():
        cd = crypto.get(cid, {})
        core_four.append({
            "id": cid,
            "symbol": meta["sym"],
            "thesis": meta["thesis"],
            "price": cd.get("usd"),
            "change_24h": cd.get("usd_24h_change"),
            "market_cap": cd.get("usd_market_cap"),
        })

    return {
        "core_four": core_four,
        "indexes": overview,
        "btc_dominance": get_btc_dominance(),
    }


@app.get("/api/analyze/{ticker}")
def api_analyze(ticker: str):
    """Deep ticker analysis — fundamentals, earnings, analysts, insiders, valuation, rating."""
    tk = ticker.upper()
    data = analyze_ticker(tk)
    if not data or not data.get("price", {}).get("current"):
        raise HTTPException(status_code=404, detail=f"No data for {tk}")
    return data


# ═══════════════════════════════════════════════════════════════
#  NEW ENDPOINTS — Polygon-powered
# ═══════════════════════════════════════════════════════════════

@app.get("/api/market-status")
def api_market_status():
    """Real-time market status from Polygon."""
    return {
        "status": get_market_status(),
        "holidays": get_market_holidays(),
    }


@app.get("/api/details/{ticker}")
def api_details(ticker: str):
    """Full company details from Polygon — name, sector, market cap, description, employees."""
    tk = ticker.upper()
    details = get_ticker_details(tk)
    if not details or details.get("name") == tk:
        raise HTTPException(status_code=404, detail=f"No details for {tk}")
    return {"ticker": tk, "details": details}


@app.get("/api/shorts/{ticker}")
def api_shorts(ticker: str):
    """Short interest + short volume for a ticker."""
    tk = ticker.upper()
    interest = get_short_interest(tk)
    volume = get_short_volume(tk)
    return {
        "ticker": tk,
        "short_interest": interest,
        "short_volume": volume,
    }


@app.get("/api/analysts/{ticker}")
def api_analysts(ticker: str):
    """Analyst consensus + individual ratings from Benzinga via Polygon."""
    tk = ticker.upper()
    consensus = get_analyst_consensus(tk)
    ratings = get_analyst_ratings(tk)
    return {
        "ticker": tk,
        "consensus": consensus,
        "ratings": ratings,
    }


@app.get("/api/financials/{ticker}")
def api_financials(ticker: str):
    """Quarterly financials from Polygon — revenue, net income, EPS, cash flow."""
    tk = ticker.upper()
    data = get_financials(tk)
    if not data:
        raise HTTPException(status_code=404, detail=f"No financials for {tk}")
    return {"ticker": tk, "quarters": data}


@app.get("/api/dividends/{ticker}")
def api_dividends(ticker: str):
    """Dividend data from Polygon — history, frequency, yield estimate."""
    tk = ticker.upper()
    data = get_dividends(tk)
    return {"ticker": tk, "dividends": data}


@app.get("/api/related/{ticker}")
def api_related(ticker: str):
    """Related companies from Polygon."""
    tk = ticker.upper()
    related = get_related_tickers(tk)
    return {"ticker": tk, "related": related}


@app.get("/api/splits/{ticker}")
def api_splits(ticker: str):
    """Stock split history from Polygon."""
    tk = ticker.upper()
    data = get_splits(tk)
    return {"ticker": tk, "splits": data}


@app.get("/api/ticker-news/{ticker}")
def api_ticker_news(ticker: str):
    """News for a specific ticker from Polygon."""
    tk = ticker.upper()
    data = get_ticker_news(tk)
    return {"ticker": tk, "news": data}


@app.get("/api/movers")
def api_movers():
    """Top gainers and losers from Polygon snapshot."""
    return {
        "gainers": get_gainers(),
        "losers": get_losers(),
    }


@app.get("/api/treasury")
def api_treasury():
    """Treasury yields from Polygon."""
    t10 = get_10y_yield()
    fed = get_fed_rate()
    return {
        "yield_10y": t10,
        "fed_rate": fed,
    }


# ═══════════════════════════════════════════════════════════════
#  CACHE MANAGEMENT
# ═══════════════════════════════════════════════════════════════

@app.get("/api/cache/stats")
def api_cache_stats():
    """Cache diagnostics."""
    return cache.stats()


@app.post("/api/cache/clear")
def api_cache_clear():
    """Clear all caches. Use after market close or on demand."""
    cache.clear()
    return {"status": "cleared"}
