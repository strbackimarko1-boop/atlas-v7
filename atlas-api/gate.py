"""
ATLAS API — Macro Gate
4 checks that control whether trading is allowed.
"""
from config import VIX_OK, VIX_MAX


def macro_gate(sp, vix):
    """
    Compute macro gate status.

    4/4 → GO      — full signals, full chip sizes
    3/4 → CAUTION — valid signals, half chip sizes
    2/4 → WARN    — monitor only, no new entries
    0-1 → STOP    — stand down completely

    Args:
        sp: S&P 500 close series (pandas Series)
        vix: current VIX level (float)

    Returns:
        dict with checks, count, status, message, chip_modifier
    """
    checks = {}

    checks["sp_200ma"] = bool(
        sp is not None and len(sp) > 200 and
        float(sp.iloc[-1]) > float(sp.rolling(200).mean().iloc[-1])
    )
    checks["sp_50ma"] = bool(
        sp is not None and len(sp) > 50 and
        float(sp.iloc[-1]) > float(sp.rolling(50).mean().iloc[-1])
    )
    checks["vix_20"] = bool(vix and vix < VIX_OK)
    checks["vix_25"] = bool(vix and vix < VIX_MAX)

    n = sum(checks.values())

    if n == 4:
        status, msg, chip_mod = "GO", "Full Green Light — all signals active", 1.0
    elif n >= 3:
        status, msg, chip_mod = "CAUTION", "Half Size Only — mixed signals", 0.5
    elif n >= 2:
        status, msg, chip_mod = "WARN", "Monitor Only — no new entries", 0.0
    else:
        status, msg, chip_mod = "STOP", "No Trading Today — stand down completely", 0.0

    return {
        "status": status,
        "checks": checks,
        "count": n,
        "total": 4,
        "message": msg,
        "chip_modifier": chip_mod,
    }
