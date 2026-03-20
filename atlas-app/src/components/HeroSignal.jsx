import React from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { C, MO, SA, fmt, pctF, dColor } from "../theme";
import { Pill, ChartTooltip } from "./Shared";

export default function HeroSignal({ signal, period, setPeriod }) {
  if (!signal) return null;

  const chartData = (signal.sparkline || []).map((p, i) => ({ i, p, v: Math.random() * 80 + 20 }));

  return (
    <div style={{ background: C.card, border: `1px solid ${C.b}`, borderRadius: 14, padding: "20px 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: MO, fontSize: 9, color: C.tm, background: C.bL, padding: "2px 7px", borderRadius: 4 }}>
            #{signal.rank || 1}
          </span>
          <span style={{ fontSize: 20, fontWeight: 800 }}>{signal.ticker}</span>
          <Pill sig={signal.signal} big={true} />
          {signal.clear && (
            <span style={{ fontFamily: MO, fontSize: 8, color: C.grn, background: C.grnD, padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
              ✓ No Earnings
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          {["1M", "3M", "6M", "1Y"].map((p) => (
            <button key={p} onClick={() => setPeriod(p.toLowerCase())} style={{
              padding: "4px 10px", borderRadius: 5,
              border: `1px solid ${period === p.toLowerCase() ? C.mint + "33" : C.b}`,
              background: period === p.toLowerCase() ? C.mintD : "transparent",
              color: period === p.toLowerCase() ? C.mint : C.ts,
              fontFamily: MO, fontSize: 9, fontWeight: 600, cursor: "pointer",
            }}>{p}</button>
          ))}
        </div>
      </div>

      {/* Price */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
        <span style={{ fontFamily: MO, fontSize: 28, fontWeight: 800 }}>{fmt(signal.price)}</span>
        <span style={{ fontFamily: MO, fontSize: 12, fontWeight: 600, color: dColor(signal.change || 0) }}>
          {pctF(signal.change || 0)}
        </span>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.mint} stopOpacity={0.18} />
              <stop offset="100%" stopColor={C.mint} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="i" tick={{ fill: C.tm, fontSize: 9, fontFamily: MO }} axisLine={{ stroke: C.bL }} tickLine={false} interval={9} />
          <YAxis tick={{ fill: C.tm, fontSize: 9, fontFamily: MO }} axisLine={false} tickLine={false} width={50} domain={["auto", "auto"]} />
          <Tooltip content={<ChartTooltip />} />
          <Area type="monotone" dataKey="p" stroke={C.mint} strokeWidth={2} fill="url(#heroGrad)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>

      {/* Volume */}
      <ResponsiveContainer width="100%" height={36}>
        <BarChart data={chartData}>
          <Bar dataKey="v" fill={C.mint + "1A"} radius={[1, 1, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {/* Position badge */}
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 8, marginTop: 8,
        background: C.sf, border: `1px solid ${C.b}`, borderRadius: 10, padding: "8px 14px",
      }}>
        <span style={{ color: C.grn, fontSize: 14 }}>↑</span>
        <div>
          <div style={{ fontFamily: MO, fontSize: 14, fontWeight: 800 }}>
            ${(signal.chip || 0).toLocaleString()}
          </div>
          <div style={{ fontFamily: MO, fontSize: 8, color: C.ts }}>Position Size</div>
        </div>
      </div>

      {/* Reason */}
      <div style={{
        marginTop: 10, fontFamily: MO, fontSize: 11, color: C.ts,
        padding: "8px 12px", background: C.sf, borderRadius: 6, border: `1px solid ${C.bL}`,
      }}>
        <span style={{ color: C.mint, marginRight: 8, fontWeight: 700 }}>WHY:</span>
        {signal.reason || "Analyzing..."}
      </div>
    </div>
  );
}
