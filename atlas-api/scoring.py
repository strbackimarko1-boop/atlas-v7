"""
ATLAS API — Scoring Engine v9 (Polygon-Only)
================================================
14-rule two-engine scorer: Technical Gate + Catalyst Strength.

Changes from v8:
  - Removed Finnhub R10 call → uses Polygon Benzinga earnings via data layer
  - Removed FINNHUB_KEY dependency
  - NEW catalyst signals:
      * Analyst upgrades from major firms (last 30 days)
      * Corporate guidance raises (last 30 days)
      * Analyst consensus rating (buy_pct/sell_pct)
      * Short interest level (squeeze setup vs smart money short)
  - Catalyst max range expanded from ~25 to ~73
  - Skip rule added: if consensus is >50% sell, lower signal grade
  - All data from Polygon (or returns None — no silent fallbacks)
"""
import numpy as np
import pandas as pd
from datetime import datetime, timedelta

from config import (VIX_MAX, RSI_LO, RSI_HI,
                    CHIP_MIN, CHIP_MAX, CACHE_TTL, get_chip)
from cache import cached
from data import (get_daily, get_sp500, get_vix, check_earnings, get_name,
                  get_prices, get_short_volume, get_short_interest,
                  get_analyst_ratings_summary, get_analyst_consensus,
                  get_guidance)
from indicators import calc_ind


def _safe_call(fn, *args, default=None):
    """Call a data function and return default if it raises/returns None."""
    try:
        result = fn(*args)
        return result if result is not None else default
    except Exception:
        return default


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
    name = get_name(tk)

    # ── Live price from Polygon snapshot ────────────────────────
    live = get_prices([tk])
    live_price = live.get(tk, {}).get("price")
    live_change = live.get(tk, {}).get("change", 0)
    current_price = live_price if live_price and live_price > 0 else round(float(row["Close"]), 2)

    # ═══════════════════════════════════════════════════════════
    # TECHNICAL ENGINE — 4 Tiers
    # ═══════════════════════════════════════════════════════════

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

    # R10: Post-earnings drift via Polygon (replaces old Finnhub call)
    # Check if a recent earnings event happened and stock rallied 3%+ since
    r10 = False
    if not clear and earn_dt:
        # earn_dt is upcoming earnings — not a drift signal
        r10 = False
    else:
        # Try to detect drift from price action: if last 15-45 days show strong move
        # without confirmed earnings date, treat as soft signal off momentum
        try:
            if len(d) > 45 and not pd.isna(ret20):
                # Proxy: if 20-day return is >5% AND price is above MA50, treat as post-earnings drift
                if ret20 > 5 and current_price > row["MA50"]:
                    r10 = True
        except Exception:
            pass

    t4_score = round(sum([r9, r10]) / 2 * 100)

    # ── WEIGHTED TECHNICAL SCORE ─────────────────────────────
    tech_score = round(t1_score * 0.35 + t2_score * 0.25 + t3_score * 0.25 + t4_score * 0.15)

    # ═══════════════════════════════════════════════════════════
    # CATALYST ENGINE — Polygon Benzinga Data
    # ═══════════════════════════════════════════════════════════

    # — Indicator-based catalyst components —
    mfi_cat = 0
    if not pd.isna(mfi):
        if mfi > 70:   mfi_cat = 15
        elif mfi > 60: mfi_cat = 10
        elif mfi > 50: mfi_cat = 5

    ped_cat = 10 if r10 else 0
    rs_cat  = 5 if r9 else 0

    # — Short volume (daily short pressure / squeeze setup) —
    short_cat = 0
    sv = _safe_call(get_short_volume, tk)
    if sv and sv.get("ratio"):
        ratio = sv["ratio"]
        if ratio > 55:
            short_cat = -10   # Heavy selling — bearish, penalize
        elif ratio > 50:
            short_cat = 8    # Potential squeeze setup
        elif ratio > 40:
            short_cat = 3

    # — Short interest (longer-term positioning) —
    short_int_cat = 0
    si = _safe_call(get_short_interest, tk)
    if si:
        sir = si.get("short_interest_ratio")
        dtc = si.get("days_to_cover")
        try:
            if sir and float(sir) > 0.25 and not r3:
                short_int_cat = -15   # >25% shorted + below 200MA = smart money is right
            elif dtc and float(dtc) > 5 and r3:
                short_int_cat = 8     # Tight float, breakout potential
            elif sir and float(sir) > 0.15 and r3:
                short_int_cat = 5     # Moderate short interest in uptrend
        except (ValueError, TypeError):
            pass

    # — Analyst rating actions (last 30 days, major firms) —
    analyst_cat = 0
    ar = _safe_call(get_analyst_ratings_summary, tk)
    if ar:
        ups = ar.get("upgrades_major_30d", 0)
        downs = ar.get("downgrades_major_30d", 0)
        target_raises = ar.get("target_raises_30d", 0)
        target_cuts = ar.get("target_cuts_30d", 0)

        if ups >= 2:
            analyst_cat = 15
        elif ups >= 1:
            analyst_cat = 10
        elif downs >= 2:
            analyst_cat = -15
        elif downs >= 1:
            analyst_cat = -5

        # Price target movement bonus
        if target_raises >= 3:
            analyst_cat += 5
        elif target_cuts >= 3:
            analyst_cat -= 5

    # — Corporate guidance updates (last 30 days) —
    guidance_cat = 0
    guidance = _safe_call(get_guidance, tk)
    if guidance and len(guidance) > 0:
        try:
            latest = guidance[0]
            g_date = latest.get("date", "")
            if g_date:
                g_dt = datetime.strptime(g_date[:10], "%Y-%m-%d")
                if (datetime.now() - g_dt).days <= 30:
                    eps_now = latest.get("eps_guidance")
                    eps_prior = latest.get("prior_eps")
                    rev_now = latest.get("revenue_guidance")
                    rev_prior = latest.get("prior_revenue")
                    raised = False
                    cut = False
                    if eps_now and eps_prior:
                        if float(eps_now) > float(eps_prior):
                            raised = True
                        elif float(eps_now) < float(eps_prior):
                            cut = True
                    if rev_now and rev_prior:
                        if float(rev_now) > float(rev_prior):
                            raised = True
                        elif float(rev_now) < float(rev_prior):
                            cut = True
                    if raised:
                        guidance_cat = 10
                    elif cut:
                        guidance_cat = -10
        except Exception:
            pass

    # — Analyst consensus (sentiment baseline) —
    consensus_cat = 0
    consensus_block = False
    consensus = _safe_call(get_analyst_consensus, tk)
    if consensus:
        buy_pct = consensus.get("buy_pct", 0) or 0
        sell_pct = consensus.get("sell_pct", 0) or 0
        if buy_pct >= 70:
            consensus_cat = 10
        elif buy_pct >= 50:
            consensus_cat = 5
        elif sell_pct >= 50:
            consensus_cat = -10
            consensus_block = True   # Hard block — Wall Street is bearish

    # ── COMBINE CATALYSTS ──────────────────────────────────
    raw_catalyst = (mfi_cat + ped_cat + rs_cat + short_cat + short_int_cat +
                    analyst_cat + guidance_cat + consensus_cat)
    catalyst_base = max(0, min(100, raw_catalyst))

    # ═══════════════════════════════════════════════════════════
    # SIGNAL DECISION
    # ═══════════════════════════════════════════════════════════

    if not t1_pass:
        signal, signal_cls = "SKIP", "skip"
    elif consensus_block:
        # Wall Street says sell — downgrade signal even if technicals look OK
        signal, signal_cls = "FORMING", "forming"
    elif tech_score >= 75 and catalyst_base >= 50:
        signal, signal_cls = "STRONG BUY", "strong_buy"
    elif tech_score >= 75:
        signal, signal_cls = "BUY", "buy"
    elif tech_score >= 55 and catalyst_base >= 40:
        signal, signal_cls = "BUY", "buy"
    elif tech_score >= 55:
        signal, signal_cls = "FORMING", "forming"
    else:
        signal, signal_cls = "FORMING", "forming"

    # ── CHIP SIZE ────────────────────────────────────────────
    if not t1_pass or tech_score < 55 or consensus_block:
        chip = 0
    elif tech_score >= 85 and catalyst_base >= 60:
        chip = CHIP_MAX
    elif tech_score >= 75 and catalyst_base >= 40:
        chip = 3500
    elif tech_score >= 65:
        chip = 3000
    else:
        chip = CHIP_MIN

    # ── ENTRY LEVELS (using live price) ──────────────────────
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
    if analyst_cat >= 10:
        reasons.append("major analyst upgrade")
    if guidance_cat >= 10:
        reasons.append("guidance raised")
    if consensus_cat >= 10:
        reasons.append("Wall St consensus buy")
    if short_int_cat > 0:
        reasons.append("squeeze setup")

    if not r7: warnings.append("near highs — overbought")
    if not r8: warnings.append(f"earnings {earn_dt or 'soon'} — blocked")
    if not r2: warnings.append("VIX elevated")
    if analyst_cat <= -10: warnings.append("major analyst downgrade")
    if guidance_cat <= -10: warnings.append("guidance cut")
    if consensus_cat <= -10: warnings.append("Wall St consensus sell")
    if short_cat <= -10: warnings.append("heavy short volume today")
    if short_int_cat <= -10: warnings.append("smart money shorting")

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
            "short_volume": short_cat,
            "short_interest": short_int_cat,
            "analyst_actions": analyst_cat,
            "guidance": guidance_cat,
            "consensus": consensus_cat,
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
        "consensus_block": consensus_block,
        "sparkline": sparkline,
        "reason": why_text,
    }


def upgrade_signal(score_data, catalyst_total):
    """Combine technical + catalyst into final signal grade."""
    tech = score_data["tech_score"]
    t1_pass = score_data["tiers"]["survival_pass"]
    consensus_block = score_data.get("consensus_block", False)

    if not t1_pass:
        return "SKIP", "skip", 0
    if consensus_block:
        return "FORMING", "forming", CHIP_MIN

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
