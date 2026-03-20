"""
ATLAS API — Configuration
API keys, constants, scan universes, chip sizing
"""
import os

# ─── API Keys ─────────────────────────────────────────────────
# In production, load from environment variables
FINNHUB_KEY = os.getenv("FINNHUB_KEY", "d6tgr7pr01qhkb445g1gd6tgr7pr01qhkb445g20")
FRED_KEY    = os.getenv("FRED_KEY",    "7d1b5352c6e41bf1b8158883ab8c4c4c")
POLYGON_KEY = os.getenv("POLYGON_KEY", "m4h90v6dFUxqjpd1z7KztVzJANq_Eski")
FMP_KEY     = os.getenv("FMP_KEY",     "eO61giAPPLknf1wXCKKokyHy6zPqykks")

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

LVRG_UNIVERSE = [
    "SOXL","TQQQ","UPRO","SPXL","LABU","FNGU","TECL","NVDL","AAPU",
    "AAPL","MSFT","GOOGL","NVDA","META","AMZN","TSLA",
    "IBIT","EETH","VSOL",
]

CORE_FOUR = {
    "bitcoin":  {"sym": "BTC", "thesis": "Store of value · Macro hedge · Institutional anchor"},
    "ethereum": {"sym": "ETH", "thesis": "Smart contract layer · Upgrade cycle ongoing"},
    "solana":   {"sym": "SOL", "thesis": "High-performance L1 · Ecosystem momentum"},
    "ripple":   {"sym": "XRP", "thesis": "Payments network · Regulatory clarity"},
}

# ─── Cache TTLs (seconds) ────────────────────────────────────
CACHE_TTL = {
    "gate":      300,      # 5 min
    "pulse":     300,      # 5 min
    "scan":      21600,    # 6 hours
    "score":     21600,    # 6 hours
    "chart":     300,      # 5 min
    "catalyst":  86400,    # 24 hours
    "news":      600,      # 10 min
    "earnings":  21600,    # 6 hours
    "overview":  300,      # 5 min
}
