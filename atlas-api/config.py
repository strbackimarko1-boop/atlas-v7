"""
ATLAS API — Configuration v8
Polygon.io is primary data source for all market data.
FMP, Finnhub, CoinGecko, FRED are fallbacks only.
"""
import os

# ─── API Keys ─────────────────────────────────────────────────
POLYGON_KEY = os.getenv("POLYGON_KEY", "m4h90v6dFUxqjpd1z7KztVzJANq_Eski")
FINNHUB_KEY = os.getenv("FINNHUB_KEY", "d6tgr7pr01qhkb445g1gd6tgr7pr01qhkb445g20")
FRED_KEY    = os.getenv("FRED_KEY",    "7d1b5352c6e41bf1b8158883ab8c4c4c")
FMP_KEY     = os.getenv("FMP_KEY",     "eO61giAPPLknf1wXCKKokyHy6zPqykks")

# ─── Polygon Base URL ─────────────────────────────────────────
POLYGON_BASE = "https://api.polygon.io"

# ─── Scoring Constants ────────────────────────────────────────
VIX_OK       = 20
VIX_MAX      = 25
RSI_LO       = 40
RSI_HI       = 65
EVENT_DAYS   = 5
SESSION_TTL  = 6  # hours

# ─── Chip Sizing ──────────────────────────────────────────────
CHIP_MIN = 2000
CHIP_MAX = 4000

def get_chip(catalyst_score):
    """Catalyst-driven position sizing."""
    if catalyst_score >= 80: return 4000
    if catalyst_score >= 60: return 3500
    if catalyst_score >= 40: return 3000
    if catalyst_score >= 20: return 2500
    return 2000

# ─── Scan Universes ───────────────────────────────────────────
STOCKS_UNIVERSE = [
    "AAPL","MSFT","NVDA","GOOGL","AMZN","META","TSLA","AVGO","JPM","V",
    "MA","UNH","XOM","LLY","JNJ","PG","HD","MRK","ABBV","COST",
    "AMD","CRM","CVX","BAC","NFLX","KO","PEP","TMO","ORCL","ACN",
    "MCD","CSCO","WFC","ABT","TXN","HON","NEE","INTU","AMGN","CAT",
    "SPGI","ISRG","GS","NOW","LOW","BKNG","VRTX","SYK","C","PANW",
    "COIN","PLTR","BBAI","DELL","ANET","UBER","SNOW","CRWD","ZM","SHOP",
]

CRYPTO_UNIVERSE = [
    "IBIT","FBTC","GBTC",
    "EETH","ETHW",
    "VSOL","SOLZ",
    "BTC-USD","ETH-USD","SOL-USD","XRP-USD",
]

# Polygon crypto tickers use X: prefix format
CRYPTO_POLYGON_MAP = {
    "BTC-USD": "X:BTCUSD",
    "ETH-USD": "X:ETHUSD",
    "SOL-USD": "X:SOLUSD",
    "XRP-USD": "X:XRPUSD",
}

LVRG_UNIVERSE = [
    "SOXL","TQQQ","UPRO","SPXL","LABU","FNGU","TECL","NVDL","AAPU",
    "AAPL","MSFT","GOOGL","NVDA","META","AMZN","TSLA",
    "IBIT","EETH","VSOL",
]

CORE_FOUR = {
    "bitcoin":  {"sym": "BTC", "poly": "X:BTCUSD", "thesis": "Store of value · Macro hedge · Institutional anchor"},
    "ethereum": {"sym": "ETH", "poly": "X:ETHUSD", "thesis": "Smart contract layer · Upgrade cycle ongoing"},
    "solana":   {"sym": "SOL", "poly": "X:SOLUSD", "thesis": "High-performance L1 · Ecosystem momentum"},
    "ripple":   {"sym": "XRP", "poly": "X:XRPUSD", "thesis": "Payments network · Regulatory clarity"},
}

# ─── Cache TTLs (seconds) ────────────────────────────────────
# Tightened for real-time Polygon data — no reason for 6h stale scores
CACHE_TTL = {
    "gate":      120,      # 2 min  (was 5 min)
    "pulse":     120,      # 2 min  (was 5 min)
    "scan":      900,      # 15 min (was 6 HOURS — this was the stale price killer)
    "score":     900,      # 15 min (was 6 HOURS)
    "chart":     120,      # 2 min  (was 5 min)
    "catalyst":  86400,    # 24 hours (fine — fundamentals don't change intraday)
    "news":      300,      # 5 min  (was 10 min)
    "earnings":  21600,    # 6 hours (fine — earnings dates don't change hourly)
    "overview":  120,      # 2 min  (was 5 min)
    "snapshot":  60,       # 1 min  — NEW: real-time snapshot cache
    "reference": 86400,    # 24 hours — NEW: company names, details, etc.
    "shorts":    3600,     # 1 hour — NEW: short interest
    "analysts":  3600,     # 1 hour — NEW: analyst ratings
    "financials": 86400,   # 24 hours — NEW: company financials
    "dividends": 86400,    # 24 hours — NEW: dividend data
    "market_status": 60,   # 1 min — NEW: market open/closed
    "treasury":  300,      # 5 min — NEW: treasury yields from Polygon
}
