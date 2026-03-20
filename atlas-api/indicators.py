"""
ATLAS API — Technical Indicators
Calculates RSI, ADX, MFI, MA50, MA200, EMA21, pullback, range position, etc.
Extracted directly from atlas_dashboard.py calc_ind().
"""
import pandas as pd
import numpy as np


def calc_ind(df):
    """
    Calculate all technical indicators from OHLCV data.
    Input: DataFrame with Open, High, Low, Close, Volume columns.
    Returns: DataFrame with all indicator columns added.
    """
    d = df.copy()

    # Moving Averages
    d["MA50"]  = d["Close"].rolling(50).mean()
    d["MA200"] = d["Close"].rolling(200).mean()
    d["EMA21"] = d["Close"].ewm(span=21).mean()

    # RSI (14-period)
    delta = d["Close"].diff()
    gain  = delta.where(delta > 0, 0).rolling(14).mean()
    loss  = (-delta.where(delta < 0, 0)).rolling(14).mean()
    d["RSI"] = 100 - (100 / (1 + gain / loss))

    # Volume metrics
    d["VM20"] = d["Volume"].rolling(20).mean()
    d["VR"]   = d["Volume"] / d["VM20"]

    # Pullback from 20-day high
    d["H20"] = d["Close"].rolling(20).max()
    d["PB"]  = (d["H20"] - d["Close"]) / d["H20"] * 100

    # 6-month range position (R7 uses this)
    d["L6M"] = d["Low"].rolling(126).min()
    d["H6M"] = d["High"].rolling(126).max()
    d["R6M"] = (d["Close"] - d["L6M"]) / (d["H6M"] - d["L6M"]).replace(0, np.nan) * 100

    # 52-week range position
    d["R52"] = (d["Close"] - d["Low"].rolling(252).min()) / \
               (d["High"].rolling(252).max() - d["Low"].rolling(252).min()).replace(0, np.nan) * 100

    # 20-day return (relative strength)
    d["RET20"] = d["Close"].pct_change(20) * 100

    # MFI — Money Flow Index (14-period)
    tp     = (d["High"] + d["Low"] + d["Close"]) / 3
    rmf    = tp * d["Volume"]
    pos_mf = rmf.where(tp > tp.shift(1), 0).rolling(14).sum()
    neg_mf = rmf.where(tp < tp.shift(1), 0).rolling(14).sum()
    d["MFI"] = 100 - (100 / (1 + pos_mf / neg_mf.replace(0, np.nan)))

    # ADX — Average Directional Index (14-period)
    hl  = d["High"] - d["Low"]
    hc  = (d["High"] - d["Close"].shift()).abs()
    lc  = (d["Low"]  - d["Close"].shift()).abs()
    tr  = pd.concat([hl, hc, lc], axis=1).max(axis=1)
    at  = tr.rolling(14).mean()
    pdm = d["High"].diff().clip(lower=0)
    ndm = (-d["Low"].diff()).clip(lower=0)
    pi  = 100 * pdm.rolling(14).mean() / at
    ni  = 100 * ndm.rolling(14).mean() / at
    dx  = 100 * (pi - ni).abs() / (pi + ni).replace(0, np.nan)
    d["ADX"] = dx.rolling(14).mean()

    return d
