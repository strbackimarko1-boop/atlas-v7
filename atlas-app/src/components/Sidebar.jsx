import React from "react";
import { C, MO, SA } from "../theme";

const NAV = [
  { id: "radar", icon: "◆", label: "Radar" },
  { id: "charts", icon: "◻", label: "Charts" },
  { id: "guide", icon: "⚡", label: "Guide" },
  { id: "settings", icon: "⚙", label: "Settings" },
];

const UNIVERSES = ["STOCKS", "CRYPTO", "LEVERAGED"];

export default function Sidebar({ page, setPage, scan, setScan, scanCount }) {
  return (
    <div style={{
      width: 200, background: C.sidebar, borderRight: `1px solid ${C.b}`,
      display: "flex", flexDirection: "column", padding: "20px 0", flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{
        padding: "0 20px 24px", display: "flex", alignItems: "center", gap: 10,
        borderBottom: `1px solid ${C.b}`, marginBottom: 16,
      }}>
        <div style={{
          width: 30, height: 30, background: C.mint, borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, color: "#000", fontWeight: 900,
        }}>◈</div>
        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.3 }}>ATLAS</span>
      </div>

      {/* Nav */}
      <div style={{ padding: "0 12px", marginBottom: 8 }}>
        <div style={{
          fontFamily: MO, fontSize: 8, fontWeight: 600, letterSpacing: 2,
          color: C.tm, textTransform: "uppercase", padding: "0 8px", marginBottom: 8,
        }}>Menu</div>
      </div>
      {NAV.map((nav) => (
        <button key={nav.id} onClick={() => setPage(nav.id)} style={{
          display: "flex", alignItems: "center", gap: 12,
          width: "calc(100% - 24px)", margin: "0 12px 4px",
          padding: "10px 14px", borderRadius: 8, border: "none", cursor: "pointer",
          background: page === nav.id ? C.sidebarActive : "transparent",
          color: page === nav.id ? C.mint : C.ts,
          fontFamily: SA, fontSize: 13, fontWeight: 600, textAlign: "left",
          transition: "all 0.15s",
          borderLeft: page === nav.id ? `2px solid ${C.mint}` : "2px solid transparent",
        }}>
          <span style={{ fontSize: 14, width: 20, textAlign: "center" }}>{nav.icon}</span>
          {nav.label}
        </button>
      ))}

      {/* Universe selector */}
      <div style={{ padding: "0 12px", marginTop: 24 }}>
        <div style={{
          fontFamily: MO, fontSize: 8, fontWeight: 600, letterSpacing: 2,
          color: C.tm, textTransform: "uppercase", padding: "0 8px", marginBottom: 8,
        }}>Universe</div>
        {UNIVERSES.map((m) => (
          <button key={m} onClick={() => setScan(m)} style={{
            display: "block", width: "100%", padding: "8px 14px", marginBottom: 3,
            borderRadius: 6, border: "none", cursor: "pointer", textAlign: "left",
            background: scan === m ? C.mintD : "transparent",
            color: scan === m ? C.mint : C.tm,
            fontFamily: MO, fontSize: 10, fontWeight: 600, letterSpacing: 1,
            transition: "all 0.15s",
          }}>{m}</button>
        ))}
      </div>

      {/* Bottom info */}
      <div style={{ marginTop: "auto", padding: "16px 20px", borderTop: `1px solid ${C.b}` }}>
        <div style={{ fontFamily: MO, fontSize: 9, color: C.tm, marginBottom: 4 }}>
          {scanCount?.scanned || 0} scanned
        </div>
        <div style={{ fontFamily: MO, fontSize: 9, color: C.mint }}>
          {scanCount?.found || 0} setups found
        </div>
      </div>
    </div>
  );
}
