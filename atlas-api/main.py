"""
ATLAS API — FastAPI Application
All endpoints for the ATLAS Signal Dashboard.

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
                  get_prices, get_daily)
from gate import macro_gate
from scoring import score, upgrade_signal
from catalyst import get_catalyst, compute_full_catalyst
from indicators import calc_ind


# ─── App Setup ────────────────────────────────────────────────
app = FastAPI(
    title="ATLAS Signal API",
    description="14-Rule Trading Signal Engine",
    version="7.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Lock down in production to your domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Helpers ──────────────────────────────────────────────────
def now_et():
    et = pytz.timezone("America/New_York")
    return datetime.now(et)


def market_status():
    n = now_et()
    is_open = (n.weekday() < 5 and
               570 <= n.hour * 60 + n.minute < 960)
    entry_window = (is_open and
                    630 <= n.hour * 60 + n.minute < 930)
    return {
        "is_open": is_open,
        "entry_window": entry_window,
        "time_et": n.strftime("%H:%M:%S"),
        "date": n.strftime("%b %d, %Y"),
        "session": session_key(),
    }


# ═══════════════════════════════════════════════════════════════
#  ENDPOINTS
# ═══════════════════════════════════════════════════════════════

@app.get("/")
def root():
    return {
        "name": "ATLAS Signal API",
        "version": "7.0",
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

        # Get live price
        lp = prices.get(tk, {})
        if lp.get("price"):
            sd["price"] = lp["price"]
            sd["change"] = lp.get("change", 0)
        else:
            sd["change"] = 0

        results.append(sd)

    # Sort by tech score descending
    results.sort(key=lambda x: x["tech_score"], reverse=True)

    # Add rank
    for i, r in enumerate(results):
        r["rank"] = i + 1

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
    """Macro news with sentiment."""
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


@app.get("/api/cache/stats")
def api_cache_stats():
    """Cache diagnostics."""
    return cache.stats()


@app.post("/api/cache/clear")
def api_cache_clear():
    """Clear all caches. Use after market close or on demand."""
    cache.clear()
    return {"status": "cleared"}
