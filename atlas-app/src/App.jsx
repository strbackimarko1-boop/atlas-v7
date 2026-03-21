import React, { useState, useEffect, useCallback } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const C = {
  bg:"#0B0E13",sf:"#10141C",card:"#151A24",b:"#1E2530",bH:"#2A3345",bL:"#171D2A",
  mint:"#7DFFC3",mintD:"rgba(125,255,195,0.06)",grn:"#4ADE80",grnD:"rgba(74,222,128,0.06)",
  red:"#FF6B81",redD:"rgba(255,107,129,0.06)",lav:"#B4A0FF",
  txt:"#E8E8F0",ts:"#8892A4",tm:"#4A5568",warn:"#FBBF24",
  sb:"#0A0D12",sbA:"#141B26",
};
const M="'JetBrains Mono',monospace";
const S="'Plus Jakarta Sans','DM Sans',system-ui,sans-serif";
const fmt=v=>v>=1000?"$"+v.toLocaleString("en-US",{maximumFractionDigits:0}):"$"+v.toFixed(2);
const pf=v=>(v>=0?"+":"")+v.toFixed(2)+"%";
const dc=(v,inv)=>inv?(v>0?C.red:C.grn):(v>=0?C.grn:C.red);
const api=async p=>{try{const r=await fetch(p);return r.ok?await r.json():null}catch(e){return null}};

// ── Gauge ────────────────────────────────────────────────
function Gauge({value,max=100,size=76,label,color=C.mint,thick=5}){
  const r=(size-thick)/2,ci=Math.PI*r,p=Math.min(value/max,1),o=ci-p*ci;
  return(<div style={{textAlign:"center"}}>
    <svg width={size} height={size/2+12} viewBox={`0 0 ${size} ${size/2+12}`}>
      <path d={`M ${thick/2} ${size/2} A ${r} ${r} 0 0 1 ${size-thick/2} ${size/2}`} fill="none" stroke={C.bL} strokeWidth={thick} strokeLinecap="round"/>
      <path d={`M ${thick/2} ${size/2} A ${r} ${r} 0 0 1 ${size-thick/2} ${size/2}`} fill="none" stroke={color} strokeWidth={thick} strokeLinecap="round" strokeDasharray={ci} strokeDashoffset={o} style={{transition:"stroke-dashoffset .8s"}}/>
      <text x={size/2} y={size/2-2} textAnchor="middle" fill={C.txt} fontFamily={M} fontSize={15} fontWeight="700">{value}%</text>
    </svg>
    {label&&<div style={{fontFamily:M,fontSize:10,color:C.ts,letterSpacing:1,textTransform:"uppercase",marginTop:-2}}>{label}</div>}
  </div>);
}

function Pill({sig,sm}){
  const m={"STRONG BUY":{bg:C.mint,c:"#000"},"BUY":{bg:C.mintD,c:C.mint,bd:`1px solid ${C.mint}33`},"FORMING":{bg:"rgba(255,255,255,0.04)",c:C.ts,bd:`1px solid ${C.b}`},"SKIP":{bg:C.redD,c:C.red,bd:`1px solid ${C.red}33`}};
  const s=m[sig]||m.FORMING;
  return<span style={{display:"inline-block",padding:sm?"2px 8px":"4px 12px",borderRadius:4,fontFamily:M,fontSize:sm?9:10,fontWeight:600,letterSpacing:.8,textTransform:"uppercase",background:s.bg,color:s.c,border:s.bd||"none"}}>{sig}</span>;
}

function Spark({data,color=C.mint,w=100,h=28}){
  const d=Array.isArray(data)?data.map((v,i)=>({i,p:typeof v==="number"?v:0})):[];
  if(d.length<2)return null;
  const id="s"+color.replace("#","");
  return(<ResponsiveContainer width={w} height={h}><AreaChart data={d}><defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={.3}/><stop offset="100%" stopColor={color} stopOpacity={0}/></linearGradient></defs><Area type="monotone" dataKey="p" stroke={color} strokeWidth={1.5} fill={`url(#${id})`} dot={false}/></AreaChart></ResponsiveContainer>);
}

function Tip({active,payload,label}){
  if(!active||!payload?.length)return null;
  return<div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:6,padding:"6px 10px",fontFamily:M,fontSize:10}}><div style={{color:C.ts}}>{label}</div><div style={{color:C.mint,fontWeight:700}}>${payload[0].value?.toFixed(2)}</div></div>;
}

// ── Status helpers ───────────────────────────────────────
function statusText(gate){
  if(!gate)return{icon:"◌",text:"Loading...",color:C.tm,bg:C.card};
  const s=gate.status;
  if(s==="GO")return{icon:"●",text:"ALL CLEAR — Full signals active, trade normally",color:C.grn,bg:C.grnD};
  if(s==="CAUTION")return{icon:"●",text:"HALF SIZE — Mixed signals, reduce all positions",color:C.warn,bg:C.warn+"12"};
  if(s==="WARN")return{icon:"●",text:"WATCH ONLY — Do not enter new trades today",color:"#F59E0B",bg:"rgba(245,158,11,0.06)"};
  return{icon:"●",text:"STAND DOWN — Market conditions too risky",color:C.red,bg:C.redD};
}

function tierChecklist(tiers){
  if(!tiers)return[];
  const items=[];
  // Safety
  if(tiers.survival===100)items.push({icon:"✓",text:"Safe to trade — not overbought, no earnings",color:C.grn});
  else items.push({icon:"✗",text:"Blocked — too close to highs or earnings soon",color:C.red});
  // Market
  if(tiers.regime>=67)items.push({icon:"✓",text:"Market supports this trade",color:C.grn});
  else if(tiers.regime>=33)items.push({icon:"◐",text:"Market is mixed — partial support",color:C.warn});
  else items.push({icon:"✗",text:"Market is working against you",color:C.red});
  // Entry
  if(tiers.timing>=67)items.push({icon:"✓",text:"Good entry point right now",color:C.grn});
  else if(tiers.timing>=33)items.push({icon:"◐",text:"Entry timing is OK, not ideal",color:C.warn});
  else items.push({icon:"○",text:"Wait for a better entry",color:C.ts});
  // Edge
  if(tiers.edge>=50)items.push({icon:"✓",text:"Extra edge — outperforming or post-earnings drift",color:C.grn});
  else items.push({icon:"○",text:"No extra edge detected",color:C.tm});
  return items;
}

function newsTag(sentiment){
  if(sentiment==="bull")return{label:"BULLISH",color:C.grn,bg:C.grnD};
  if(sentiment==="bear")return{label:"BEARISH",color:C.red,bg:C.redD};
  if(sentiment==="warn")return{label:"WATCH",color:C.warn,bg:C.warn+"12"};
  return{label:"NEUTRAL",color:C.ts,bg:C.card};
}

// ═══════════════════════════════════════════════════════════
export default function App(){
  const[page,setPage]=useState("radar");
  const[scan,setScan]=useState("STOCKS");
  const[sel,setSel]=useState(0);
  const[tab,setTab]=useState("plan");
  const[capital,setCapital]=useState(3500);
  const[chartTk,setChartTk]=useState("");
  const[aTk,setATk]=useState("");
  const[aData,setAData]=useState(null);
  const[aLoading,setALoading]=useState(false);
  const[time,setTime]=useState(new Date());
  const[gate,setGate]=useState(null);
  const[pulse,setPulse]=useState(null);
  const[overview,setOverview]=useState(null);
  const[news,setNews]=useState(null);
  const[earnings,setEarnings]=useState(null);
  const[scanData,setScanData]=useState(null);
  const[loading,setLoading]=useState(true);

  useEffect(()=>{const t=setInterval(()=>setTime(new Date()),1000);return()=>clearInterval(t)},[]);

  const load=useCallback(async()=>{
    const[g,p,o,n,e]=await Promise.all([api("/api/gate"),api("/api/pulse"),api("/api/overview"),api("/api/news"),api("/api/earnings")]);
    if(g)setGate(g);if(p)setPulse(p);if(o)setOverview(o);if(n?.news)setNews(n.news);if(e?.earnings)setEarnings(e.earnings);
  },[]);

  const doScan=useCallback(async m=>{
    setLoading(true);setSel(0);
    const d=await api("/api/scan/"+m.toLowerCase());
    if(d)setScanData(d);
    setLoading(false);
  },[]);

  const doAnalyze=useCallback(async ticker=>{
    if(!ticker)return;
    setALoading(true);setAData(null);
    const d=await api("/api/analyze/"+ticker.toUpperCase());
    if(d)setAData(d);
    setALoading(false);
  },[]);

  useEffect(()=>{load();doScan(scan);const i=setInterval(load,300000);return()=>clearInterval(i)},[]);
  useEffect(()=>{doScan(scan)},[scan]);

  const sigs=scanData?.results||[];
  const hero=sigs[sel]||null;
  const mkt=gate?.market||{};
  const st=statusText(gate);
  const et=time.toLocaleString("en-US",{timeZone:"America/New_York",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});
  const etd=time.toLocaleString("en-US",{timeZone:"America/New_York",month:"short",day:"numeric",year:"numeric"});

  // Profit calc
  const lv=hero?.levels||{};
  const entry=lv.entry||0,stop=lv.stop||0;
  const shares=entry>0?Math.floor(capital/entry):0;
  const inv=shares*entry,risk=shares*(entry-stop);
  const s1=Math.floor(shares*.5),s2=Math.floor(shares*.3),s3=shares-s1-s2;
  const p1=s1*((lv.t1||0)-entry),p2=s2*((lv.t2||0)-entry),p3=s3*((lv.t3||0)-entry);
  const tp=p1+p2+p3,rr=risk>0?tp/risk:0;

  return(
    <div style={{display:"flex",height:"100vh",background:C.bg,color:C.txt,fontFamily:S,overflow:"hidden"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500;600;700&display=swap');
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:${C.b};border-radius:3px}
      `}</style>

      {/* ═══ SIDEBAR ═══ */}
      <div style={{width:170,background:C.sb,borderRight:`1px solid ${C.b}`,display:"flex",flexDirection:"column",padding:"12px 0",flexShrink:0}}>
        <div style={{padding:"0 14px 14px",display:"flex",alignItems:"center",gap:8,borderBottom:`1px solid ${C.b}`}}>
          <div style={{width:24,height:24,background:C.mint,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#000",fontWeight:800}}>◈</div>
          <span style={{fontSize:15,fontWeight:700,letterSpacing:-.3}}>ATLAS</span>
        </div>

        <div style={{padding:"10px 8px 4px"}}>
          {[{id:"radar",icon:"◆",l:"Radar"},{id:"charts",icon:"◻",l:"Charts"},{id:"outlook",icon:"◎",l:"Outlook"},{id:"guide",icon:"⚡",l:"Guide"},{id:"settings",icon:"⚙",l:"Settings"}].map(n=>(
            <button key={n.id} onClick={()=>setPage(n.id)} style={{
              display:"flex",alignItems:"center",gap:10,width:"100%",marginBottom:2,
              padding:"9px 12px",borderRadius:6,border:"none",cursor:"pointer",
              background:page===n.id?C.sbA:"transparent",
              color:page===n.id?C.mint:C.ts,
              fontFamily:S,fontSize:13,fontWeight:page===n.id?600:400,textAlign:"left",
              borderLeft:page===n.id?`2px solid ${C.mint}`:"2px solid transparent",
              opacity:page===n.id?1:.6,letterSpacing:.2,
            }}><span style={{fontSize:12,width:16,textAlign:"center",opacity:.7}}>{n.icon}</span>{n.l}</button>
          ))}
        </div>

        <div style={{padding:"12px 8px 4px"}}>
          <div style={{fontFamily:M,fontSize:9,fontWeight:500,letterSpacing:1.5,color:C.tm,padding:"0 8px",marginBottom:6,opacity:.5}}>UNIVERSE</div>
          {["STOCKS","CRYPTO","LEVERAGED"].map(m=>(
            <button key={m} onClick={()=>setScan(m)} style={{
              display:"block",width:"100%",marginBottom:2,padding:"7px 12px",
              borderRadius:5,border:"none",cursor:"pointer",textAlign:"left",
              background:scan===m?C.mintD:"transparent",color:scan===m?C.mint:C.tm,
              fontFamily:M,fontSize:10,fontWeight:scan===m?600:400,letterSpacing:.8,
              opacity:scan===m?1:.5,
            }}>{m}</button>
          ))}
        </div>

        {/* Status in sidebar */}
        <div style={{margin:"auto 8px 0",padding:"10px",background:C.card,borderRadius:6,border:`1px solid ${C.b}`}}>
          <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:6}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:st.color,animation:"pulse 2s infinite"}}/>
            <span style={{fontFamily:M,fontSize:10,fontWeight:600,color:st.color}}>{gate?.status||"—"}</span>
          </div>
          <div style={{fontFamily:M,fontSize:9,color:C.tm,lineHeight:1.4}}>{gate?.count||0}/{gate?.total||4} checks passing</div>
          <div style={{fontFamily:M,fontSize:9,color:C.ts,marginTop:4}}>{scanData?.found||0} setups found</div>
        </div>
      </div>

      {/* ═══ MAIN ═══ */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>

        {/* ═══ STATUS BAR ═══ */}
        <div style={{background:st.bg,borderBottom:`1px solid ${C.b}`,padding:"0 20px",height:38,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{color:st.color,fontSize:8}}>●</span>
            <span style={{fontFamily:S,fontSize:12,fontWeight:600,color:st.color}}>{st.text}</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            {[{k:"sp_200ma",l:"S&P>200"},{k:"sp_50ma",l:"S&P>50"},{k:"vix_20",l:"VIX<20"},{k:"vix_25",l:"VIX<25"}].map((g,i)=>{
              const v=gate?.checks?.[g.k];
              return<span key={i} style={{fontFamily:M,fontSize:9,padding:"2px 6px",borderRadius:3,background:v?C.grnD:C.redD,color:v?C.grn:C.red,fontWeight:500}}>{v?"✓":"✗"} {g.l}</span>;
            })}
          </div>
        </div>

        {/* ═══ MARKET STRIP ═══ */}
        <div style={{background:C.sf,borderBottom:`1px solid ${C.b}`,padding:"0 20px",height:34,display:"flex",alignItems:"center",gap:16,flexShrink:0}}>
          {pulse?.sp500?.price&&<span style={{fontFamily:M,fontSize:11}}>S&P <b style={{color:C.txt}}>{pulse.sp500.price.toLocaleString()}</b> <span style={{color:dc(pulse.sp500.change||0),fontSize:10}}>{pulse.sp500.change>0?"▲":"▼"}{Math.abs(pulse.sp500.change||0).toFixed(1)}%</span></span>}
          <span style={{color:C.b}}>·</span>
          {pulse?.vix?.value&&<span style={{fontFamily:M,fontSize:11}}>VIX <b style={{color:pulse.vix.value>25?C.red:C.txt}}>{pulse.vix.value}</b></span>}
          <span style={{color:C.b}}>·</span>
          {pulse?.fear_greed?.score!=null&&<span style={{fontFamily:M,fontSize:11}}>Fear <b style={{color:pulse.fear_greed.score<25?C.red:C.txt}}>{pulse.fear_greed.score}</b> <span style={{fontSize:10,color:pulse.fear_greed.score<25?C.red:C.ts}}>{pulse.fear_greed.score<25?"Extreme":pulse.fear_greed.label||""}</span></span>}
          <span style={{color:C.b}}>·</span>
          {pulse?.btc_dominance&&<span style={{fontFamily:M,fontSize:11}}>BTC.D <b>{pulse.btc_dominance}%</b></span>}
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <div style={{width:5,height:5,borderRadius:"50%",background:mkt.is_open?C.grn:C.tm,animation:mkt.is_open?"pulse 2s infinite":"none"}}/>
              <span style={{fontFamily:M,fontSize:10,color:mkt.is_open?C.grn:C.tm}}>{mkt.is_open?"Open":"Closed"}</span>
            </div>
            <span style={{fontFamily:M,fontSize:10,color:C.ts}}>{et} · {etd}</span>
          </div>
        </div>

        {/* ═══ CONTENT ═══ */}
        <div style={{flex:1,overflow:"auto",padding:"10px 14px"}}>

          {page==="radar"&&(
            <div style={{animation:"fadeIn .2s ease"}}>
              {loading&&!hero?(
                <div style={{textAlign:"center",padding:"60px"}}><div style={{fontSize:24,color:C.mint,opacity:.3,marginBottom:10}}>◈</div><div style={{fontFamily:M,fontSize:12,color:C.ts}}>Scanning {scan.toLowerCase()}...</div></div>
              ):hero?(
                <>
                  {/* MAIN GRID */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 270px",gap:10,marginBottom:10}}>

                    {/* ═══ LEFT: CHART ═══ */}
                    <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:8,padding:"12px 16px"}}>
                      {/* Header */}
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontFamily:M,fontSize:10,color:C.tm,background:C.bL,padding:"2px 6px",borderRadius:3}}>#{hero.rank||1}</span>
                          <span style={{fontSize:18,fontWeight:700}}>{hero.ticker}</span>
                          <Pill sig={hero.signal}/>
                          {hero.clear&&<span style={{fontFamily:M,fontSize:9,color:C.grn,background:C.grnD,padding:"2px 7px",borderRadius:3}}>✓ No Earnings</span>}
                        </div>
                        <div style={{display:"flex",gap:2}}>
                          {["1M","3M","6M","1Y"].map((p,i)=>(
                            <button key={p} style={{padding:"3px 8px",borderRadius:4,border:`1px solid ${i===2?C.mint+"33":C.b}`,background:i===2?C.mintD:"transparent",color:i===2?C.mint:C.tm,fontFamily:M,fontSize:9,cursor:"pointer"}}>{p}</button>
                          ))}
                        </div>
                      </div>

                      {/* Price + indicators */}
                      <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:6}}>
                        <span style={{fontFamily:M,fontSize:22,fontWeight:700}}>{fmt(hero.price)}</span>
                        <span style={{fontFamily:M,fontSize:11,color:dc(hero.change||0)}}>{hero.change>0?"▲":"▼"} {Math.abs(hero.change||0).toFixed(2)}%</span>
                        <div style={{marginLeft:"auto",display:"flex",gap:12,fontFamily:M,fontSize:10,color:C.ts}}>
                          <span>RSI <b style={{color:(hero.indicators?.rsi||50)<30?C.grn:(hero.indicators?.rsi||50)>70?C.red:C.txt}}>{hero.indicators?.rsi||"—"}</b></span>
                          <span>ADX <b style={{color:C.txt}}>{hero.indicators?.adx||"—"}</b></span>
                          <span>MFI <b style={{color:(hero.indicators?.mfi||0)>50?C.grn:C.txt}}>{hero.indicators?.mfi||"—"}</b></span>
                        </div>
                      </div>

                      {/* Chart */}
                      <ResponsiveContainer width="100%" height={185}>
                        <AreaChart data={(hero.sparkline||[]).map((p,i)=>({i,p,v:Math.random()*60+20}))}>
                          <defs><linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.mint} stopOpacity={.12}/><stop offset="100%" stopColor={C.mint} stopOpacity={0}/></linearGradient></defs>
                          <XAxis dataKey="i" tick={{fill:C.tm,fontSize:9,fontFamily:M}} axisLine={{stroke:C.bL}} tickLine={false} interval={9}/>
                          <YAxis tick={{fill:C.tm,fontSize:9,fontFamily:M}} axisLine={false} tickLine={false} width={44} domain={["auto","auto"]}/>
                          <Tooltip content={Tip}/>
                          <Area type="monotone" dataKey="p" stroke={C.mint} strokeWidth={1.5} fill="url(#hg)" dot={false}/>
                        </AreaChart>
                      </ResponsiveContainer>

                      <ResponsiveContainer width="100%" height={20}>
                        <BarChart data={(hero.sparkline||[]).map((p,i)=>({i,v:Math.random()*60+20}))}>
                          <Bar dataKey="v" fill={C.mint+"15"} radius={[1,1,0,0]}/>
                        </BarChart>
                      </ResponsiveContainer>

                      {/* WHY strip */}
                      <div style={{display:"flex",alignItems:"center",gap:8,marginTop:6,padding:"6px 10px",background:C.sf,borderRadius:5,border:`1px solid ${C.bL}`}}>
                        <span style={{fontFamily:M,fontSize:10,color:C.mint,fontWeight:600}}>WHY</span>
                        <span style={{fontFamily:S,fontSize:11,color:C.ts,flex:1}}>{hero.reason||"Analyzing..."}</span>
                        <div style={{display:"flex",alignItems:"center",gap:3,background:C.bL,padding:"2px 8px",borderRadius:3}}>
                          <span style={{color:C.grn,fontSize:9}}>↑</span>
                          <span style={{fontFamily:M,fontSize:11,fontWeight:700}}>${(hero.chip||0).toLocaleString()}</span>
                        </div>
                      </div>

                      {/* SIGNAL STRIP — next setups */}
                      {sigs.length>1&&(
                        <div style={{display:"flex",gap:6,marginTop:8,overflowX:"auto",paddingBottom:2}}>
                          {sigs.filter((_,i)=>i!==sel).slice(0,6).map((r,i)=>(
                            <div key={i} onClick={()=>setSel(sigs.indexOf(r))} style={{
                              flex:"0 0 auto",background:C.sf,border:`1px solid ${C.bL}`,borderRadius:5,
                              padding:"6px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:8,minWidth:160,
                            }}
                              onMouseEnter={e=>e.currentTarget.style.borderColor=C.mint+"33"}
                              onMouseLeave={e=>e.currentTarget.style.borderColor=C.bL}>
                              <div>
                                <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:1}}>
                                  <span style={{fontFamily:M,fontSize:11,fontWeight:600}}>{r.ticker}</span>
                                  <Pill sig={r.signal} sm/>
                                </div>
                                <div style={{fontFamily:M,fontSize:10,color:C.ts}}>{fmt(r.price)} <span style={{color:dc(r.change||0),fontSize:9}}>{pf(r.change||0)}</span></div>
                              </div>
                              <div style={{width:55}}><Spark data={r.sparkline} color={dc(r.change||0)} w={55} h={20}/></div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* ═══ RIGHT: TRADE PANEL ═══ */}
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {/* Tab toggle */}
                      <div style={{display:"flex",background:C.sf,borderRadius:5,padding:2,border:`1px solid ${C.b}`}}>
                        {[{id:"plan",l:"Trade Plan"},{id:"calc",l:"Profit Calc"}].map(t=>(
                          <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"5px 0",borderRadius:4,border:"none",cursor:"pointer",background:tab===t.id?C.card:"transparent",color:tab===t.id?C.mint:C.ts,fontFamily:M,fontSize:10,fontWeight:600}}>{t.l}</button>
                        ))}
                      </div>

                      {tab==="plan"&&(
                        <>
                          {/* Entry/Stop/Targets */}
                          <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:7,padding:"10px 12px"}}>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,marginBottom:6}}>
                              <div style={{background:C.sf,border:`1px solid ${C.bL}`,borderRadius:5,padding:"7px 10px"}}>
                                <div style={{fontFamily:M,fontSize:9,color:C.ts,marginBottom:1}}>Entry</div>
                                <div style={{fontFamily:M,fontSize:14,fontWeight:600}}>{fmt(entry)}</div>
                              </div>
                              <div style={{background:C.sf,border:`1px solid ${C.bL}`,borderRadius:5,padding:"7px 10px"}}>
                                <div style={{fontFamily:M,fontSize:9,color:C.ts,marginBottom:1}}>Stop −5%</div>
                                <div style={{fontFamily:M,fontSize:14,fontWeight:600,color:C.red}}>{fmt(stop)}</div>
                              </div>
                            </div>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4,marginBottom:6}}>
                              {[{l:"T1 +8%",v:lv.t1,c:C.mint},{l:"T2 +15%",v:lv.t2,c:C.grn},{l:"T3 +20%",v:lv.t3,c:C.grn}].map((t,i)=>(
                                <div key={i} style={{background:C.sf,border:`1px solid ${C.bL}`,borderRadius:4,padding:"5px 6px",textAlign:"center"}}>
                                  <div style={{fontFamily:M,fontSize:8,color:C.tm,marginBottom:1}}>{t.l}</div>
                                  <div style={{fontFamily:M,fontSize:12,fontWeight:700,color:t.c}}>{fmt(t.v||0)}</div>
                                </div>
                              ))}
                            </div>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5,padding:"7px 0 0",borderTop:`1px solid ${C.bL}`}}>
                              <div style={{textAlign:"center"}}><div style={{fontFamily:M,fontSize:9,color:C.tm}}>Shares</div><div style={{fontFamily:M,fontSize:15,fontWeight:700}}>{entry>0?Math.floor((hero.chip||0)/entry):0}</div></div>
                              <div style={{textAlign:"center"}}><div style={{fontFamily:M,fontSize:9,color:C.tm}}>Risk</div><div style={{fontFamily:M,fontSize:15,fontWeight:700,color:C.red}}>{fmt(risk)}</div></div>
                              <div style={{textAlign:"center"}}><div style={{fontFamily:M,fontSize:9,color:C.tm}}>R:R</div><div style={{fontFamily:M,fontSize:15,fontWeight:700,color:rr>=2?C.mint:C.warn}}>1:{rr.toFixed(1)}</div></div>
                            </div>
                          </div>

                          {/* Gauges */}
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
                            <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:6,padding:"8px 4px",textAlign:"center"}}>
                              <Gauge value={hero.tech_score||0} size={70} label="Quality" color={(hero.tech_score||0)>=75?C.mint:C.ts} thick={5}/>
                            </div>
                            <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:6,padding:"8px 4px",textAlign:"center"}}>
                              <Gauge value={hero.catalyst_base||0} size={70} label="Conviction" color={(hero.catalyst_base||0)>=60?C.mint:C.tm} thick={5}/>
                            </div>
                          </div>

                          {/* Tier checklist */}
                          <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:6,padding:"8px 10px"}}>
                            {tierChecklist(hero.tiers).map((t,i)=>(
                              <div key={i} style={{display:"flex",alignItems:"center",gap:7,padding:"4px 0",borderBottom:i<3?`1px solid ${C.bL}`:"none"}}>
                                <span style={{fontSize:12,color:t.color,width:16,textAlign:"center"}}>{t.icon}</span>
                                <span style={{fontFamily:S,fontSize:11,color:t.color=== C.grn?C.txt:t.color}}>{t.text}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}

                      {tab==="calc"&&(
                        <>
                          <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:7,padding:"10px 12px"}}>
                            <div style={{fontFamily:M,fontSize:10,color:C.ts,marginBottom:4}}>Capital to Deploy</div>
                            <input type="number" value={capital} onChange={e=>setCapital(Math.max(0,+e.target.value))} style={{width:"100%",background:C.sf,border:`1px solid ${C.b}`,borderRadius:5,padding:"6px 10px",fontFamily:M,fontSize:13,fontWeight:600,color:C.txt,outline:"none",textAlign:"right"}}/>
                            <input type="range" min={500} max={10000} step={100} value={capital} onChange={e=>setCapital(+e.target.value)} style={{width:"100%",marginTop:4,accentColor:C.mint,height:3}}/>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4,marginTop:6}}>
                              <div style={{textAlign:"center"}}><div style={{fontFamily:M,fontSize:9,color:C.tm}}>Shares</div><div style={{fontFamily:M,fontSize:13,fontWeight:700}}>{shares}</div></div>
                              <div style={{textAlign:"center"}}><div style={{fontFamily:M,fontSize:9,color:C.tm}}>Invested</div><div style={{fontFamily:M,fontSize:13,fontWeight:700}}>{fmt(inv)}</div></div>
                              <div style={{textAlign:"center"}}><div style={{fontFamily:M,fontSize:9,color:C.tm}}>Entry</div><div style={{fontFamily:M,fontSize:13,fontWeight:700}}>{fmt(entry)}</div></div>
                            </div>
                          </div>

                          <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:7,padding:"10px 12px"}}>
                            <div style={{fontFamily:M,fontSize:9,color:C.tm,letterSpacing:1,marginBottom:6}}>STAGED EXIT</div>
                            {[{l:"T1 +8%",pct:"50%",sh:s1,pr:lv.t1,p:p1,c:C.mint},{l:"T2 +15%",pct:"30%",sh:s2,pr:lv.t2,p:p2,c:C.grn},{l:"T3 +20%",pct:"20%",sh:s3,pr:lv.t3,p:p3,c:C.grn}].map((s,i)=>(
                              <div key={i} style={{background:C.sf,border:`1px solid ${C.bL}`,borderRadius:5,padding:"6px 8px",marginBottom:3}}>
                                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                                  <div style={{display:"flex",gap:5}}><span style={{fontFamily:M,fontSize:10,fontWeight:600,color:s.c}}>{s.l}</span><span style={{fontFamily:M,fontSize:8,color:C.tm,background:C.bL,padding:"1px 4px",borderRadius:2}}>Sell {s.pct}</span></div>
                                  <span style={{fontFamily:M,fontSize:11,fontWeight:700,color:s.c}}>+{fmt(s.p)}</span>
                                </div>
                                <div style={{fontFamily:M,fontSize:9,color:C.ts}}>{s.sh} shares @ {fmt(s.pr||0)}</div>
                                <div style={{height:2,background:C.bL,borderRadius:1,marginTop:3,overflow:"hidden"}}><div style={{height:2,width:`${tp>0?s.p/tp*100:0}%`,background:s.c,borderRadius:1,transition:"width .4s"}}/></div>
                              </div>
                            ))}
                          </div>

                          <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:7,padding:"10px 12px"}}>
                            <div style={{display:"flex",height:16,borderRadius:3,overflow:"hidden",marginBottom:6}}>
                              <div style={{width:`${risk+tp>0?risk/(risk+tp)*100:50}%`,background:C.red+"40",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:M,fontSize:8,color:C.red,minWidth:30}}>{fmt(risk)}</div>
                              <div style={{flex:1,background:C.mint+"20",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:M,fontSize:8,color:C.mint}}>{fmt(tp)}</div>
                            </div>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4}}>
                              <div style={{textAlign:"center"}}><div style={{fontFamily:M,fontSize:9,color:C.tm}}>Return</div><div style={{fontFamily:M,fontSize:14,fontWeight:700,color:C.mint}}>+{(inv>0?tp/inv*100:0).toFixed(1)}%</div></div>
                              <div style={{textAlign:"center"}}><div style={{fontFamily:M,fontSize:9,color:C.tm}}>R:R</div><div style={{fontFamily:M,fontSize:14,fontWeight:700,color:rr>=2?C.mint:C.warn}}>1:{rr.toFixed(1)}</div></div>
                              <div style={{textAlign:"center"}}><div style={{fontFamily:M,fontSize:9,color:C.tm}}>Max Loss</div><div style={{fontFamily:M,fontSize:14,fontWeight:700,color:C.red}}>-{fmt(risk)}</div></div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* ═══ BOTTOM GRID ═══ */}
                  <div style={{display:"grid",gridTemplateColumns:"1.2fr 1fr 1fr 1.2fr",gap:8}}>
                    {/* Setups */}
                    <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:7,padding:"10px 12px",maxHeight:280,overflow:"auto"}}>
                      <div style={{fontSize:12,fontWeight:600,marginBottom:6}}>Other Setups</div>
                      {sigs.filter((_,i)=>i!==sel).slice(0,10).map((r,i)=>(
                        <div key={i} onClick={()=>setSel(sigs.indexOf(r))} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${C.bL}`,cursor:"pointer"}}
                          onMouseEnter={e=>e.currentTarget.style.opacity=".7"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                          <div style={{display:"flex",alignItems:"center",gap:5}}>
                            <span style={{fontFamily:M,fontSize:11,fontWeight:600,minWidth:32}}>{r.ticker}</span>
                            <Pill sig={r.signal} sm/>
                          </div>
                          <div style={{textAlign:"right"}}>
                            <span style={{fontFamily:M,fontSize:11,fontWeight:600}}>{fmt(r.price)}</span>
                            <span style={{fontFamily:M,fontSize:9,color:dc(r.change||0),marginLeft:4}}>{pf(r.change||0)}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Earnings */}
                    <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:7,padding:"10px 12px"}}>
                      <div style={{fontSize:12,fontWeight:600,marginBottom:6}}>Earnings This Week</div>
                      {(earnings||[]).slice(0,6).map((e,i)=>(
                        <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${C.bL}`}}>
                          <div style={{display:"flex",gap:6}}>
                            <span style={{fontFamily:M,fontSize:10,color:C.tm}}>{(e.date||"").slice(5)}</span>
                            <span style={{fontFamily:M,fontSize:11,fontWeight:600}}>{e.ticker}</span>
                          </div>
                          <span style={{fontFamily:M,fontSize:9,color:C.ts}}>{e.hour||""}</span>
                        </div>
                      ))}
                      {(!earnings||!earnings.length)&&<div style={{fontFamily:M,fontSize:10,color:C.tm,padding:"8px 0"}}>No earnings this week</div>}
                    </div>

                    {/* Markets */}
                    <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:7,padding:"10px 12px"}}>
                      <div style={{fontSize:12,fontWeight:600,marginBottom:6}}>Markets</div>
                      {Object.entries(overview?.indexes||{}).map(([name,d],i,arr)=>(
                        <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 0",borderBottom:i<arr.length-1?`1px solid ${C.bL}`:"none"}}>
                          <span style={{fontFamily:M,fontSize:10,color:C.ts}}>{name}</span>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontFamily:M,fontSize:11,fontWeight:600}}>{d.price!=null?(d.price>=1000?"$"+d.price.toLocaleString("en-US",{maximumFractionDigits:0}):d.price>=100?"$"+d.price.toFixed(0):d.price.toFixed(2)):"—"}</span>
                            {d.change!=null&&<span style={{fontFamily:M,fontSize:9,color:dc(d.change,name==="VIX")}}>{d.change>0?"▲":"▼"}{Math.abs(d.change).toFixed(1)}%</span>}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* News */}
                    <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:7,padding:"10px 12px"}}>
                      <div style={{fontSize:12,fontWeight:600,marginBottom:6}}>Macro News</div>
                      {(news||[]).map((n,i)=>{
                        const tag=newsTag(n.sentiment);
                        return(
                          <div key={i} style={{padding:"5px 0",borderBottom:`1px solid ${C.bL}`}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6}}>
                              <span style={{fontFamily:S,fontSize:11,color:C.ts,flex:1,lineHeight:1.4}}>{n.text}</span>
                              <span style={{fontFamily:M,fontSize:8,color:tag.color,background:tag.bg,padding:"2px 6px",borderRadius:3,whiteSpace:"nowrap",flexShrink:0}}>{tag.label}</span>
                            </div>
                          </div>
                        );
                      })}
                      {(!news||!news.length)&&<div style={{fontFamily:M,fontSize:10,color:C.tm,padding:"8px 0"}}>No macro news</div>}
                    </div>
                  </div>
                </>
              ):(
                <div style={{textAlign:"center",padding:"50px",background:C.card,borderRadius:8,border:`1px solid ${C.b}`}}>
                  <div style={{fontSize:20,color:C.mint,opacity:.3,marginBottom:8}}>◆</div>
                  <div style={{fontSize:14,fontWeight:600,marginBottom:4}}>No setups found</div>
                  <div style={{fontSize:12,color:C.tm}}>Try a different universe or check back later</div>
                </div>
              )}
            </div>
          )}

          {page==="charts"&&(
            <div style={{animation:"fadeIn .2s"}}>
              <div style={{display:"flex",gap:8,marginBottom:12}}>
                <input value={chartTk} onChange={e=>setChartTk(e.target.value.toUpperCase())} placeholder="Search ticker... NVDA, AAPL, BTC-USD" style={{flex:1,maxWidth:380,padding:"9px 14px",borderRadius:6,background:C.card,border:`1px solid ${C.b}`,color:C.txt,fontFamily:M,fontSize:12,outline:"none"}} onFocus={e=>e.target.style.borderColor=C.mint} onBlur={e=>e.target.style.borderColor=C.b}/>
              </div>
              <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:8,padding:"50px 30px",textAlign:"center"}}>
                <div style={{fontSize:28,color:C.mint,opacity:.3,marginBottom:10}}>◻</div>
                <div style={{fontSize:14,fontWeight:600,marginBottom:4}}>Chart Station</div>
                <div style={{fontSize:12,color:C.tm}}>Enter any ticker for chart + indicators + ATLAS score</div>
              </div>
            </div>
          )}

          {page==="outlook"&&(
            <div style={{animation:"fadeIn .2s"}}>
              {/* Search */}
              <div style={{display:"flex",gap:8,marginBottom:12}}>
                <input value={aTk} onChange={e=>setATk(e.target.value.toUpperCase())} onKeyDown={e=>{if(e.key==="Enter")doAnalyze(aTk)}} placeholder="Type ticker — AAPL, NVDA, MSFT, BTC-USD..." style={{flex:1,maxWidth:400,padding:"10px 14px",borderRadius:6,background:C.card,border:`1px solid ${C.b}`,color:C.txt,fontFamily:M,fontSize:12,outline:"none"}} onFocus={e=>e.target.style.borderColor=C.mint} onBlur={e=>e.target.style.borderColor=C.b}/>
                <button onClick={()=>doAnalyze(aTk)} style={{padding:"10px 20px",borderRadius:6,border:"none",background:C.mint,color:"#000",fontFamily:M,fontSize:11,fontWeight:700,cursor:"pointer"}}>→ Analyze</button>
              </div>

              {aLoading&&<div style={{textAlign:"center",padding:"40px",fontFamily:M,fontSize:12,color:C.ts}}>Analyzing {aTk}...</div>}

              {!aLoading&&!aData&&<div style={{textAlign:"center",padding:"50px",background:C.card,borderRadius:8,border:`1px solid ${C.b}`}}>
                <div style={{fontSize:24,color:C.lav,opacity:.3,marginBottom:8}}>◎</div>
                <div style={{fontSize:14,fontWeight:600,marginBottom:4}}>Deep Ticker Analysis</div>
                <div style={{fontSize:12,color:C.tm}}>Enter any ticker for full research — financials, earnings, analyst ratings, insider activity, valuation, price outlook</div>
              </div>}

              {aData&&(()=>{
                const d=aData;
                const pr=d.profile||{};
                const px=d.price||{};
                const fin=d.financials||{};
                const earn=d.earnings||{};
                const an=d.analysts||{};
                const ins=d.insiders||{};
                const val=d.valuation||{};
                const div=d.dividend||{};
                const rt=d.rating||{};
                const ol=d.outlook||{};
                const at=d.atlas_score||{};
                const sc=fin.scorecard||[];
                const rtColor=rt.overall==="BUY"?C.grn:rt.overall==="SELL"?C.red:C.warn;
                const fmtB=v=>{if(!v)return"—";if(v>=1e12)return"$"+(v/1e12).toFixed(1)+"T";if(v>=1e9)return"$"+(v/1e9).toFixed(1)+"B";if(v>=1e6)return"$"+(v/1e6).toFixed(0)+"M";return"$"+v.toLocaleString()};
                const stColor=s=>s==="good"?C.grn:s==="warn"?C.warn:s==="bad"?C.red:C.ts;

                return(<>
                  {/* ═══ IDENTITY ROW ═══ */}
                  <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:8,padding:"14px 18px",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                        <span style={{fontSize:20,fontWeight:700}}>{pr.name||d.ticker}</span>
                        <span style={{fontFamily:M,fontSize:11,color:C.ts}}>{d.ticker}</span>
                        <span style={{fontFamily:M,fontSize:9,color:C.tm,background:C.bL,padding:"2px 6px",borderRadius:3}}>{pr.exchange}</span>
                        <span style={{fontFamily:M,fontSize:9,color:C.tm,background:C.bL,padding:"2px 6px",borderRadius:3}}>{pr.sector}</span>
                      </div>
                      <div style={{fontSize:11,color:C.ts,maxWidth:500}}>{pr.description}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontFamily:M,fontSize:24,fontWeight:700}}>{px.current?"$"+px.current.toLocaleString():"—"}</div>
                      <div style={{fontFamily:M,fontSize:12,color:dc(px.change_pct||0)}}>{px.change_pct>0?"▲":"▼"} {Math.abs(px.change_pct||0).toFixed(2)}% ({px.change>0?"+":""}{(px.change||0).toFixed(2)})</div>
                      <div style={{fontFamily:M,fontSize:10,color:C.tm,marginTop:4}}>Mkt Cap {fmtB(pr.market_cap)}</div>
                    </div>
                  </div>

                  {/* ═══ 52-WEEK RANGE + RATING ═══ */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:10,marginBottom:10}}>
                    <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:8,padding:"10px 16px"}}>
                      <div style={{fontFamily:M,fontSize:9,color:C.tm,marginBottom:6}}>52-WEEK RANGE</div>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <span style={{fontFamily:M,fontSize:10,color:C.red}}>${px.low_52w||"—"}</span>
                        <div style={{flex:1,height:6,background:C.bL,borderRadius:3,position:"relative"}}>
                          <div style={{position:"absolute",left:`${px.range_pct||50}%`,top:-2,width:10,height:10,borderRadius:"50%",background:C.mint,border:`2px solid ${C.bg}`,transform:"translateX(-50%)"}}/>
                          <div style={{height:6,width:`${px.range_pct||50}%`,background:`linear-gradient(90deg,${C.red}44,${C.grn}44)`,borderRadius:3}}/>
                        </div>
                        <span style={{fontFamily:M,fontSize:10,color:C.grn}}>${px.high_52w||"—"}</span>
                      </div>
                      <div style={{fontFamily:M,fontSize:9,color:C.ts,marginTop:4,textAlign:"center"}}>{px.range_pct||"—"}% from 52w low</div>
                    </div>
                    <div style={{background:rtColor+"15",border:`1px solid ${rtColor}33`,borderRadius:8,padding:"12px 24px",textAlign:"center",minWidth:140}}>
                      <div style={{fontFamily:M,fontSize:9,color:C.tm,marginBottom:4}}>OVERALL RATING</div>
                      <div style={{fontFamily:M,fontSize:28,fontWeight:700,color:rtColor}}>{rt.overall||"—"}</div>
                      <div style={{fontFamily:M,fontSize:10,color:C.ts}}>Confidence {rt.confidence||0}%</div>
                    </div>
                  </div>

                  {/* ═══ MIDDLE: 3 COLUMNS ═══ */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                    {/* Financials Scorecard */}
                    <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:8,padding:"10px 14px"}}>
                      <div style={{fontFamily:M,fontSize:9,color:C.tm,letterSpacing:1,marginBottom:8}}>FINANCIALS</div>
                      {sc.length>0?sc.map((s,i)=>(
                        <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",borderBottom:i<sc.length-1?`1px solid ${C.bL}`:"none"}}>
                          <span style={{fontSize:11,color:C.ts}}>{s.name}</span>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontFamily:M,fontSize:11,fontWeight:600,color:stColor(s.status)}}>{s.value}</span>
                            <span style={{fontSize:10,color:stColor(s.status)}}>{s.status==="good"?"✓":s.status==="warn"?"◐":"✗"}</span>
                          </div>
                        </div>
                      )):<div style={{fontFamily:M,fontSize:10,color:C.tm}}>No financial data</div>}
                    </div>

                    {/* Earnings */}
                    <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:8,padding:"10px 14px"}}>
                      <div style={{fontFamily:M,fontSize:9,color:C.tm,letterSpacing:1,marginBottom:8}}>EARNINGS</div>
                      {earn.next_date&&<div style={{fontFamily:M,fontSize:10,color:C.warn,marginBottom:6,padding:"3px 6px",background:C.warn+"12",borderRadius:3,display:"inline-block"}}>Next: {earn.next_date}</div>}
                      <div style={{fontFamily:M,fontSize:11,color:C.ts,marginBottom:8}}>{earn.beats||0}/{earn.total||0} beats last {earn.total||0} quarters</div>
                      {(earn.history||[]).map((q,i)=>(
                        <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:i<(earn.history||[]).length-1?`1px solid ${C.bL}`:"none"}}>
                          <span style={{fontFamily:M,fontSize:10,color:C.tm}}>{(q.date||"").slice(0,7)}</span>
                          <span style={{fontFamily:M,fontSize:10}}>${q.actual}</span>
                          <span style={{fontFamily:M,fontSize:10,color:C.tm}}>est ${q.estimated}</span>
                          <span style={{fontFamily:M,fontSize:10,fontWeight:600,color:q.beat?C.grn:C.red}}>{q.beat?"BEAT":"MISS"} {q.surprise>0?"+":""}{q.surprise}%</span>
                        </div>
                      ))}
                    </div>

                    {/* Analysts & Insiders */}
                    <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:8,padding:"10px 14px"}}>
                      <div style={{fontFamily:M,fontSize:9,color:C.tm,letterSpacing:1,marginBottom:8}}>ANALYSTS & INSIDERS</div>
                      {an.total>0&&<>
                        <div style={{display:"flex",gap:4,marginBottom:6}}>
                          <div style={{flex:an.buy,height:8,background:C.grn,borderRadius:"3px 0 0 3px"}}/>
                          <div style={{flex:an.hold,height:8,background:C.warn}}/>
                          <div style={{flex:an.sell,height:8,background:C.red,borderRadius:"0 3px 3px 0"}}/>
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",fontFamily:M,fontSize:10,marginBottom:4}}>
                          <span style={{color:C.grn}}>{an.buy} Buy</span>
                          <span style={{color:C.warn}}>{an.hold} Hold</span>
                          <span style={{color:C.red}}>{an.sell} Sell</span>
                        </div>
                      </>}
                      {an.target_median&&<div style={{fontFamily:M,fontSize:11,color:C.ts,padding:"4px 0",borderTop:`1px solid ${C.bL}`}}>
                        Target <b style={{color:C.txt}}>${an.target_median}</b> {an.upside&&<span style={{color:an.upside>0?C.grn:C.red}}>({an.upside>0?"+":""}{an.upside}%)</span>}
                      </div>}
                      {an.target_high&&<div style={{fontFamily:M,fontSize:9,color:C.tm}}>Range ${an.target_low} — ${an.target_high}</div>}

                      <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${C.bL}`}}>
                        <div style={{fontFamily:M,fontSize:9,color:C.tm,marginBottom:4}}>INSIDER ACTIVITY (90D)</div>
                        <div style={{display:"flex",gap:12,fontFamily:M,fontSize:11}}>
                          <span style={{color:C.grn}}>{ins.buys_90d||0} Buys</span>
                          <span style={{color:C.red}}>{ins.sells_90d||0} Sells</span>
                          <span style={{color:ins.signal==="BULLISH"?C.grn:ins.signal==="NEGATIVE"?C.red:C.ts,fontWeight:600}}>{ins.signal||"—"}</span>
                        </div>
                        {(ins.recent||[]).slice(0,2).map((r,i)=>(
                          <div key={i} style={{fontFamily:M,fontSize:9,color:C.tm,marginTop:2}}>{r.name} · {r.type} · {r.date}</div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* ═══ BOTTOM: Valuation + Outlook ═══ */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    {/* Valuation & Dividend */}
                    <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:8,padding:"10px 14px"}}>
                      <div style={{fontFamily:M,fontSize:9,color:C.tm,letterSpacing:1,marginBottom:8}}>VALUATION</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
                        <div style={{textAlign:"center"}}><div style={{fontFamily:M,fontSize:9,color:C.tm}}>P/E Now</div><div style={{fontFamily:M,fontSize:15,fontWeight:700}}>{val.pe||"—"}</div></div>
                        <div style={{textAlign:"center"}}><div style={{fontFamily:M,fontSize:9,color:C.tm}}>P/E 5Y Avg</div><div style={{fontFamily:M,fontSize:15,fontWeight:700}}>{val.pe_5y_avg||"—"}</div></div>
                        <div style={{textAlign:"center"}}><div style={{fontFamily:M,fontSize:9,color:C.tm}}>PEG</div><div style={{fontFamily:M,fontSize:15,fontWeight:700}}>{val.peg||"—"}</div></div>
                      </div>
                      <div style={{textAlign:"center",padding:"4px 8px",borderRadius:4,background:val.status==="UNDERVALUED"?C.grnD:val.status==="OVERVALUED"?C.redD:C.bL,fontFamily:M,fontSize:10,fontWeight:600,color:val.status==="UNDERVALUED"?C.grn:val.status==="OVERVALUED"?C.red:C.ts,marginBottom:8}}>{val.status||"—"}</div>
                      <div style={{borderTop:`1px solid ${C.bL}`,paddingTop:8}}>
                        <div style={{fontFamily:M,fontSize:9,color:C.tm,marginBottom:4}}>DIVIDEND</div>
                        {div.pays?<div style={{fontFamily:M,fontSize:11}}>${div.annual}/yr · <span style={{color:C.mint}}>{div.yield}% yield</span></div>:<div style={{fontFamily:M,fontSize:10,color:C.tm}}>No dividend</div>}
                      </div>
                    </div>

                    {/* Price Outlook */}
                    <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:8,padding:"10px 14px"}}>
                      <div style={{fontFamily:M,fontSize:9,color:C.tm,letterSpacing:1,marginBottom:8}}>PRICE OUTLOOK</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                        <div style={{background:C.sf,border:`1px solid ${C.bL}`,borderRadius:6,padding:"8px 10px",textAlign:"center"}}>
                          <div style={{fontFamily:M,fontSize:9,color:C.tm}}>1 YEAR</div>
                          <div style={{fontFamily:M,fontSize:18,fontWeight:700,color:ol.return_1y>0?C.grn:C.red}}>${ol.price_1y||"—"}</div>
                          <div style={{fontFamily:M,fontSize:10,color:ol.return_1y>0?C.grn:C.red}}>{ol.return_1y>0?"+":""}{ol.return_1y||0}%</div>
                        </div>
                        <div style={{background:C.sf,border:`1px solid ${C.bL}`,borderRadius:6,padding:"8px 10px",textAlign:"center"}}>
                          <div style={{fontFamily:M,fontSize:9,color:C.tm}}>5 YEAR</div>
                          <div style={{fontFamily:M,fontSize:18,fontWeight:700,color:ol.return_5y>0?C.grn:C.red}}>${ol.price_5y||"—"}</div>
                          <div style={{fontFamily:M,fontSize:10,color:ol.return_5y>0?C.grn:C.red}}>{ol.return_5y>0?"+":""}{ol.return_5y||0}%</div>
                        </div>
                      </div>
                      <div style={{fontFamily:M,fontSize:9,color:C.tm}}>Based on {ol.basis||"available data"}</div>
                      {at.signal&&<div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${C.bL}`}}>
                        <div style={{fontFamily:M,fontSize:9,color:C.tm,marginBottom:4}}>ATLAS TECHNICAL</div>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <Pill sig={at.signal}/>
                          <span style={{fontFamily:M,fontSize:11}}>Score {at.tech_score}/100</span>
                        </div>
                        <div style={{fontFamily:S,fontSize:10,color:C.ts,marginTop:4}}>{at.reason}</div>
                      </div>}
                    </div>
                  </div>
                </>);
              })()}
            </div>
          )}

          {page==="guide"&&(
            <div style={{animation:"fadeIn .2s"}}>
              <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:8,padding:"14px 18px",marginBottom:10}}>
                <div style={{fontSize:15,fontWeight:700,color:C.mint,marginBottom:8}}>What is ATLAS?</div>
                <div style={{fontSize:13,color:C.ts,lineHeight:1.8}}>
                  A two-engine trading system. <b style={{color:C.txt}}>Setup Quality</b> (10 rules, 4 tiers) checks if conditions are right.
                  <b style={{color:C.txt}}> Conviction Score</b> decides how much to bet. Both must align for a Strong Buy.
                </div>
              </div>
              <div style={{fontFamily:M,fontSize:10,color:C.tm,letterSpacing:1,marginBottom:6}}>SIGNAL REFERENCE</div>
              {[{s:"STRONG BUY",d:"Both engines aligned. Maximum conviction. Full position."},{s:"BUY",d:"Good setup, moderate conviction. Standard position."},{s:"FORMING",d:"Setup building. 55-74%. Check back in 1-2 days."},{s:"SKIP",d:"Hard rules failed. Do not trade."}].map((x,i)=>(
                <div key={i} style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:6,padding:"8px 14px",marginBottom:4,display:"flex",alignItems:"center",gap:12}}>
                  <div style={{minWidth:120}}><Pill sig={x.s}/></div>
                  <span style={{fontSize:12,color:C.ts}}>{x.d}</span>
                </div>
              ))}
            </div>
          )}

          {page==="settings"&&(
            <div style={{animation:"fadeIn .2s",textAlign:"center",padding:"50px"}}>
              <div style={{fontSize:28,color:C.ts,opacity:.3,marginBottom:10}}>⚙</div>
              <div style={{fontSize:14,fontWeight:600,marginBottom:4}}>Settings</div>
              <div style={{fontSize:12,color:C.tm}}>Themes, font sizes, API keys, preferences</div>
              <div style={{fontFamily:M,fontSize:10,color:C.ts,marginTop:10}}>Coming next update</div>
            </div>
          )}

          <div style={{marginTop:20,textAlign:"center",fontFamily:M,fontSize:8,color:C.tm,letterSpacing:2}}>ATLAS v7 · 14-RULE ENGINE · NOT FINANCIAL ADVICE</div>
        </div>
      </div>
    </div>
  );
}
