import React from "react";
import { C, MO, SA, fmt, pctF, dColor } from "../theme";
import { Pill } from "./Shared";

export default function BottomGrid({ signals, selectedIdx, onSelect, earnings, overview, news }) {
  const others = (signals || []).filter((_, i) => i !== selectedIdx);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>

      {/* Card 1: Other Setups */}
      <div style={{ background: C.card, border: `1px solid ${C.b}`, borderRadius: 12, padding: "16px" }}>
        <div style={{ fontFamily: SA, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Other Setups</div>
        {others.length === 0 && (
          <div style={{ fontFamily: MO, fontSize: 10, color: C.tm }}>No other setups found</div>
        )}
        {others.map((r, idx) => (
          <div key={idx} onClick={() => onSelect(signals.indexOf(r))} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 0", borderBottom: idx < others.length - 1 ? `1px solid ${C.bL}` : "none",
            cursor: "pointer", transition: "opacity 0.15s",
          }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.7"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: MO, fontSize: 12, fontWeight: 800 }}>{r.ticker}</span>
              <Pill sig={r.signal} />
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: MO, fontSize: 11, fontWeight: 700 }}>{fmt(r.price)}</div>
              <div style={{ fontFamily: MO, fontSize: 9, color: dColor(r.change || 0) }}>{pctF(r.change || 0)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Card 2: Earnings */}
      <div style={{ background: C.card, border: `1px solid ${C.b}`, borderRadius: 12, padding: "16px" }}>
        <div style={{ fontFamily: SA, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Earnings This Week</div>
        {(earnings || []).slice(0, 5).map((e, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 0", borderBottom: i < Math.min((earnings || []).length, 5) - 1 ? `1px solid ${C.bL}` : "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: MO, fontSize: 9, color: C.tm }}>{e.date}</span>
              <span style={{ fontFamily: MO, fontSize: 11, fontWeight: 700 }}>{e.ticker}</span>
            </div>
            <span style={{ fontFamily: MO, fontSize: 8, color: C.ts }}>{e.hour || ""}</span>
          </div>
        ))}
        {(!earnings || earnings.length === 0) && (
          <div style={{ fontFamily: MO, fontSize: 10, color: C.tm }}>No earnings this week</div>
        )}
      </div>

      {/* Card 3: Markets */}
      <div style={{ background: C.card, border: `1px solid ${C.b}`, borderRadius: 12, padding: "16px" }}>
        <div style={{ fontFamily: SA, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Markets</div>
        {Object.entries(overview?.indexes || {}).map(([name, data], i, arr) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "7px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.bL}` : "none",
          }}>
            <span style={{ fontFamily: MO, fontSize: 10, color: C.ts }}>{name}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: MO, fontSize: 11, fontWeight: 700 }}>
                {data.price != null ? (data.price >= 1000 ? "$" + data.price.toLocaleString("en-US", { maximumFractionDigits: 0 }) : data.price.toFixed(2)) : "—"}
              </span>
              {data.change != null && (
                <span style={{ fontFamily: MO, fontSize: 9, fontWeight: 600, color: dColor(data.change, name === "VIX") }}>
                  {pctF(data.change)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Card 4: News */}
      <div style={{ background: C.card, border: `1px solid ${C.b}`, borderRadius: 12, padding: "16px" }}>
        <div style={{ fontFamily: SA, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Live Macro</div>
        {(news || []).map((n, i) => (
          <div key={i} style={{
            padding: "7px 0",
            borderBottom: i < (news || []).length - 1 ? `1px solid ${C.bL}` : "none",
          }}>
            <div style={{
              fontFamily: MO, fontSize: 10, lineHeight: 1.5,
              color: n.sentiment === "bull" ? C.grn : n.sentiment === "bear" ? C.red : C.warn,
            }}>
              <span style={{ opacity: 0.4, marginRight: 6 }}>●</span>{n.text}
            </div>
          </div>
        ))}
        {(!news || news.length === 0) && (
          <div style={{ fontFamily: MO, fontSize: 10, color: C.tm }}>No macro news</div>
        )}
      </div>
    </div>
  );
}
