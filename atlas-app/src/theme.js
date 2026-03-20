/** ATLAS Theme — EchoFi-inspired dark palette */

export const C = {
  bg: "#0C0F14",
  sf: "#111621",
  card: "#161C28",
  cardH: "#1B2233",
  b: "#1F2737",
  bH: "#2B3548",
  bL: "#171D2A",
  mint: "#7DFFC3",
  mintM: "rgba(125,255,195,0.18)",
  mintD: "rgba(125,255,195,0.06)",
  grn: "#4ADE80",
  grnD: "rgba(74,222,128,0.06)",
  red: "#FF6B81",
  redD: "rgba(255,107,129,0.06)",
  lav: "#B4A0FF",
  lavD: "rgba(180,160,255,0.06)",
  txt: "#F0F0F5",
  ts: "#8892A4",
  tm: "#4A5568",
  warn: "#FBBF24",
  warnD: "rgba(251,191,36,0.06)",
  sidebar: "#0A0D12",
  sidebarActive: "#141B26",
};

export const MO = "'JetBrains Mono', monospace";
export const SA = "'DM Sans', system-ui, sans-serif";

export const fmt = (v) =>
  v >= 1000
    ? "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : "$" + v.toFixed(2);

export const pctF = (v) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%";

export const dColor = (v, inv) =>
  inv ? (v > 0 ? C.red : C.grn) : (v >= 0 ? C.grn : C.red);
