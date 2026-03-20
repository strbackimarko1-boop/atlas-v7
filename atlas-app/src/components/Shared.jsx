import React from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { C, MO } from "../theme";

// ── SVG Semicircle Gauge ─────────────────────────────────────
export function Gauge({ value, max = 100, size = 100, label, color = C.mint, thickness = 7 }) {
  const r = (size - thickness) / 2;
  const circ = Math.PI * r;
  const pct = Math.min(value / max, 1);
  const off = circ - pct * circ;
  return (
    <div style={{ textAlign: "center" }}>
      <svg width={size} height={size / 2 + 14} viewBox={`0 0 ${size} ${size / 2 + 14}`}>
        <path
          d={`M ${thickness / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - thickness / 2} ${size / 2}`}
          fill="none" stroke={C.bL} strokeWidth={thickness} strokeLinecap="round"
        />
        <path
          d={`M ${thickness / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - thickness / 2} ${size / 2}`}
          fill="none" stroke={color} strokeWidth={thickness} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
        <text
          x={size / 2} y={size / 2 - 2} textAnchor="middle"
          fill={C.txt} fontFamily={MO}
          fontSize={size > 90 ? 20 : 15} fontWeight="800"
        >
          {value}{max === 100 ? "%" : ""}
        </text>
      </svg>
      {label && (
        <div style={{ fontFamily: MO, fontSize: 8, color: C.ts, letterSpacing: 1.5, textTransform: "uppercase", marginTop: -2 }}>
          {label}
        </div>
      )}
    </div>
  );
}

// ── Signal Pill ──────────────────────────────────────────────
export function Pill({ sig, big }) {
  const map = {
    "STRONG BUY": { bg: C.mint, c: "#000", sh: "0 0 12px rgba(125,255,195,0.3)" },
    BUY: { bg: C.mintD, c: C.mint, bd: `1px solid ${C.mint}33` },
    FORMING: { bg: "rgba(255,255,255,0.03)", c: C.ts, bd: `1px solid ${C.b}` },
    SKIP: { bg: C.redD, c: C.red, bd: `1px solid ${C.red}33` },
  };
  const s = map[sig] || map.FORMING;
  return (
    <span style={{
      display: "inline-block",
      padding: big ? "5px 16px" : "3px 10px",
      borderRadius: big ? 7 : 5,
      fontFamily: MO,
      fontSize: big ? 11 : 9,
      fontWeight: 700,
      letterSpacing: big ? 1.5 : 1,
      textTransform: "uppercase",
      background: s.bg,
      color: s.c,
      border: s.bd || "none",
      boxShadow: s.sh || "none",
    }}>
      {sig}
    </span>
  );
}

// ── Sparkline ────────────────────────────────────────────────
export function Spark({ data, color = C.mint, w = 100, h = 32 }) {
  const gId = "sp" + color.replace("#", "");
  const chartData = Array.isArray(data)
    ? data.map((v, i) => ({ i, p: typeof v === "number" ? v : v?.p || 0 }))
    : [];

  return (
    <ResponsiveContainer width={w} height={h}>
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id={gId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="p" stroke={color} strokeWidth={1.5} fill={`url(#${gId})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Tier Progress Bars ───────────────────────────────────────
export function TierBars({ tiers }) {
  if (!tiers) return null;
  const items = [
    { l: "Survival", v: tiers.survival, cr: true },
    { l: "Direction", v: tiers.regime },
    { l: "Timing", v: tiers.timing },
    { l: "Edge", v: tiers.edge },
  ];
  return (
    <div>
      {items.map((t, i) => (
        <div key={i} style={{ marginBottom: i < 3 ? 8 : 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ fontFamily: MO, fontSize: 9, color: C.ts }}>{t.l}</span>
            <span style={{
              fontFamily: MO, fontSize: 9, fontWeight: 700,
              color: t.v === 100 && t.cr ? C.grn : t.v > 50 ? C.mint : C.tm,
            }}>
              {t.v}%
            </span>
          </div>
          <div style={{ height: 4, background: C.bL, borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              height: 4, width: `${t.v}%`,
              background: t.v === 100 && t.cr ? C.grn : C.mint,
              borderRadius: 2, transition: "width 0.6s ease",
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Chart Tooltip ────────────────────────────────────────────
export function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.b}`, borderRadius: 8,
      padding: "10px 14px", fontFamily: MO, fontSize: 10,
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    }}>
      <div style={{ color: C.ts, marginBottom: 4 }}>{label}</div>
      <div style={{ color: C.mint, fontWeight: 700, fontSize: 13 }}>
        ${payload[0].value?.toFixed(2)}
      </div>
    </div>
  );
}
