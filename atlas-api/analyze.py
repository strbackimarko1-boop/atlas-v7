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
            # BUG 4 FIX: mktCap is the correct field name in FMP profile
            mkt_cap = p.get("mktCap") or p.get("marketCap") or p.get("market_cap")
            result["profile"] = {
                "name": p.get("companyName", tk),
                "sector": p.get("sector", ""),
                "industry": p.get("industry", ""),
                "exchange": p.get("exchangeShortName", ""),
                "description": (p.get("description", "") or "")[:300],
                "market_cap": mkt_cap,
                "employees": p.get("fullTimeEmployees"),
                "country": p.get("country", ""),
                "website": p.get("website", ""),
                "image": p.get("image", ""),
            }
    except Exception:
        pass

    if not result["profile"].get("name"):
        result["profile"]["name"] = tk

    # ── Price & 52-Week Range ─────────────────────────────
    # BUG 1 FIX: Finnhub /quote h/l are DAILY high/low, not 52-week.
    # Use yfinance info for real 52-week high/low first, Finnhub for live price.
    h52, l52 = None, None

    # Get real 52-week range from yfinance
    try:
        yf_info = yf.Ticker(tk).info
        h52 = yf_info.get("fiftyTwoWeekHigh")
        l52 = yf_info.get("fiftyTwoWeekLow")
        # Also grab market cap fallback
        if not result["profile"].get("market_cap"):
            result["profile"]["market_cap"] = yf_info.get("marketCap")
    except Exception:
        pass

    # Live price from Finnhub
    try:
        r = requests.get(
            f"https://finnhub.io/api/v1/quote?symbol={tk}&token={FINNHUB_KEY}",
            timeout=5)
        if r.status_code == 200:
            d = r.json()
            c = d.get("c", 0)
            pc = d.get("pc", 0)
            result["price"] = {
                "current": round(c, 2) if c else None,
                "prev_close": round(pc, 2) if pc else None,
                "change": round(c - pc, 2) if c and pc else 0,
                "change_pct": round((c - pc) / pc * 100, 2) if c and pc and pc != 0 else 0,
                "high_52w": round(h52, 2) if h52 else None,
                "low_52w": round(l52, 2) if l52 else None,
            }
            if h52 and l52 and h52 != l52 and c:
                result["price"]["range_pct"] = round((c - l52) / (h52 - l52) * 100, 1)
    except Exception:
        pass

    # Fallback price from yfinance history
    if not result["price"].get("current"):
        try:
            hist = yf.Ticker(tk).history(period="5d")
            if hist is not None and len(hist) >= 2:
                c = float(hist["Close"].iloc[-1])
                pc = float(hist["Close"].iloc[-2])
                result["price"]["current"] = round(c, 2)
                result["price"]["change_pct"] = round((c - pc) / pc * 100, 2)
                result["price"]["high_52w"] = round(h52, 2) if h52 else None
                result["price"]["low_52w"] = round(l52, 2) if l52 else None
                if h52 and l52 and h52 != l52:
                    result["price"]["range_pct"] = round((c - l52) / (h52 - l52) * 100, 1)
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

    # ── Earnings History ──────────────────────────────────
    # BUG 2 FIX: Try FMP first, fall back to Finnhub if empty
    quarters = []
    try:
        r = requests.get(
            f"https://financialmodelingprep.com/stable/earnings-surprises"
            f"?symbol={tk}&limit=4&apikey={FMP_KEY}", timeout=8)
        if r.status_code == 200 and r.json():
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
    except Exception:
        pass

    # Finnhub fallback if FMP returned nothing
    if not quarters:
        try:
            r = requests.get(
                f"https://finnhub.io/api/v1/stock/earnings?symbol={tk}&limit=4&token={FINNHUB_KEY}",
                timeout=5)
            if r.status_code == 200 and r.json():
                for e in r.json()[:4]:
                    actual = e.get("actual")
                    estimated = e.get("estimate")
                    if actual is not None and estimated is not None and estimated != 0:
                        surprise = round((actual - estimated) / abs(estimated) * 100, 1)
                        quarters.append({
                            "date": e.get("period", ""),
                            "actual": round(actual, 2),
                            "estimated": round(estimated, 2),
                            "surprise": surprise,
                            "beat": actual > estimated,
                        })
        except Exception:
            pass

    if quarters:
        result["earnings"]["history"] = quarters
        result["earnings"]["beats"] = sum(1 for q in quarters if q.get("beat"))
        result["earnings"]["total"] = len(quarters)

    # Next earnings date
    try:
        t_now = datetime.now().strftime("%Y-%m-%d")
        t2 = (datetime.now() + timedelta(days=90)).strftime("%Y-%m-%d")
        r = requests.get(
            f"https://finnhub.io/api/v1/calendar/earnings?from={t_now}&to={t2}"
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
            for trade in r.json():
                ttype = (trade.get("transactionType") or "").lower()
                try:
                    td = datetime.strptime(trade.get("transactionDate", "")[:10], "%Y-%m-%d")
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
                        "name": (trade.get("reportingName") or "")[:25],
                        "type": "Buy" if ("purchase" in ttype or "buy" in ttype) else "Sell",
                        "shares": trade.get("securitiesTransacted", 0),
                        "date": trade.get("transactionDate", "")[:10],
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

    # ── Valuation (FMP ratios) ────────────────────────────
    # BUG 3 FIX: Fall back to financials.pe if ratios endpoint returns nothing
    try:
        r = requests.get(
            f"https://financialmodelingprep.com/stable/ratios"
            f"?symbol={tk}&limit=5&apikey={FMP_KEY}", timeout=8)
        if r.status_code == 200 and r.json():
            ratios = r.json()
            current = ratios[0]
            pe_now = current.get("priceEarningsRatio")
            peg = current.get("priceEarningsToGrowthRatio")
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

    # BUG 3 FIX continued: if valuation.pe is still None, use financials.pe as fallback
    if not result["valuation"].get("pe") and result["financials"].get("pe"):
        result["valuation"]["pe"] = result["financials"]["pe"]
        # Can't calculate 5y avg without ratios history, but at least show current PE
        if not result["valuation"].get("status"):
            result["valuation"]["status"] = "FAIR VALUE"

    # ── Dividend ──────────────────────────────────────────
    try:
        r = requests.get(
            f"https://financialmodelingprep.com/stable/profile"
            f"?symbol={tk}&apikey={FMP_KEY}", timeout=5)
        if r.status_code == 200 and r.json():
            p = r.json()[0]
            div_yield = p.get("lastDiv", 0)
            cur_price = result["price"].get("current") or 1
            result["dividend"] = {
                "annual": round(div_yield, 2) if div_yield else 0,
                "yield": round(div_yield / cur_price * 100, 2) if div_yield and cur_price else 0,
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
    # BUG 5 FIX: Fundamentals-heavy weighting. Technical is max 15%.
    # Revenue growth + analyst consensus + earnings beats dominate.
    points = 0
    max_pts = 0

    # Analyst consensus (weight: 3)
    if result["analysts"].get("consensus") == "BUY":
        points += 3
    elif result["analysts"].get("consensus") == "HOLD":
        points += 1
    max_pts += 3

    # Analyst upside (weight: 3)
    up = result["analysts"].get("upside", 0) or 0
    if up > 20:
        points += 3
    elif up > 10:
        points += 2
    elif up > 0:
        points += 1
    max_pts += 3

    # Revenue growth (weight: 3) — most important fundamental
    rg = result["financials"].get("revenue_growth") or 0
    if rg > 20:
        points += 3
    elif rg > 10:
        points += 2
    elif rg > 0:
        points += 1
    max_pts += 3

    # EPS growth (weight: 2)
    eg = result["financials"].get("eps_growth") or 0
    if eg > 20:
        points += 2
    elif eg > 0:
        points += 1
    max_pts += 2

    # Profit margin (weight: 2)
    pm = result["financials"].get("profit_margin") or 0
    if pm > 20:
        points += 2
    elif pm > 5:
        points += 1
    max_pts += 2

    # Earnings beats (weight: 2)
    beats = result["earnings"].get("beats", 0)
    total_q = result["earnings"].get("total", 0)
    if total_q > 0:
        beat_rate = beats / total_q
        if beat_rate == 1.0:
            points += 2
        elif beat_rate >= 0.75:
            points += 1
    max_pts += 2

    # Insider activity (weight: 1)
    if result["insiders"].get("signal") in ["BULLISH", "POSITIVE"]:
        points += 1
    max_pts += 1

    # Valuation (weight: 2)
    val_status = result["valuation"].get("status", "")
    if val_status == "UNDERVALUED":
        points += 2
    elif val_status == "FAIR VALUE":
        points += 1
    max_pts += 2

    # Technical score — capped at 15% of total weight (BUG 5 FIX)
    # max_pts will be 20 at this point, so technical max = ~3 pts (15%)
    ts = (result.get("atlas_score") or {}).get("tech_score", 0)
    if ts >= 75:
        points += 2
    elif ts >= 50:
        points += 1
    max_pts += 2  # technical is ~10% of total (2 out of ~22)

    confidence = round(points / max_pts * 100) if max_pts > 0 else 0

    if confidence >= 65:
        overall = "BUY"
    elif confidence >= 40:
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
    # BUG 6 FIX: Cap growth rate for 5Y projection — nobody grows 65% for 5 years.
    # Use min(revenue_growth, 20%) for 5Y compound, with further dampening.
    cur = result["price"].get("current") or 0
    target_med = result["analysts"].get("target_median") or result["analysts"].get("target_consensus")
    rg_val = result["financials"].get("revenue_growth") or 0

    if cur > 0:
        # 1Y: analyst target is most reliable, else growth-based
        if target_med:
            outlook_1y = round(target_med, 2)
        else:
            # Use a conservative fraction of revenue growth for price
            growth_1y = min(rg_val * 0.5, 30) if rg_val > 0 else 8
            outlook_1y = round(cur * (1 + growth_1y / 100), 2)

        # BUG 6 FIX: 5Y growth capped at 20% per year max, dampened further
        # High growers revert to mean — use sqrt dampening
        raw_growth = rg_val if rg_val else 8
        if raw_growth > 0:
            # Cap at 20%, then dampen: high growers get less credit
            capped = min(raw_growth, 20)
            # Apply mean reversion: assume growth slows each year
            # Year 1: capped, Year 2-5: capped * 0.8, 0.7, 0.6, 0.5
            price_5y = cur
            annual_rates = [capped, capped * 0.8, capped * 0.7, capped * 0.6, capped * 0.5]
            for rate in annual_rates:
                price_5y *= (1 + rate / 100)
            outlook_5y = round(price_5y, 2)
        else:
            # Negative growth: conservative -5% per year
            outlook_5y = round(cur * (1 + max(raw_growth, -5) / 100) ** 5, 2)

        result["outlook"] = {
            "price_1y": outlook_1y,
            "return_1y": round((outlook_1y - cur) / cur * 100, 1),
            "price_5y": outlook_5y,
            "return_5y": round((outlook_5y - cur) / cur * 100, 1),
            "basis": "analyst target" if target_med else "growth projection",
        }

    return result
