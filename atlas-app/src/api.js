/**
 * ATLAS API Client
 * Fetches data from the FastAPI backend.
 * 
 * In development: Vite proxies /api to localhost:8000
 * In production: Set API_BASE to your server URL
 */

const API_BASE = import.meta.env.VITE_API_URL || "";

async function fetchJSON(path) {
  try {
    const res = await fetch(API_BASE + path);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.error(`ATLAS API error [${path}]:`, err);
    return null;
  }
}

/** Macro gate: GO / CAUTION / WARN / STOP */
export const getGate = () => fetchJSON("/api/gate");

/** Market pulse: S&P, VIX, F&G, Fed, 10Y, BTC dom */
export const getPulse = () => fetchJSON("/api/pulse");

/** Scan a universe: "stocks" | "crypto" | "leveraged" */
export const getScan = (mode) => fetchJSON(`/api/scan/${mode}`);

/** Full score for a single ticker */
export const getScore = (ticker) => fetchJSON(`/api/score/${ticker}`);

/** OHLCV + indicators for charting */
export const getChart = (ticker, period = "6mo") =>
  fetchJSON(`/api/chart/${ticker}?period=${period}`);

/** Catalyst data (FMP + OpenInsider) */
export const getCatalyst = (ticker) => fetchJSON(`/api/catalyst/${ticker}`);

/** Macro news with sentiment */
export const getNews = () => fetchJSON("/api/news");

/** Upcoming earnings this week */
export const getEarnings = () => fetchJSON("/api/earnings");

/** Crypto Core Four + indexes + BTC dom */
export const getOverview = () => fetchJSON("/api/overview");

/** Cache stats */
export const getCacheStats = () => fetchJSON("/api/cache/stats");

/** Clear cache */
export const clearCache = () =>
  fetch(API_BASE + "/api/cache/clear", { method: "POST" }).then((r) => r.json());

/**
 * Load all initial data in parallel.
 * Called on app mount and every 5 minutes.
 */
export async function loadDashboard() {
  const [gate, pulse, overview, news, earnings] = await Promise.all([
    getGate(),
    getPulse(),
    getOverview(),
    getNews(),
    getEarnings(),
  ]);
  return { gate, pulse, overview, news, earnings };
}
