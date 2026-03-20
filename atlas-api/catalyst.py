"""
ATLAS API — Catalyst Engine
FMP analyst grades, insider trades, fundamentals + OpenInsider cluster detection.
Extracted from atlas_dashboard.py get_catalyst().
"""
import requests
from datetime import datetime, timedelta

from config import FMP_KEY, CACHE_TTL
from cache import cached


@cached(ttl=CACHE_TTL["catalyst"], key_func=lambda tk: f"catalyst:{tk}")
def get_catalyst(tk):
    """
    Compute catalyst score for a ticker.
    Returns dict with individual scores and details.

    Max scores:
      Insider buying:  40%  (cluster = max)
      Analyst upgrade: 20%
      Fundamentals:    10%  (P/E, debt, ROE)

    OpenInsider + FMP combined.
    """
    cat = {
        "insider_score": 0, "insider_detail": "",
        "analyst_score": 0, "analyst_detail": "",
        "fund_score": 0,    "fund_detail": "",
        "openinsider": False, "oi_detail": "",
    }

    # ── FMP Analyst Grades ────────────────────────────────────
    try:
        r = requests.get(
            f"https://financialmodelingprep.com/stable/grades-latest"
            f"?symbol={tk}&limit=5&apikey={FMP_KEY}",
            timeout=5)
        if r.status_code == 200 and r.json():
            latest = r.json()[0]
            grade = latest.get("newGrade", "").lower()
            company = latest.get("gradingCompany", "")
            is_buy = any(w in grade for w in
                         ["buy", "outperform", "overweight", "strong buy"])
            try:
                d = datetime.strptime(latest.get("date", "")[:10], "%Y-%m-%d")
                recent = (datetime.now() - d).days <= 30
            except Exception:
                recent = False

            if is_buy and recent:
                cat["analyst_score"] = 20
                cat["analyst_detail"] = f"{company} → {grade.title()}"
            elif is_buy:
                cat["analyst_score"] = 10
                cat["analyst_detail"] = f"{company} → {grade.title()} (>30d)"
    except Exception:
        pass

    # ── FMP Insider Trades ────────────────────────────────────
    try:
        r = requests.get(
            f"https://financialmodelingprep.com/stable/insider-trading"
            f"?symbol={tk}&limit=10&apikey={FMP_KEY}",
            timeout=5)
        if r.status_code == 200:
            buys = []
            for t in r.json():
                ttype = t.get("transactionType", "").lower()
                if "purchase" in ttype or "buy" in ttype:
                    try:
                        td = datetime.strptime(t.get("transactionDate", "")[:10], "%Y-%m-%d")
                        if (datetime.now() - td).days <= 90:
                            buys.append({
                                "name": t.get("reportingName", ""),
                                "shares": t.get("securitiesTransacted", 0),
                                "value": t.get("price", 0) * t.get("securitiesTransacted", 0),
                                "date": t.get("transactionDate", "")[:10],
                            })
                    except Exception:
                        continue

            if len(buys) >= 3:
                cat["insider_score"] = 40  # Cluster buy = max
                cat["insider_detail"] = f"{len(buys)} insiders buying (cluster)"
            elif len(buys) == 2:
                cat["insider_score"] = 25
                cat["insider_detail"] = f"2 insider buys last 90d"
            elif len(buys) == 1:
                cat["insider_score"] = 15
                cat["insider_detail"] = f"{buys[0]['name'][:20]} bought"
    except Exception:
        pass

    # ── FMP Key Metrics (fundamentals) ────────────────────────
    try:
        r = requests.get(
            f"https://financialmodelingprep.com/stable/key-metrics"
            f"?symbol={tk}&limit=1&apikey={FMP_KEY}",
            timeout=5)
        if r.status_code == 200 and r.json():
            km = r.json()[0]
            pe = km.get("peRatio")
            roe = km.get("returnOnEquity")
            debt = km.get("debtToEquity")

            fund_pts = 0
            details = []

            if pe and 5 < pe < 25:
                fund_pts += 4
                details.append(f"P/E {pe:.1f}")
            if roe and roe > 0.15:
                fund_pts += 3
                details.append(f"ROE {roe:.0%}")
            if debt and debt < 1.0:
                fund_pts += 3
                details.append(f"D/E {debt:.1f}")

            cat["fund_score"] = min(10, fund_pts)
            cat["fund_detail"] = " · ".join(details) if details else ""
    except Exception:
        pass

    # ── OpenInsider Cluster Detection ─────────────────────────
    try:
        r = requests.get(
            f"http://openinsider.com/screener?s={tk}"
            "&o=&pl=&ph=&ll=&lh=&fd=90&fdr=&td=0&tdr="
            "&feession=at&t=p&tc=1&ic=&idr=&ession=&ma=&mession=&mlt=&mht=",
            timeout=3,
            headers={"User-Agent": "Mozilla/5.0"})
        if r.status_code == 200:
            text = r.text.lower()
            # Count purchase rows in the table
            purchase_count = text.count("purchase")
            if purchase_count >= 3:
                cat["openinsider"] = True
                cat["oi_detail"] = f"{purchase_count} purchases on OpenInsider (90d)"
                # Boost insider score if not already maxed
                if cat["insider_score"] < 40:
                    cat["insider_score"] = min(40, cat["insider_score"] + 15)
    except Exception:
        pass  # OpenInsider timeout is a known issue — fail gracefully

    return cat


def compute_full_catalyst(tk, mfi_cat=0, ped_cat=0, rs_cat=0):
    """
    Combine FMP/OpenInsider catalysts with indicator-based catalysts.
    Returns total catalyst score (0-100) and breakdown.
    """
    cat_data = get_catalyst(tk)

    total = min(100,
        cat_data["insider_score"] +
        cat_data["analyst_score"] +
        cat_data["fund_score"] +
        mfi_cat + ped_cat + rs_cat
    )

    return {
        "total": total,
        "insider": cat_data["insider_score"],
        "insider_detail": cat_data["insider_detail"],
        "analyst": cat_data["analyst_score"],
        "analyst_detail": cat_data["analyst_detail"],
        "fundamentals": cat_data["fund_score"],
        "fund_detail": cat_data["fund_detail"],
        "mfi": mfi_cat,
        "post_earnings_drift": ped_cat,
        "relative_strength": rs_cat,
        "openinsider": cat_data["openinsider"],
        "oi_detail": cat_data["oi_detail"],
    }
