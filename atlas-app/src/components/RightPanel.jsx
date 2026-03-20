import React, { useState } from "react";
import { C, MO, SA, fmt } from "../theme";
import { Gauge, TierBars } from "./Shared";

export default function RightPanel({ signal }) {
  const [tab, setTab] = useState("plan");
  const [capital, setCapital] = useState(signal?.chip || 3000);

  if (!signal) return null;

  const levels = signal.levels || {};
  const entry = levels.entry || 0;
  const stop = levels.stop || 0;
  const t1 = levels.t1 || 0;
  const t2 = levels.t2 || 0;
  const t3 = levels.t3 || 0;

  const shares = entry > 0 ? Math.floor(capital / entry) : 0;
  const invested = shares * entry;
  const riskAmt = shares * (entry - stop);

  // Staged exit P&L
  const s1 = Math.floor(shares * 0.5);
  const s2 = Math.floor(shares * 0.3);
  const s3 = shares - s1 - s2;
  const profitT1 = s1 * (t1 - entry);
  const profitT2 = s2 * (t2 - entry);
  const profitT3 = s3 * (t3 - entry);
  const totalProfit = profitT1 + profitT2 + profitT3;
  const totalReturn = invested > 0 ? (totalProfit / invested * 100) : 0;
  const rr = riskAmt > 0 ? (totalProfit / riskAmt) : 0;
  const maxVal = Math.max(totalProfit, riskAmt, 1);

  const inputS = {
    width: "100%", background: C.sf, border: `1px solid ${C.b}`, borderRadius: 8,
    padding: "9px 12px", fontFamily: MO, fontSize: 13, fontWeight: 700,
    color: C.txt, outline: "none", textAlign: "right",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Tab toggle */}
      <div style={{ display: "flex", background: C.sf, borderRadius: 8, padding: 3, border: `1px solid ${C.b}` }}>
        {[{ id: "plan", l: "Trade Plan" }, { id: "calc", l: "Profit Calc" }].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: "7px 0", borderRadius: 6, border: "none", cursor: "pointer",
            background: tab === t.id ? C.card : "transparent",
            color: tab === t.id ? C.mint : C.ts,
            fontFamily: MO, fontSize: 10, fontWeight: 700, transition: "all 0.15s",
          }}>{t.l}</button>
        ))}
      </div>

      {/* ═══ TRADE PLAN ═══ */}
      {tab === "plan" && (
        <>
          <div style={{ background: C.card, border: `1px solid ${C.b}`, borderRadius: 14, padding: "18px" }}>
            {[{ l: "Entry Price", v: entry, c: C.txt }, { l: "Stop Loss −5%", v: stop, c: C.red }].map((row, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ fontFamily: MO, fontSize: 9, color: C.ts, marginBottom: 4 }}>{row.l}</div>
                <div style={{ background: C.sf, border: `1px solid ${C.b}`, borderRadius: 8, padding: "9px 12px", fontFamily: MO, fontSize: 13, fontWeight: 700, color: row.c }}>{fmt(row.v)}</div>
              </div>
            ))}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <div>
                <div style={{ fontFamily: MO, fontSize: 9, color: C.ts, marginBottom: 4 }}>Position</div>
                <div style={{ background: C.sf, border: `1px solid ${C.b}`, borderRadius: 8, padding: "9px 12px", fontFamily: MO, fontSize: 13, fontWeight: 700, color: C.mint }}>${(signal.chip || 0).toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontFamily: MO, fontSize: 9, color: C.ts, marginBottom: 4 }}>Shares</div>
                <div style={{ background: C.sf, border: `1px solid ${C.b}`, borderRadius: 8, padding: "9px 12px", fontFamily: MO, fontSize: 13, fontWeight: 700 }}>{entry > 0 ? Math.floor((signal.chip || 0) / entry) : 0}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 14 }}>
              {[{ l: "T1 +8%", v: t1, c: C.mint }, { l: "T2 +15%", v: t2, c: C.grn }, { l: "T3 +20%", v: t3, c: C.grn }].map((t, i) => (
                <div key={i} style={{ background: C.sf, border: `1px solid ${C.bL}`, borderRadius: 6, padding: "8px", textAlign: "center" }}>
                  <div style={{ fontFamily: MO, fontSize: 7, color: C.tm, letterSpacing: 1, marginBottom: 2 }}>{t.l}</div>
                  <div style={{ fontFamily: MO, fontSize: 12, fontWeight: 800, color: t.c }}>{fmt(t.v)}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "12px 0 0", borderTop: `1px solid ${C.b}` }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: MO, fontSize: 8, color: C.ts, letterSpacing: 1, marginBottom: 3 }}>RISK $</div>
                <div style={{ fontFamily: MO, fontSize: 16, fontWeight: 800, color: C.red }}>{fmt(riskAmt)}</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: MO, fontSize: 8, color: C.ts, letterSpacing: 1, marginBottom: 3 }}>R/R RATIO</div>
                <div style={{ fontFamily: MO, fontSize: 16, fontWeight: 800, color: C.mint }}>1:{rr.toFixed(1)}</div>
              </div>
            </div>
          </div>

          {/* Gauges */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ background: C.card, border: `1px solid ${C.b}`, borderRadius: 12, padding: "12px 8px", textAlign: "center" }}>
              <Gauge value={signal.tech_score || 0} size={90} label="Setup Quality" color={signal.tech_score >= 75 ? C.mint : C.ts} thickness={6} />
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.b}`, borderRadius: 12, padding: "12px 8px", textAlign: "center" }}>
              <Gauge value={signal.catalyst_base || 0} size={90} label="Conviction" color={(signal.catalyst_base || 0) >= 60 ? C.mint : C.tm} thickness={6} />
            </div>
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.b}`, borderRadius: 12, padding: "14px 16px" }}>
            <TierBars tiers={signal.tiers} />
          </div>
        </>
      )}

      {/* ═══ PROFIT CALCULATOR ═══ */}
      {tab === "calc" && (
        <>
          <div style={{ background: C.card, border: `1px solid ${C.b}`, borderRadius: 14, padding: "18px" }}>
            <div style={{ fontFamily: SA, fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Profit Calculator</div>
            <div style={{ fontFamily: MO, fontSize: 9, color: C.ts, marginBottom: 4 }}>Capital to Deploy</div>
            <input type="number" value={capital} onChange={(e) => setCapital(Math.max(0, Number(e.target.value)))} style={inputS}
              onFocus={(e) => { e.target.style.borderColor = C.mint; }}
              onBlur={(e) => { e.target.style.borderColor = C.b; }}
            />
            <input type="range" min={500} max={10000} step={100} value={capital}
              onChange={(e) => setCapital(Number(e.target.value))}
              style={{ width: "100%", marginTop: 8, accentColor: C.mint, height: 4, cursor: "pointer" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MO, fontSize: 8, color: C.tm, marginTop: 2 }}>
              <span>$500</span><span>$10,000</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 14 }}>
              {[{ l: "Shares", v: shares }, { l: "Invested", v: fmt(invested) }, { l: "Entry", v: fmt(entry) }].map((x, i) => (
                <div key={i} style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: MO, fontSize: 8, color: C.tm }}>{x.l}</div>
                  <div style={{ fontFamily: MO, fontSize: 15, fontWeight: 800 }}>{x.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Staged exit */}
          <div style={{ background: C.card, border: `1px solid ${C.b}`, borderRadius: 14, padding: "18px" }}>
            <div style={{ fontFamily: MO, fontSize: 9, fontWeight: 600, letterSpacing: 2, color: C.tm, textTransform: "uppercase", marginBottom: 12 }}>Staged Exit Plan</div>
            {[
              { l: "T1 +8%", pct: "Sell 50%", sh: s1, price: t1, profit: profitT1, c: C.mint },
              { l: "T2 +15%", pct: "Sell 30%", sh: s2, price: t2, profit: profitT2, c: C.grn },
              { l: "T3 +20%", pct: "Sell 20%", sh: s3, price: t3, profit: profitT3, c: C.grn },
            ].map((stage, i) => (
              <div key={i} style={{ background: C.sf, border: `1px solid ${C.bL}`, borderRadius: 8, padding: "10px 12px", marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: MO, fontSize: 10, fontWeight: 700, color: stage.c }}>{stage.l}</span>
                    <span style={{ fontFamily: MO, fontSize: 8, color: C.tm, background: C.bL, padding: "1px 6px", borderRadius: 3 }}>{stage.pct}</span>
                  </div>
                  <span style={{ fontFamily: MO, fontSize: 12, fontWeight: 800, color: stage.c }}>+{fmt(stage.profit)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MO, fontSize: 9, color: C.ts }}>
                  <span>{stage.sh} shares @ {fmt(stage.price)}</span>
                  <span>+{entry > 0 ? ((stage.price - entry) / entry * 100).toFixed(1) : 0}%</span>
                </div>
                <div style={{ height: 3, background: C.bL, borderRadius: 2, marginTop: 6, overflow: "hidden" }}>
                  <div style={{ height: 3, width: `${maxVal > 0 ? stage.profit / maxVal * 100 : 0}%`, background: stage.c, borderRadius: 2, transition: "width 0.4s" }} />
                </div>
              </div>
            ))}
          </div>

          {/* Risk vs Reward */}
          <div style={{ background: C.card, border: `1px solid ${C.b}`, borderRadius: 14, padding: "18px" }}>
            <div style={{ fontFamily: MO, fontSize: 9, fontWeight: 600, letterSpacing: 2, color: C.tm, textTransform: "uppercase", marginBottom: 12 }}>Risk vs Reward</div>
            <div style={{ display: "flex", height: 24, borderRadius: 6, overflow: "hidden", marginBottom: 12 }}>
              <div style={{ width: `${riskAmt / (riskAmt + totalProfit) * 100}%`, background: C.red + "44", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MO, fontSize: 9, fontWeight: 700, color: C.red, minWidth: 40 }}>
                {fmt(riskAmt)}
              </div>
              <div style={{ flex: 1, background: C.mint + "22", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MO, fontSize: 9, fontWeight: 700, color: C.mint }}>
                {fmt(totalProfit)}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ background: C.redD, border: `1px solid ${C.red}22`, borderRadius: 8, padding: "12px", textAlign: "center" }}>
                <div style={{ fontFamily: MO, fontSize: 8, color: C.red, letterSpacing: 1, marginBottom: 4 }}>MAX LOSS</div>
                <div style={{ fontFamily: MO, fontSize: 18, fontWeight: 800, color: C.red }}>-{fmt(riskAmt)}</div>
                <div style={{ fontFamily: MO, fontSize: 9, color: C.ts, marginTop: 2 }}>If stopped out</div>
              </div>
              <div style={{ background: C.mintD, border: `1px solid ${C.mint}22`, borderRadius: 8, padding: "12px", textAlign: "center" }}>
                <div style={{ fontFamily: MO, fontSize: 8, color: C.mint, letterSpacing: 1, marginBottom: 4 }}>TOTAL PROFIT</div>
                <div style={{ fontFamily: MO, fontSize: 18, fontWeight: 800, color: C.mint }}>+{fmt(totalProfit)}</div>
                <div style={{ fontFamily: MO, fontSize: 9, color: C.ts, marginTop: 2 }}>All targets hit</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 12, padding: "12px 0 0", borderTop: `1px solid ${C.b}` }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: MO, fontSize: 8, color: C.tm }}>RETURN</div>
                <div style={{ fontFamily: MO, fontSize: 15, fontWeight: 800, color: C.mint }}>+{totalReturn.toFixed(1)}%</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: MO, fontSize: 8, color: C.tm }}>R:R RATIO</div>
                <div style={{ fontFamily: MO, fontSize: 15, fontWeight: 800, color: rr >= 2 ? C.mint : C.warn }}>1:{rr.toFixed(1)}</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: MO, fontSize: 8, color: C.tm }}>BREAKEVEN</div>
                <div style={{ fontFamily: MO, fontSize: 15, fontWeight: 800 }}>{fmt(entry)}</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
