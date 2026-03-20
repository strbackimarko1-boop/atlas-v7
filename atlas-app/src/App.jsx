import React, { useState, useEffect, useCallback } from "react";
import { C, MO } from "./theme";
import { loadDashboard, getScan } from "./api";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import HeroSignal from "./components/HeroSignal";
import RightPanel from "./components/RightPanel";
import BottomGrid from "./components/BottomGrid";

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

export default function App() {
  // ── State ──────────────────────────────────────────────────
  const [page, setPage] = useState("radar");
  const [scan, setScan] = useState("STOCKS");
  const [selIdx, setSelIdx] = useState(0);
  const [period, setPeriod] = useState("6mo");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Data
  const [gate, setGate] = useState(null);
  const [pulse, setPulse] = useState(null);
  const [overview, setOverview] = useState(null);
  const [news, setNews] = useState(null);
  const [earnings, setEarnings] = useState(null);
  const [scanResults, setScanResults] = useState(null);

  // ── Load dashboard data ────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const data = await loadDashboard();
      if (data.gate) setGate(data.gate);
      if (data.pulse) setPulse(data.pulse);
      if (data.overview) setOverview(data.overview);
      if (data.news?.news) setNews(data.news.news);
      if (data.earnings?.earnings) setEarnings(data.earnings.earnings);
      setError(null);
    } catch (err) {
      setError("Failed to load market data");
      console.error(err);
    }
  }, []);

  // ── Run scan ───────────────────────────────────────────────
  const runScan = useCallback(async (mode) => {
    setLoading(true);
    setSelIdx(0);
    try {
      const data = await getScan(mode.toLowerCase());
      if (data) {
        setScanResults(data);
        setError(null);
      } else {
        setError("Scan returned no data");
      }
    } catch (err) {
      setError("Scan failed");
      console.error(err);
    }
    setLoading(false);
  }, []);

  // ── Initial load ───────────────────────────────────────────
  useEffect(() => {
    loadData();
    runScan(scan);
    const interval = setInterval(loadData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  // ── Re-scan when universe changes ──────────────────────────
  useEffect(() => {
    runScan(scan);
  }, [scan]);

  const signals = scanResults?.results || [];
  const hero = signals[selIdx] || null;
  const market = gate?.market || pulse?.market || {};

  return (
    <div style={{ display: "flex", height: "100vh", background: C.bg, color: C.txt, fontFamily: "'DM Sans',system-ui,sans-serif", overflow: "hidden" }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
      `}</style>

      {/* Sidebar */}
      <Sidebar
        page={page} setPage={setPage}
        scan={scan} setScan={setScan}
        scanCount={{ scanned: scanResults?.scanned || 0, found: scanResults?.found || 0 }}
      />

      {/* Main area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        <TopBar gate={gate} pulse={pulse} market={market} />

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>

          {/* Error banner */}
          {error && (
            <div style={{
              background: C.redD, border: `1px solid ${C.red}22`, borderRadius: 8,
              padding: "10px 16px", marginBottom: 16, fontFamily: MO, fontSize: 11, color: C.red,
            }}>
              {error} — data may be stale. Retrying...
            </div>
          )}

          {/* ═══ RADAR PAGE ═══ */}
          {page === "radar" && (
            <div style={{ animation: "fadeIn 0.3s ease" }}>
              {loading && signals.length === 0 ? (
                <div style={{ textAlign: "center", padding: "80px 40px" }}>
                  <div style={{ fontSize: 36, color: C.mint, opacity: 0.3, marginBottom: 16, animation: "spin 2s linear infinite", display: "inline-block" }}>◈</div>
                  <div style={{ fontFamily: MO, fontSize: 12, color: C.ts }}>Scanning {scan.toLowerCase()}...</div>
                </div>
              ) : hero ? (
                <>
                  {/* Main: Chart + Trade Plan */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, marginBottom: 16 }}>
                    <HeroSignal signal={hero} period={period} setPeriod={setPeriod} />
                    <RightPanel signal={hero} />
                  </div>

                  {/* Bottom grid */}
                  <BottomGrid
                    signals={signals}
                    selectedIdx={selIdx}
                    onSelect={setSelIdx}
                    earnings={earnings}
                    overview={overview}
                    news={news}
                  />
                </>
              ) : (
                <div style={{ textAlign: "center", padding: "80px 40px", background: C.card, borderRadius: 14, border: `1px solid ${C.b}` }}>
                  <div style={{ fontSize: 36, color: C.mint, opacity: 0.3, marginBottom: 16 }}>◆</div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>No setups found</div>
                  <div style={{ fontSize: 12, color: C.tm }}>
                    Market conditions may be unfavorable. Try a different universe or check back later.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ CHARTS PAGE ═══ */}
          {page === "charts" && (
            <div style={{ animation: "fadeIn 0.3s ease" }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                <input placeholder="Search ticker... NVDA, AAPL, BTC-USD" style={{
                  flex: 1, maxWidth: 400, padding: "10px 14px", borderRadius: 8,
                  background: C.card, border: `1px solid ${C.b}`, color: C.txt,
                  fontFamily: MO, fontSize: 12, outline: "none",
                }}
                  onFocus={(e) => { e.target.style.borderColor = C.mint; }}
                  onBlur={(e) => { e.target.style.borderColor = C.b; }}
                />
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.b}`, borderRadius: 14, padding: "60px 40px", textAlign: "center" }}>
                <div style={{ fontSize: 36, color: C.mint, opacity: 0.3, marginBottom: 12 }}>◻</div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Chart Station</div>
                <div style={{ fontSize: 12, color: C.tm }}>Enter any ticker for candlestick chart + RSI + full ATLAS score</div>
                <div style={{ fontSize: 11, color: C.ts, marginTop: 12, fontFamily: MO }}>Coming in Phase 3 — full charting with lightweight-charts</div>
              </div>
            </div>
          )}

          {/* ═══ GUIDE PAGE ═══ */}
          {page === "guide" && (
            <div style={{ animation: "fadeIn 0.3s ease" }}>
              <div style={{ background: C.card, border: `1px solid ${C.b}`, borderRadius: 14, padding: "24px 28px", marginBottom: 20 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.mint, marginBottom: 10 }}>What is ATLAS?</div>
                <div style={{ fontSize: 13, color: C.ts, lineHeight: 1.9 }}>
                  A two-engine trading system. <b style={{ color: C.txt }}>Setup Quality</b> (10 rules, 4 tiers) decides if conditions are right.
                  <b style={{ color: C.txt }}> Conviction Score</b> decides how much to bet. Both must align for a Strong Buy.
                </div>
              </div>
              <div style={{ fontFamily: MO, fontSize: 9, fontWeight: 600, letterSpacing: 2, color: C.tm, textTransform: "uppercase", marginBottom: 10 }}>Signal Reference</div>
              {[
                { s: "STRONG BUY", d: "Both engines aligned. Maximum conviction. Full position size." },
                { s: "BUY", d: "Good setup with moderate conviction. Standard position." },
                { s: "FORMING", d: "Setup building. Tech 55-74%. Re-scan in 1-2 days." },
                { s: "SKIP", d: "Hard rules failed. Do not trade regardless of anything else." },
              ].map((x, i) => (
                <div key={i} style={{ background: C.card, border: `1px solid ${C.b}`, borderRadius: 8, padding: "12px 18px", marginBottom: 6, display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ minWidth: 130 }}>
                    <span style={{
                      display: "inline-block", padding: "3px 10px", borderRadius: 5,
                      fontFamily: MO, fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
                      background: x.s === "STRONG BUY" ? C.mint : x.s === "BUY" ? C.mintD : x.s === "SKIP" ? C.redD : "rgba(255,255,255,0.03)",
                      color: x.s === "STRONG BUY" ? "#000" : x.s === "BUY" ? C.mint : x.s === "SKIP" ? C.red : C.ts,
                    }}>{x.s}</span>
                  </div>
                  <span style={{ fontSize: 12, color: C.ts }}>{x.d}</span>
                </div>
              ))}
            </div>
          )}

          {/* ═══ SETTINGS PAGE ═══ */}
          {page === "settings" && (
            <div style={{ animation: "fadeIn 0.3s ease", textAlign: "center", padding: "60px 40px" }}>
              <div style={{ fontSize: 36, color: C.mint, opacity: 0.3, marginBottom: 12 }}>⚙</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Settings</div>
              <div style={{ fontSize: 12, color: C.tm }}>API keys, scan preferences, notification settings</div>
              <div style={{ fontSize: 11, color: C.ts, marginTop: 12, fontFamily: MO }}>Coming in Phase 4</div>
            </div>
          )}

          {/* Footer */}
          <div style={{ marginTop: 32, textAlign: "center", fontFamily: MO, fontSize: 8, color: C.tm, letterSpacing: 3 }}>
            ATLAS v7 · 14-RULE ENGINE · NOT FINANCIAL ADVICE
          </div>
        </div>
      </div>
    </div>
  );
}
