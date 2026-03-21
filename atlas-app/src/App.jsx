import React, { useState, useEffect, useCallback, useRef } from "react";
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


const THEMES={
  atlas:{
    bg:"#0B0E13",sf:"#10141C",card:"#151A24",b:"#1E2530",bH:"#2A3345",bL:"#171D2A",
    mint:"#7DFFC3",mintD:"rgba(125,255,195,0.06)",grn:"#4ADE80",grnD:"rgba(74,222,128,0.06)",
    red:"#FF6B81",redD:"rgba(255,107,129,0.06)",lav:"#B4A0FF",
    txt:"#E8E8F0",ts:"#8892A4",tm:"#4A5568",warn:"#FBBF24",
    sb:"#0A0D12",sbA:"#141B26",
    name:"ATLAS Dark",
  },
  nft:{
    bg:"#0A0A0A",sf:"#111111",card:"#181818",b:"#242424",bH:"#303030",bL:"#141414",
    mint:"#D0FF00",mintD:"rgba(208,255,0,0.06)",grn:"#D0FF00",grnD:"rgba(208,255,0,0.06)",
    red:"#FF4444",redD:"rgba(255,68,68,0.06)",lav:"#8116E0",
    txt:"#FEFFFC",ts:"#888888",tm:"#555555",warn:"#FFB800",
    sb:"#050505",sbA:"#181818",
    name:"NFT Vibe",
  },
  chrome:{
    bg:"#071526",sf:"#0D1E35",card:"#122440",b:"#1A3050",bH:"#223D63",bL:"#0D1E35",
    mint:"#F28D52",mintD:"rgba(242,141,82,0.06)",grn:"#BDD9F2",grnD:"rgba(189,217,242,0.06)",
    red:"#F28D52",redD:"rgba(242,141,82,0.06)",lav:"#5A6B8C",
    txt:"#F2F2F2",ts:"#8A9BAC",tm:"#5A6B7C",warn:"#F2C94C",
    sb:"#040E1A",sbA:"#0D1E35",
    name:"Chrome Steel",
  },
};

function TVChart({ticker,C}){
  const ref=useRef(null);
  const scriptRef=useRef(null);
  useEffect(()=>{
    if(!ref.current||!ticker)return;
    ref.current.innerHTML="";
    if(scriptRef.current){scriptRef.current.remove();scriptRef.current=null;}
    const containerId="tv_"+Math.random().toString(36).slice(2);
    ref.current.id=containerId;
    const script=document.createElement("script");
    script.src="https://s3.tradingview.com/tv.js";
    script.async=true;
    script.onload=()=>{
      if(window.TradingView&&ref.current){
        new window.TradingView.widget({
          autosize:true,symbol:ticker,interval:"D",timezone:"America/New_York",
          theme:"dark",style:"1",locale:"en",toolbar_bg:C.bg,
          enable_publishing:false,hide_top_toolbar:false,hide_legend:false,save_image:false,
          backgroundColor:C.bg,gridColor:"rgba(30,37,48,0.8)",container_id:containerId,
          studies:["RSI@tv-basicstudies","MASimple@tv-basicstudies"],
          overrides:{
            "paneProperties.background":C.bg,"paneProperties.backgroundType":"solid",
            "scalesProperties.textColor":C.ts,
            "mainSeriesProperties.candleStyle.upColor":C.grn,
            "mainSeriesProperties.candleStyle.downColor":C.red,
            "mainSeriesProperties.candleStyle.borderUpColor":C.grn,
            "mainSeriesProperties.candleStyle.borderDownColor":C.red,
            "mainSeriesProperties.candleStyle.wickUpColor":C.grn,
            "mainSeriesProperties.candleStyle.wickDownColor":C.red,
          },
        });
      }
    };
    document.head.appendChild(script);
    scriptRef.current=script;
    return()=>{if(scriptRef.current){scriptRef.current.remove();scriptRef.current=null;}};
  },[ticker]);
  return<div ref={ref} style={{width:"100%",height:"100%"}}/>;
}

// ═══════════════════════════════════════════════════════════
export default function App(){
  const[page,setPage]=useState("radar");
  const[scan,setScan]=useState("STOCKS");
  const[sel,setSel]=useState(0);
  const[tab,setTab]=useState("plan");
  const[capital,setCapital]=useState(3500);
  const[chartTk,setChartTk]=useState("");
  const[chartInput,setChartInput]=useState("");
  const[theme,setTheme]=useState(()=>localStorage.getItem("atlasTheme")||"atlas");
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

  useEffect(()=>{load();doScan(scan);const i=setInterval(load,300000);return()=>clearInterval(i)},[]);
  useEffect(()=>{doScan(scan)},[scan]);

  const C=THEMES[theme]||THEMES.atlas;
  const saveTheme=t=>{setTheme(t);try{localStorage.setItem("atlasTheme",t)}catch(e){}};
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
            <div style={{animation:"fadeIn .2s",display:"flex",flexDirection:"column",height:"calc(100vh - 112px)"}}>
              <div style={{display:"flex",gap:8,marginBottom:10,alignItems:"center"}}>
                <input value={chartInput} onChange={e=>setChartInput(e.target.value.toUpperCase())} onKeyDown={e=>{if(e.key==="Enter"&&chartInput.trim())setChartTk(chartInput.trim())}} placeholder="Enter ticker — NVDA, AAPL, BTC, ETH..." style={{flex:1,maxWidth:380,padding:"9px 14px",borderRadius:6,background:C.card,border:`1px solid ${C.b}`,color:C.txt,fontFamily:M,fontSize:12,fontWeight:600,letterSpacing:"0.04em",outline:"none"}} onFocus={e=>e.target.style.borderColor=C.mint} onBlur={e=>e.target.style.borderColor=C.b}/>
                <button onClick={()=>{if(chartInput.trim())setChartTk(chartInput.trim())}} style={{padding:"9px 20px",borderRadius:6,border:"none",background:C.mint,color:"#000",fontFamily:M,fontSize:11,fontWeight:700,cursor:"pointer"}}>→ Load Chart</button>
                <div style={{display:"flex",gap:5,marginLeft:8}}>
                  {["NVDA","AAPL","MSFT","BTC","ETH","SPY"].map(tk=>(
                    <button key={tk} onClick={()=>{setChartInput(tk);setChartTk(tk);}} style={{padding:"5px 10px",borderRadius:5,border:`1px solid ${chartTk===tk?C.mint+"55":C.b}`,background:chartTk===tk?C.mintD:"transparent",color:chartTk===tk?C.mint:C.tm,fontFamily:M,fontSize:9,fontWeight:600,cursor:"pointer"}}>{tk}</button>
                  ))}
                </div>
              </div>
              {!chartTk?(
                <div style={{flex:1,background:C.card,border:`1px solid ${C.b}`,borderRadius:8,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12}}>
                  <div style={{fontSize:36,color:C.mint,opacity:.15}}>◻</div>
                  <div style={{fontSize:14,fontWeight:600,color:C.txt}}>Chart Station</div>
                  <div style={{fontSize:12,color:C.tm}}>Enter a ticker above or pick a quick symbol</div>
                  <div style={{display:"flex",gap:8,marginTop:8}}>
                    {["NVDA","AAPL","BTC","ETH"].map(tk=>(
                      <button key={tk} onClick={()=>{setChartInput(tk);setChartTk(tk);}} style={{padding:"8px 16px",borderRadius:6,border:`1px solid ${C.b}`,background:C.sf,color:C.ts,fontFamily:M,fontSize:11,fontWeight:600,cursor:"pointer"}}>{tk}</button>
                    ))}
                  </div>
                </div>
              ):(
                <div style={{flex:1,background:C.card,border:`1px solid ${C.b}`,borderRadius:8,overflow:"hidden",position:"relative"}}>
                  <div style={{position:"absolute",top:10,left:14,zIndex:10,display:"flex",alignItems:"center",gap:8,pointerEvents:"none"}}>
                    <span style={{fontFamily:M,fontSize:11,fontWeight:700,color:C.mint,background:C.bg+"CC",padding:"2px 8px",borderRadius:4}}>{chartTk}</span>
                    <span style={{fontFamily:M,fontSize:9,color:C.tm,background:C.bg+"CC",padding:"2px 6px",borderRadius:4}}>TradingView · Interactive</span>
                  </div>
                  <TVChart ticker={chartTk} C={C}/>
                </div>
              )}
            </div>
          )}

          {page==="outlook"&&(
            <div style={{animation:"fadeIn .2s",textAlign:"center",padding:"50px"}}>
              <div style={{fontSize:28,color:C.lav,opacity:.3,marginBottom:10}}>◎</div>
              <div style={{fontSize:14,fontWeight:600,marginBottom:4}}>Ticker Outlook</div>
              <div style={{fontSize:12,color:C.tm}}>Scenario analysis — bull / base / bear price ranges</div>
              <div style={{fontFamily:M,fontSize:10,color:C.ts,marginTop:10}}>Coming next update</div>
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
            <div style={{animation:"fadeIn .2s",maxWidth:700}}>
              <div style={{fontFamily:M,fontSize:9,color:C.tm,letterSpacing:1.5,marginBottom:16}}>APPEARANCE · COLOR THEME</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:24}}>
                {Object.entries(THEMES).map(([id,t])=>{
                  const active=theme===id;
                  return(
                    <div key={id} onClick={()=>saveTheme(id)} style={{background:t.bg,border:`2px solid ${active?t.mint:t.b}`,borderRadius:10,overflow:"hidden",cursor:"pointer",transition:"border-color .2s"}}>
                      {/* Mini preview header */}
                      <div style={{background:t.sf,padding:"8px 12px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${t.b}`}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <div style={{width:14,height:14,background:t.mint,borderRadius:3,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,color:"#000",fontWeight:800}}>◈</div>
                          <span style={{fontFamily:M,fontSize:9,fontWeight:700,color:t.txt}}>ATLAS</span>
                        </div>
                        {active&&<span style={{fontFamily:M,fontSize:7,color:t.mint,background:t.mintD,border:`1px solid ${t.mint}44`,borderRadius:2,padding:"1px 5px",letterSpacing:.5}}>ACTIVE</span>}
                      </div>
                      {/* Mini preview body */}
                      <div style={{padding:"10px 12px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                          <span style={{fontFamily:M,fontSize:13,fontWeight:700,color:t.txt}}>NVDA</span>
                          <span style={{fontFamily:M,fontSize:7,padding:"2px 6px",borderRadius:3,background:t.mint,color:"#000",fontWeight:700}}>BUY</span>
                        </div>
                        <div style={{fontFamily:M,fontSize:11,color:t.mint,marginBottom:8}}>$872.50</div>
                        {/* Mini sparkline */}
                        <div style={{display:"flex",gap:2,alignItems:"flex-end",height:24,marginBottom:8}}>
                          {[40,55,35,62,45,70,52,65,42,60].map((h,i)=>(
                            <div key={i} style={{flex:1,height:`${h}%`,background:t.mint,borderRadius:"1px 1px 0 0",opacity:.7}}/>
                          ))}
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",fontFamily:M,fontSize:8}}>
                          <span style={{color:t.ts}}>RSI <b style={{color:t.txt}}>68</b></span>
                          <span style={{color:t.ts}}>Score <b style={{color:t.lav}}>76</b></span>
                        </div>
                      </div>
                      {/* Theme name */}
                      <div style={{padding:"6px 12px",borderTop:`1px solid ${t.b}`,background:t.sf}}>
                        <div style={{fontFamily:M,fontSize:9,fontWeight:700,color:active?t.mint:t.ts,letterSpacing:.5}}>{t.name}</div>
                      </div>
                      {/* Color dots */}
                      <div style={{display:"flex",gap:4,padding:"6px 12px",background:t.bg}}>
                        {[t.mint,t.grn,t.red,t.lav,t.ts].map((c,i)=>(
                          <div key={i} style={{width:8,height:8,borderRadius:"50%",background:c}}/>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:8,padding:"12px 16px"}}>
                <div style={{fontFamily:M,fontSize:9,color:C.tm,letterSpacing:1,marginBottom:4}}>CURRENT THEME</div>
                <div style={{fontFamily:M,fontSize:13,fontWeight:700,color:C.mint}}>{THEMES[theme].name}</div>
                <div style={{fontFamily:M,fontSize:10,color:C.ts,marginTop:4}}>Theme is saved in your browser and persists across sessions.</div>
              </div>
            </div>
          )}

          <div style={{marginTop:20,textAlign:"center",fontFamily:M,fontSize:8,color:C.tm,letterSpacing:2}}>ATLAS v7 · 14-RULE ENGINE · NOT FINANCIAL ADVICE</div>
        </div>
      </div>
    </div>
  );
}
