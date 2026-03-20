import React from "react";
import { C, MO, pctF, dColor } from "../theme";

export default function TopBar({ gate, pulse, market }) {
  const gateStatus = gate?.status || "—";
  const gateCount = gate?.count || 0;
  const gateColor = { GO: C.grn, CAUTION: C.warn, WARN: C.warn, STOP: C.red }[gateStatus] || C.tm;

  const checks = gate?.checks || {};

  const metrics = [];
  if (pulse?.sp500?.price) metrics.push({ l: "S&P", v: pulse.sp500.price.toLocaleString(), d: pulse.sp500.change });
  if (pulse?.vix?.value) metrics.push({ l: "VIX", v: pulse.vix.value, d: null, inv: true });
  if (pulse?.fear_greed?.score != null) metrics.push({ l: "F&G", v: pulse.fear_greed.score, tag: pulse.fear_greed.label, tagC: pulse.fear_greed.score < 25 ? C.red : C.ts });
  if (pulse?.btc_dominance) metrics.push({ l: "BTC Dom", v: pulse.btc_dominance + "%" });

  return (
    <div style={{
      background: C.sf, borderBottom: `1px solid ${C.b}`,
      padding: "0 24px", height: 48, display: "flex", alignItems: "center",
      justifyContent: "space-between", flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* Gate badge */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: gateColor + "12", padding: "4px 12px",
          borderRadius: 6, border: `1px solid ${gateColor}22`,
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%", background: gateColor,
            animation: "pulse 2s infinite",
          }} />
          <span style={{ fontFamily: MO, fontSize: 10, fontWeight: 700, color: gateColor }}>
            GATE: {gateStatus}
          </span>
        </div>

        <div style={{ height: 18, width: 1, background: C.b }} />

        {/* Gate checks */}
        {Object.entries(checks).map(([k, v], i) => {
          const labels = {
            sp_200ma: "S&P>200MA", sp_50ma: "S&P>50MA",
            vix_20: "VIX<20", vix_25: "VIX<25",
          };
          return (
            <span key={i} style={{
              fontFamily: MO, fontSize: 9, padding: "2px 7px", borderRadius: 3,
              background: v ? C.grnD : C.redD, color: v ? C.grn : C.red, fontWeight: 500,
            }}>
              {v ? "✓" : "✗"} {labels[k] || k}
            </span>
          );
        })}

        <div style={{ height: 18, width: 1, background: C.b }} />

        {/* Market data */}
        {metrics.map((m, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: MO, fontSize: 10 }}>
            <span style={{ color: C.tm }}>{m.l}</span>
            <span style={{ fontWeight: 700 }}>{m.v}</span>
            {m.d != null && (
              <span style={{ fontSize: 9, fontWeight: 600, color: dColor(m.d, m.inv) }}>
                {pctF(m.d)}
              </span>
            )}
            {m.tag && (
              <span style={{
                fontSize: 8, color: m.tagC, fontWeight: 700,
                background: (m.tagC || C.ts) + "15", padding: "1px 5px", borderRadius: 3,
              }}>{m.tag}</span>
            )}
          </div>
        ))}
      </div>

      {/* Right side: market status + time */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{
            width: 5, height: 5, borderRadius: "50%",
            background: market?.is_open ? C.grn : C.tm,
            animation: market?.is_open ? "pulse 2s infinite" : "none",
          }} />
          <span style={{ fontFamily: MO, fontSize: 9, color: market?.is_open ? C.grn : C.tm }}>
            {market?.is_open ? "Market Open" : "Closed"}
          </span>
        </div>
        <span style={{ fontFamily: MO, fontSize: 9, color: C.ts }}>
          {market?.time_et || ""} · {market?.date || ""}
        </span>
      </div>
    </div>
  );
}
