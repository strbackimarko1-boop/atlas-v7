"""
ATLAS API — Deep Ticker Analysis
Combines FMP fundamentals, analyst data, insider trades, earnings history,
and technical data into a single research response.
"""
import requests
import yfinance as yf
from datetime import datetime, timedelta

from config import FMP_KEY, FINNHUB_KEY, CACHE_TTL
from cache import cached
from scoring import score


@cached(ttl=86400, key_func=lambda tk: f"analyze:{tk}")
def analyze(tk):
    """Full research analysis for a single ticker."""
    result = {
        "ticker": tk,
        "profile": {},
        "price": {},
        "financials": {},
        "earnings": {},
        "analysts": {},
        "insiders": {},
        "valuation": {},
        "dividend": {},
        "rating": {},
        "outlook": {},
        "atlas_score": None,
    }

    # ── Company Profile (FMP) ─────────────────────────────
    try:
        r = requests.get(
            f"https://financialmodelingprep.com/stable/profile"
            f"?symbol={tk}&apikey={FMP_KEY}", timeout=8)
        if r.status_code == 200 and r.json():
            p = r.json()[0]
            result["profile"] = {
                "name": p.get("companyName", tk),
                "sector": p.get("sector", ""),
                "industry": p.get("industry", ""),
                "exchange": p.get("exchangeShortName", ""),
                "description": (p.get("description", "") or "")[:300],
                "market_cap": p.get("mktCap"),
                "employees": p.get("fullTimeEmployees"),
                "country": p.get("country", ""),
                "website": p.get("website", ""),
                "image": p.get("image", ""),
            }
    except Exception:
        pass

    if not result["profile"].get("name"):
        result["profile"]["name"] = tk

    # ── Price & 52-Week Range (Finnhub + yfinance) ────────
    try:
        r = requests.get(
            f"https://finnhub.io/api/v1/quote?symbol={tk}&token={FINNHUB_KEY}",
            timeout=5)
        if r.status_code == 200:
            d = r.json()
            c = d.get("c", 0)
            pc = d.get("pc", 0)
            h52 = d.get("h", 0)  # 52w high
            l52 = d.get("l", 0)  # 52w low
            result["price"] = {
                "current": round(c, 2) if c else None,
                "prev_close": round(pc, 2) if pc else None,
                "change": round(c - pc, 2) if c and pc else 0,
                "change_pct": round((c - pc) / pc * 100, 2) if c and pc and pc != 0 else 0,
                "high_52w": round(h52, 2) if h52 else None,
                "low_52w": round(l52, 2) if l52 else None,
            }
            # 52w range position
            if h52 and l52 and h52 != l52 and c:
                result["price"]["range_pct"] = round((c - l52) / (h52 - l52) * 100, 1)
    except Exception:
        pass

    # Fallback price from yfinance
    if not result["price"].get("current"):
        try:
            h = yf.Ticker(tk).history(period="5d")
            if h is not None and len(h) >= 2:
                c = float(h["Close"].iloc[-1])
                pc = float(h["Close"].iloc[-2])
                result["price"]["current"] = round(c, 2)
                result["price"]["change_pct"] = round((c - pc) / pc * 100, 2)
        except Exception:
            pass

    # ── Key Financials (FMP) ──────────────────────────────
    try:
        r = requests.get(
            f"https://financialmodelingprep.com/stable/key-metrics"
            f"?symbol={tk}&limit=1&apikey={FMP_KEY}", timeout=8)
        if r.status_code == 200 and r.json():
            km = r.json()[0]
            pe = km.get("peRatio")
            roe = km.get("returnOnEquity")
            de = km.get("debtToEquity")
            pm = km.get("netIncomePerShare")

            result["financials"]["pe"] = round(pe, 1) if pe else None
            result["financials"]["roe"] = round(roe * 100, 1) if roe else None
            result["financials"]["debt_equity"] = round(de, 2) if de else None
    except Exception:
        pass

    # Income statement for revenue/EPS growth
    try:
        r = requests.get(
            f"https://financialmodelingprep.com/stable/income-statement"
            f"?symbol={tk}&limit=5&apikey={FMP_KEY}", timeout=8)
        if r.status_code == 200 and r.json():
            stmts = r.json()
            if len(stmts) >= 2:
                rev_now = stmts[0].get("revenue", 0)
                rev_prev = stmts[1].get("revenue", 0)
                eps_now = stmts[0].get("eps", 0)
                eps_prev = stmts[1].get("eps", 0)
                margin = stmts[0].get("netIncome", 0) / rev_now * 100 if rev_now else None

                result["financials"]["revenue"] = rev_now
                result["financials"]["revenue_growth"] = round((rev_now - rev_prev) / rev_prev * 100, 1) if rev_prev else None
                result["financials"]["eps"] = round(eps_now, 2) if eps_now else None
                result["financials"]["eps_growth"] = round((eps_now - eps_prev) / abs(eps_prev) * 100, 1) if eps_prev else None
                result["financials"]["profit_margin"] = round(margin, 1) if margin else None

            # Score financials
            scores = []
            rg = result["financials"].get("revenue_growth")
            eg = result["financials"].get("eps_growth")
            pm_val = result["financials"].get("profit_margin")
            roe_val = result["financials"].get("roe")
            de_val = result["financials"].get("debt_equity")
            pe_val = result["financials"].get("pe")

            if rg is not None:
                scores.append({"name": "Revenue Growth", "value": f"{rg:+.1f}%", "status": "good" if rg > 5 else "warn" if rg > 0 else "bad"})
            if eg is not None:
                scores.append({"name": "EPS Growth", "value": f"{eg:+.1f}%", "status": "good" if eg > 5 else "warn" if eg > 0 else "bad"})
            if pm_val is not None:
                scores.append({"name": "Profit Margin", "value": f"{pm_val:.1f}%", "status": "good" if pm_val > 15 else "warn" if pm_val > 5 else "bad"})
            if roe_val is not None:
                scores.append({"name": "ROE", "value": f"{roe_val:.1f}%", "status": "good" if roe_val > 15 else "warn" if roe_val > 8 else "bad"})
            if de_val is not None:
                scores.append({"name": "Debt/Equity", "value": f"{de_val:.2f}", "status": "good" if de_val < 0.5 else "warn" if de_val < 1.5 else "bad"})
            if pe_val is not None:
                scores.append({"name": "P/E Ratio", "value": f"{pe_val:.1f}", "status": "good" if pe_val < 20 else "warn" if pe_val < 35 else "bad"})

            result["financials"]["scorecard"] = scores
    except Exception:
        pass

    # ── Earnings History (FMP) ────────────────────────────
    try:
        r = requests.get(
            f"https://financialmodelingprep.com/stable/earnings-surprises"
            f"?symbol={tk}&limit=4&apikey={FMP_KEY}", timeout=8)
        if r.status_code == 200 and r.json():
            quarters = []
            for e in r.json()[:4]:
                actual = e.get("actualEarningResult")
                estimated = e.get("estimatedEarning")
                if actual is not None and estimated is not None and estimated != 0:
                    surprise = round((actual - estimated) / abs(estimated) * 100, 1)
                    quarters.append({
                        "date": e.get("date", ""),
                        "actual": round(actual, 2),
                        "estimated": round(estimated, 2),
                        "surprise": surprise,
                        "beat": actual > estimated,
                    })
            result["earnings"]["history"] = quarters
            result["earnings"]["beats"] = sum(1 for q in quarters if q.get("beat"))
            result["earnings"]["total"] = len(quarters)
    except Exception:
        pass

    # Next earnings date
    try:
        t = datetime.now().strftime("%Y-%m-%d")
        t2 = (datetime.now() + timedelta(days=90)).strftime("%Y-%m-%d")
        r = requests.get(
            f"https://finnhub.io/api/v1/calendar/earnings?from={t}&to={t2}"
            f"&symbol={tk}&token={FINNHUB_KEY}", timeout=5)
        cal = r.json().get("earningsCalendar", [])
        if cal:
            result["earnings"]["next_date"] = cal[0].get("date")
    except Exception:
        pass

    # ── Analyst Ratings (FMP) ─────────────────────────────
    try:
        r = requests.get(
            f"https://financialmodelingprep.com/stable/analyst-stock-recommendations"
            f"?symbol={tk}&limit=1&apikey={FMP_KEY}", timeout=8)
        if r.status_code == 200 and r.json():
            a = r.json()[0]
            buy = (a.get("analystRatingsStrongBuy", 0) or 0) + (a.get("analystRatingsBuy", 0) or 0)
            hold = a.get("analystRatingsHold", 0) or 0
            sell = (a.get("analystRatingsSell", 0) or 0) + (a.get("analystRatingsStrongSell", 0) or 0)
            total = buy + hold + sell
            result["analysts"] = {
                "buy": buy,
                "hold": hold,
                "sell": sell,
                "total": total,
                "consensus": "BUY" if buy > hold + sell else "HOLD" if hold >= buy else "SELL",
            }
    except Exception:
        pass

    # Analyst price target
    try:
        r = requests.get(
            f"https://financialmodelingprep.com/stable/price-target-consensus"
            f"?symbol={tk}&apikey={FMP_KEY}", timeout=8)
        if r.status_code == 200 and r.json():
            pt = r.json()[0]
            result["analysts"]["target_high"] = pt.get("targetHigh")
            result["analysts"]["target_low"] = pt.get("targetLow")
            result["analysts"]["target_median"] = pt.get("targetMedian")
            result["analysts"]["target_consensus"] = pt.get("targetConsensus")
            # Upside/downside
            cur = result["price"].get("current")
            med = pt.get("targetMedian") or pt.get("targetConsensus")
            if cur and med:
                result["analysts"]["upside"] = round((med - cur) / cur * 100, 1)
    except Exception:
        pass

    # ── Insider Trades (FMP) ──────────────────────────────
    try:
        r = requests.get(
            f"https://financialmodelingprep.com/stable/insider-trading"
            f"?symbol={tk}&limit=10&apikey={FMP_KEY}", timeout=8)
        if r.status_code == 200:
            buys, sells = 0, 0
            recent = []
            for t in r.json():
                ttype = (t.get("transactionType") or "").lower()
                try:
                    td = datetime.strptime(t.get("transactionDate", "")[:10], "%Y-%m-%d")
                    if (datetime.now() - td).days > 90:
                        continue
                except Exception:
                    continue

                if "purchase" in ttype or "buy" in ttype:
                    buys += 1
                elif "sale" in ttype or "sell" in ttype:
                    sells += 1

                if len(recent) < 3:
                    recent.append({
                        "name": (t.get("reportingName") or "")[:25],
                        "type": "Buy" if ("purchase" in ttype or "buy" in ttype) else "Sell",
                        "shares": t.get("securitiesTransacted", 0),
                        "date": t.get("transactionDate", "")[:10],
                    })

            result["insiders"] = {
                "buys_90d": buys,
                "sells_90d": sells,
                "net": buys - sells,
                "signal": "BULLISH" if buys >= 3 else "POSITIVE" if buys > sells else "NEUTRAL" if buys == sells else "NEGATIVE",
                "recent": recent,
            }
    except Exception:
        pass

    # ── Valuation vs Sector (FMP) ─────────────────────────
    try:
        r = requests.get(
            f"https://financialmodelingprep.com/stable/ratios"
            f"?symbol={tk}&limit=5&apikey={FMP_KEY}", timeout=8)
        if r.status_code == 200 and r.json():
            ratios = r.json()
            current = ratios[0]
            pe_now = current.get("priceEarningsRatio")
            peg = current.get("priceEarningsToGrowthRatio")

            # 5yr average PE
            pe_list = [x.get("priceEarningsRatio") for x in ratios if x.get("priceEarningsRatio")]
            pe_5y_avg = round(sum(pe_list) / len(pe_list), 1) if pe_list else None

            result["valuation"] = {
                "pe": round(pe_now, 1) if pe_now else None,
                "pe_5y_avg": pe_5y_avg,
                "peg": round(peg, 2) if peg else None,
                "status": "UNDERVALUED" if pe_now and pe_5y_avg and pe_now < pe_5y_avg * 0.85 else
                         "OVERVALUED" if pe_now and pe_5y_avg and pe_now > pe_5y_avg * 1.15 else "FAIR VALUE",
            }
    except Exception:
        pass

    # ── Dividend ──────────────────────────────────────────
    try:
        r = requests.get(
            f"https://financialmodelingprep.com/stable/profile"
            f"?symbol={tk}&apikey={FMP_KEY}", timeout=5)
        if r.status_code == 200 and r.json():
            p = r.json()[0]
            div_yield = p.get("lastDiv", 0)
            price = result["price"].get("current") or 1
            result["dividend"] = {
                "annual": round(div_yield, 2) if div_yield else 0,
                "yield": round(div_yield / price * 100, 2) if div_yield and price else 0,
                "pays": bool(div_yield and div_yield > 0),
            }
    except Exception:
        pass

    # ── ATLAS Technical Score ─────────────────────────────
    try:
        sd = score(tk)
        if sd:
            result["atlas_score"] = {
                "tech_score": sd.get("tech_score", 0),
                "signal": sd.get("signal", ""),
                "tiers": sd.get("tiers", {}),
                "indicators": sd.get("indicators", {}),
                "reason": sd.get("reason", ""),
                "levels": sd.get("levels", {}),
                "chip": sd.get("chip", 0),
            }
    except Exception:
        pass

    # ── Overall Rating ────────────────────────────────────
    # Combine fundamentals + analyst + technical
    points = 0
    max_pts = 0

    # Analyst consensus
    if result["analysts"].get("consensus") == "BUY":
        points += 3
    elif result["analysts"].get("consensus") == "HOLD":
        points += 1
    max_pts += 3

    # Analyst upside
    up = result["analysts"].get("upside", 0)
    if up and up > 15:
        points += 2
    elif up and up > 5:
        points += 1
    max_pts += 2

    # Earnings beats
    beats = result["earnings"].get("beats", 0)
    total_q = result["earnings"].get("total", 0)
    if total_q > 0:
        if beats == total_q:
            points += 2
        elif beats >= total_q * 0.75:
            points += 1
    max_pts += 2

    # Revenue growth
    rg = result["financials"].get("revenue_growth")
    if rg and rg > 10:
        points += 2
    elif rg and rg > 0:
        points += 1
    max_pts += 2

    # Insider activity
    if result["insiders"].get("signal") in ["BULLISH", "POSITIVE"]:
        points += 1
    max_pts += 1

    # Valuation
    val_status = result["valuation"].get("status", "")
    if val_status == "UNDERVALUED":
        points += 2
    elif val_status == "FAIR VALUE":
        points += 1
    max_pts += 2

    # Technical
    ts = result.get("atlas_score", {}).get("tech_score", 0)
    if ts >= 75:
        points += 2
    elif ts >= 55:
        points += 1
    max_pts += 2

    confidence = round(points / max_pts * 100) if max_pts > 0 else 0

    if confidence >= 70:
        overall = "BUY"
    elif confidence >= 45:
        overall = "HOLD"
    else:
        overall = "SELL"

    result["rating"] = {
        "overall": overall,
        "confidence": confidence,
        "points": points,
        "max_points": max_pts,
    }

    # ── Price Outlook ─────────────────────────────────────
    cur = result["price"].get("current") or 0
    target_med = result["analysts"].get("target_median") or result["analysts"].get("target_consensus")
    rg_val = result["financials"].get("revenue_growth") or 0

    if cur > 0:
        # 1Y: analyst target or growth-based
        if target_med:
            outlook_1y = round(target_med, 2)
        else:
            outlook_1y = round(cur * (1 + rg_val / 100), 2) if rg_val else round(cur * 1.08, 2)

        # 5Y: compound growth estimate
        growth = max(rg_val, 5) if rg_val else 8  # assume at least 5% if growing
        outlook_5y = round(cur * (1 + growth / 100) ** 5, 2)

        result["outlook"] = {
            "price_1y": outlook_1y,
            "return_1y": round((outlook_1y - cur) / cur * 100, 1),
            "price_5y": outlook_5y,
            "return_5y": round((outlook_5y - cur) / cur * 100, 1),
            "basis": "analyst target" if target_med else "growth projection",
        }

    return result
