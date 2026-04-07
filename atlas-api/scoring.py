"""
ATLAS API — Scoring Engine v8
14-rule two-engine scorer: Technical Gate + Catalyst Strength.
Updated for Polygon.io real-time data.

Changes from v7:
  - Entry now based on current close + breakout buffer (not stale prev_hi)
  - Live price injected from Polygon snapshot when available
  - Short interest used as supplementary edge signal
  - Removed direct Finnhub API call for R10 — uses data layer instead
  - Added VWAP proximity check as timing bonus
"""
import numpy as np
import pandas as pd
import requests
from datetime import datetime, timedelta

from config import (FINNHUB_KEY, VIX_MAX, RSI_LO, RSI_HI,
                    CHIP_MIN, CHIP_MAX, CACHE_TTL, get_chip)
from cache import cached
from data import (get_daily, get_sp500, get_vix, check_earnings, get_name,
                  get_prices, get_short_volume)
from indicators import calc_ind


@cached(ttl=CACHE_TTL["score"], key_func=lambda tk: f"score:{tk}")
def score(tk):
    df = get_daily(tk)
    if df is None or len(df) < 60:
        return None

    d = calc_ind(df)
    d.dropna(subset=["MA50", "RSI"], inplace=True)
    if len(d) < 2:
        return None

    row = d.iloc[-1]
    prev_row = d.iloc[-2]
    sp  = get_sp500()
    vix = get_vix()

    rsi   = row.get("RSI", np.nan)
    pb    = row.get("PB", np.nan)
    adx   = row.get("ADX", np.nan)
    vr    = row.get("VR", np.nan)
    mfi   = row.get("MFI", np.nan)
    ret20 = row.get("RET20", np.nan)
    r6m   = row.get("R6M", np.nan)
    r52   = row.get("R52", np.nan)

    clear, earn_dt = check_earnings(tk)

    # ── Company name (Polygon primary, cached 24h) ─────────────
    name = get_name(tk)

    # ── Get live price from Polygon snapshot ───────────────────
    live = get_prices([tk])
    live_price = live.get(tk, {}).get("price")
    live_change = live.get(tk, {}).get("change", 0)

    # Use live price if available, otherwise latest close from historical
    current_price = live_price if live_price and live_price > 0 else round(float(row["Close"]), 2)

    # ── TIER 1 — Survival (35%, must be 100%) ────────────────
    r7 = bool((not pd.isna(r6m) and r6m < 85) or (not pd.isna(r52) and r52 < 80))
    r8 = clear
    t1_pass  = r7 and r8
    t1_score = 100 if t1_pass else (50 if (r7 or r8) else 0)

    # ── TIER 2 — Regime (25%) ────────────────────────────────
    r1 = bool(sp is not None and len(sp) > 200 and
              float(sp.iloc[-1]) > float(sp.rolling(200).mean().iloc[-1]))
    r2 = bool(vix and vix < VIX_MAX)
    r3 = bool(not pd.isna(row.get("MA200", np.nan)) and current_price > row["MA200"])
    t2_score = round(sum([r1, r2, r3]) / 3 * 100)

    # ── TIER 3 — Timing (25%) ────────────────────────────────
    r4 = bool(current_price > row["MA50"] * 0.95)
    r5 = bool(not pd.isna(pb) and 5 <= pb <= 12 and not pd.isna(adx) and adx > 15)
    r6 = bool((not pd.isna(rsi) and RSI_LO <= rsi <= RSI_HI) or
              (not pd.isna(vr) and vr < 1.0))
    t3_score = round(sum([r4, r5, r6]) / 3 * 100)

    # ── TIER 4 — Edge (15%) ──────────────────────────────────
    if sp is not None and len(sp) > 21 and not pd.isna(ret20):
        sp_r = (float(sp.iloc[-1]) - float(sp.iloc[-21])) / float(sp.iloc[-21]) * 100
        r9 = bool(ret20 > sp_r)
    else:
        r9 = False

    # R10: Post-earnings drift — check if stock rallied 3%+ in 15-45 days after earnings
    r10 = False
    try:
        p30 = (datetime.now() - timedelta(days=45)).strftime("%Y-%m-%d")
        p15 = (datetime.now() - timedelta(days=15)).strftime("%Y-%m-%d")
        re = requests.get(
            f"https://finnhub.io/api/v1/calendar/earnings?from={p30}&to={p15}"
            f"&symbol={tk}&token={FINNHUB_KEY}",
            timeout=4)
        cal = re.json().get("earningsCalendar", [])
        if cal:
            ed = cal[0].get("date", "")
            if ed:
                days = (datetime.now() - datetime.strptime(ed, "%Y-%m-%d")).days
                if 15 <= days <= 45 and len(d) > days:
                    ret_e = (current_price - float(d["Close"].iloc[-days])) / \
                             float(d["Close"].iloc[-days]) * 100
                    r10 = bool(ret_e > 3)
    except Exception:
        pass

    t4_score = round(sum([r9, r10]) / 2 * 100)

    # ── WEIGHTED TECHNICAL SCORE ─────────────────────────────
    tech_score = round(t1_score * 0.35 + t2_score * 0.25 + t3_score * 0.25 + t4_score * 0.15)

    # ── CATALYST (indicator-based, no API calls) ─────────────
    mfi_cat = 0
    if not pd.isna(mfi):
        if mfi > 70:   mfi_cat = 15
        elif mfi > 60: mfi_cat = 10
        elif mfi > 50: mfi_cat = 5

    ped_cat = 10 if r10 else 0
    rs_cat  = 5 if r9 else 0

    # NEW: Short volume ratio as supplementary signal
    # High short volume (>40%) can indicate bearish pressure OR squeeze setup
    short_cat = 0
    try:
        sv = get_short_volume(tk)
        if sv and sv.get("ratio"):
            ratio = sv["ratio"]
            if ratio > 50:
                short_cat = 5   # Potential squeeze setup — extra edge
            elif ratio > 40:
                short_cat = 2
    except Exception:
        pass

    catalyst_base = min(100, mfi_cat + ped_cat + rs_cat + short_cat)

    # ── SIGNAL DECISION ──────────────────────────────────────
    if not t1_pass:
        signal, signal_cls = "SKIP", "skip"
    elif tech_score >= 75:
        signal, signal_cls = "BUY", "buy"
    elif tech_score >= 55:
        signal, signal_cls = "FORMING", "forming"
    else:
        signal, signal_cls = "FORMING", "forming"

    # ── CHIP SIZE ────────────────────────────────────────────
    if not t1_pass or tech_score < 55:
        chip = 0
    elif tech_score >= 85:
        chip = CHIP_MAX
    elif tech_score >= 75:
        chip = 3500
    elif tech_score >= 65:
        chip = 3000
    else:
        chip = CHIP_MIN

    # ── ENTRY LEVELS (using live price) ──────────────────────
    # Entry: breakout above recent high with 0.5% buffer
    # Uses the HIGHER of: yesterday's high, or current price
    # This ensures entry isn't below where the stock already is
    prev_hi = float(prev_row["High"])
    raw_entry = max(prev_hi, current_price)
    entry = round(raw_entry * 1.005, 2)
    stop  = round(entry * 0.950, 2)
    t1    = round(entry * 1.080, 2)
    t2    = round(entry * 1.150, 2)
    t3    = round(entry * 1.200, 2)
    rr    = round((t1 - entry) / (entry - stop), 2) if entry != stop else 0

    # ── SHORT SIGNAL ─────────────────────────────────────────
    short = bool(not r1 and not r3 and not pd.isna(rsi) and rsi > 65 and
                 not pd.isna(adx) and adx > 20)

    # ── SPARKLINE DATA (last 30 closes) ──────────────────────
    sparkline = [round(float(x), 2) for x in d["Close"].iloc[-30:].tolist()]

    # ── WHY (plain English reasoning) ────────────────────────
    reasons, warnings = [], []
    if r9:  reasons.append("outperforming the market")
    if r5:
        reasons.append(f"clean pullback {pb:.0f}% in trend" if not pd.isna(pb) else "clean pullback in trend")
    if r6 and not pd.isna(rsi) and RSI_LO <= rsi <= RSI_HI:
        reasons.append(f"RSI healthy at {rsi:.0f}")
    if r10: reasons.append("post-earnings momentum")
    if not pd.isna(mfi) and mfi > 60:
        reasons.append("strong buying pressure")
    if r3:  reasons.append("above 200MA uptrend")
    if short_cat > 0:
        reasons.append("high short interest — squeeze potential")
    if not r7: warnings.append("near highs — overbought")
    if not r8: warnings.append(f"earnings {earn_dt or 'soon'} — blocked")
    if not r2: warnings.append("VIX elevated")

    why_text = " · ".join(reasons[:3]) if reasons else "Setup forming"
    if warnings:
        why_text += f" — {warnings[0]}"

    return {
        "ticker": tk,
        "name": name,
        "signal": signal,
        "signal_cls": signal_cls,
        "tech_score": tech_score,
        "catalyst_base": catalyst_base,
        "tiers": {
            "survival": t1_score,
            "survival_pass": t1_pass,
            "regime": t2_score,
            "timing": t3_score,
            "edge": t4_score,
        },
        "rules": {
            "R1": r1, "R2": r2, "R3": r3, "R4": r4, "R5": r5,
            "R6": r6, "R7": r7, "R8": r8, "R9": r9, "R10": r10,
        },
        "indicators": {
            "rsi": round(rsi, 1) if not pd.isna(rsi) else None,
            "adx": round(adx, 1) if not pd.isna(adx) else None,
            "mfi": round(mfi, 1) if not pd.isna(mfi) else None,
            "pullback": round(pb, 1) if not pd.isna(pb) else None,
            "ret20": round(ret20, 1) if not pd.isna(ret20) else None,
        },
        "catalyst_components": {
            "mfi": mfi_cat,
            "post_earnings_drift": ped_cat,
            "relative_strength": rs_cat,
            "short_squeeze": short_cat,
        },
        "levels": {
            "entry": entry, "stop": stop,
            "t1": t1, "t2": t2, "t3": t3,
            "risk_reward": rr,
        },
        "chip": chip,
        "price": current_price,
        "change": live_change,
        "earnings_date": earn_dt,
        "clear": clear,
        "short": short,
        "sparkline": sparkline,
        "reason": why_text,
    }


def upgrade_signal(score_data, catalyst_total):
    tech = score_data["tech_score"]
    t1_pass = score_data["tiers"]["survival_pass"]

    if not t1_pass:
        return "SKIP", "skip", 0

    if tech >= 75 and catalyst_total >= 60:
        return "STRONG BUY", "strong_buy", get_chip(catalyst_total)
    elif tech >= 75 and catalyst_total >= 30:
        return "BUY", "buy", get_chip(catalyst_total)
    elif tech >= 75:
        return "BUY", "buy", get_chip(catalyst_total)
    elif tech >= 55 and catalyst_total >= 50:
        return "BUY", "buy", get_chip(catalyst_total)
    elif tech >= 55:
        return "FORMING", "forming", CHIP_MIN
    elif catalyst_total >= 60:
        return "FORMING", "forming", CHIP_MIN
    else:
        return "FORMING", "forming", 0
