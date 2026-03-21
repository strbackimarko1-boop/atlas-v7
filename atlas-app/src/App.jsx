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

// ── AtlasStonks ──────────────────────────────────────────────
function ScoreRing({score,C,M}){
  const pct=Math.max(0,Math.min(100,score||0));
  const r=40,ci=2*Math.PI*r,dash=(pct/100)*ci;
  const color=pct>=70?C.mint:pct>=45?C.lav:C.red;
  return(
    <div style={{position:"relative",width:100,height:100,flexShrink:0}}>
      <svg width={100} height={100} style={{transform:"rotate(-90deg)"}}>
        <circle cx={50} cy={50} r={r} fill="none" stroke={C.b} strokeWidth={6}/>
        <circle cx={50} cy={50} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={`${dash} ${ci-dash}`} strokeLinecap="round"
          style={{transition:"stroke-dasharray .8s"}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
        <span style={{fontFamily:M,fontSize:20,fontWeight:700,color}}>{Math.round(pct)}</span>
        <span style={{fontSize:8,color:C.tm,letterSpacing:"0.1em"}}>SCORE</span>
      </div>
    </div>
  );
}

function AtlasStonks({C,M,S,fmt,pf,dc,api}){
  const[query,setQuery]=useState("");
  const[ticker,setTicker]=useState(null);
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState(null);
  const[sd,setSd]=useState(null);
  const[candles,setCandles]=useState(null);

  const run=useCallback(async sym=>{
    const t=sym.toUpperCase().trim();
    setTicker(t);setLoading(true);setError(null);setSd(null);setCandles(null);
    try{
      const[score,chart]=await Promise.all([
        api("/api/score/"+t),
        api("/api/chart/"+t+"?period=6mo"),
      ]);
      if(!score)throw new Error("No data for "+t);
      setSd(score);
      setCandles(chart?.candles||chart?.data||null);
    }catch(e){setError(e.message);}
    finally{setLoading(false);}
  },[]);

  const submit=e=>{e.preventDefault();if(query.trim())run(query.trim());};

  // Derived
  const price=sd?.price;
  const signal=sd?.signal;
  const totalScore=sd?.total_score??sd?.score??0;
  const tiers=sd?.tiers||{};
  const catalyst=sd?.catalyst||{};
  const tech=sd?.technicals||sd?.tech||{};
  const fund=sd?.fundamentals||sd?.fund||{};

  // Scenarios
  const sf=totalScore/100;
  const bullTgt=price?price*(1+0.10+sf*0.08):null;
  const baseTgt=price?price*(1+0.04+sf*0.04):null;
  const bearTgt=price?price*(1-0.07):null;
  const bullPct=price&&bullTgt?((bullTgt-price)/price)*100:null;
  const basePct=price&&baseTgt?((baseTgt-price)/price)*100:null;
  const bearPct=price&&bearTgt?((bearTgt-price)/price)*100:null;
  const bullProb=Math.round(25+sf*30);
  const baseProb=Math.round(40-sf*5);
  const bearProb=100-bullProb-baseProb;

  // Verdict
  const verdict=()=>{
    if(!sd||!signal)return null;
    const sig=signal.toUpperCase();
    const sc=Math.round(totalScore);
    const cat=catalyst.summary||"";
    let v=`${ticker} scores ${sc}/100. `;
    if(sig.includes("STRONG BUY"))v+=`High-conviction setup — regime, timing and edge all aligned. ${cat} Risk/reward favors a full position within ATLAS parameters.`;
    else if(sig.includes("BUY"))v+=`Constructive setup. Conditions are favorable but not pristine. Standard sizing with disciplined stops. ${cat}`;
    else if(sig.includes("FORMING"))v+=`Setup is still building — confirmation is pending. Watch, do not act yet. ${cat}`;
    else v+=`Not trade-ready. Macro or technical filters are failing. Stand down and preserve capital until conditions improve.`;
    return v;
  };

  const sigColor=sig=>{
    if(!sig)return C.tm;
    const s=sig.toUpperCase();
    if(s.includes("STRONG BUY"))return C.mint;
    if(s.includes("BUY"))return C.grn;
    if(s.includes("FORMING"))return C.lav;
    return C.red;
  };

  const Row=({label,val,color})=>(
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.bL}`}}>
      <span style={{fontSize:11,color:C.ts}}>{label}</span>
      <span style={{fontFamily:M,fontSize:12,fontWeight:600,color:color||C.txt}}>{val}</span>
    </div>
  );

  const ScenBar=({label,tgt,pct,prob,color})=>(
    <div style={{marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
        <span style={{fontSize:11,fontWeight:600,color,letterSpacing:"0.06em"}}>{label}</span>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <span style={{fontFamily:M,fontSize:12,color}}>{tgt!=null?fmt(tgt):"—"}</span>
          <span style={{fontFamily:M,fontSize:10,color:C.ts}}>{pct!=null?(pct>=0?"+":"")+pct.toFixed(1)+"%":"—"}</span>
          <span style={{fontFamily:M,fontSize:9,color,background:color+"18",border:`1px solid ${color}33`,borderRadius:3,padding:"1px 5px"}}>{prob}%</span>
        </div>
      </div>
      <div style={{height:3,background:C.bL,borderRadius:2,overflow:"hidden"}}>
        <div style={{width:`${prob}%`,height:"100%",background:color,borderRadius:2,transition:"width .6s"}}/>
      </div>
    </div>
  );

  // Mini SVG chart
  const MiniChart=({data})=>{
    if(!data||data.length<2)return null;
    const W=800,H=160;
    const prices=data.map(c=>c.close);
    const mn=Math.min(...prices)*0.997,mx=Math.max(...prices)*1.003,rng=mx-mn||1;
    const pad={t:8,b:20,l:2,r:2};
    const iw=W-pad.l-pad.r,ih=H-pad.t-pad.b;
    const tx=i=>pad.l+(i/(data.length-1))*iw;
    const ty=v=>pad.t+ih-((v-mn)/rng)*ih;
    const pts=data.map((c,i)=>`${tx(i)},${ty(c.close)}`).join(" ");
    const area=`${pad.l},${pad.t+ih} ${pts} ${tx(data.length-1)},${pad.t+ih}`;
    const ma20=data.map((_,i)=>{
      if(i<19)return null;
      const avg=data.slice(i-19,i+1).reduce((s,c)=>s+c.close,0)/20;
      return`${tx(i)},${ty(avg)}`;
    }).filter(Boolean).join(" ");
    const step=Math.max(1,Math.floor(data.length/6));
    const labels=data.filter((_,i)=>i%step===0);
    return(
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{display:"block"}}>
        <defs>
          <linearGradient id="ascg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.mint} stopOpacity={.18}/>
            <stop offset="100%" stopColor={C.mint} stopOpacity={0}/>
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#ascg)"/>
        <polyline points={pts} fill="none" stroke={C.mint} strokeWidth={1.6}/>
        {ma20&&<polyline points={ma20} fill="none" stroke={C.lav} strokeWidth={1.1} strokeDasharray="5,4"/>}
        {labels.map((c,ii)=>{
          const i=data.indexOf(c);
          return<text key={ii} x={tx(i)} y={H-4} fill={C.tm} fontSize={8} fontFamily={M} textAnchor="middle">{c.date?c.date.slice(5):""}</text>;
        })}
      </svg>
    );
  };

  return(
    <div style={{animation:"fadeIn .2s"}}>

      {/* Header */}
      <div style={{marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:3}}>
          <span style={{fontSize:16,fontWeight:700,letterSpacing:-.3}}>AtlasStonks</span>
          <span style={{fontFamily:M,fontSize:9,color:C.mint,background:C.mintD,border:`1px solid ${C.mint}30`,borderRadius:3,padding:"2px 7px",letterSpacing:"0.12em"}}>DEEP TICKER ANALYSIS</span>
        </div>
        <div style={{fontFamily:M,fontSize:10,color:C.tm}}>Technical · Fundamental · Scenario · Verdict</div>
      </div>

      {/* Search */}
      <form onSubmit={submit} style={{display:"flex",gap:8,marginBottom:16,maxWidth:440}}>
        <input
          value={query} onChange={e=>setQuery(e.target.value.toUpperCase())}
          placeholder="AAPL, BTC, NVDA, ETH…" autoFocus
          style={{flex:1,padding:"9px 14px",borderRadius:6,background:C.card,border:`1px solid ${C.b}`,
            color:C.txt,fontFamily:M,fontSize:13,fontWeight:600,letterSpacing:"0.05em",outline:"none",caretColor:C.mint}}
          onFocus={e=>e.target.style.borderColor=C.mint}
          onBlur={e=>e.target.style.borderColor=C.b}
        />
        <button type="submit" disabled={loading||!query.trim()} style={{
          padding:"0 18px",borderRadius:6,border:"none",cursor:loading||!query.trim()?"not-allowed":"pointer",
          background:loading||!query.trim()?C.b:C.mint,
          color:loading||!query.trim()?C.tm:"#000",
          fontFamily:S,fontSize:12,fontWeight:700,transition:"all .2s",whiteSpace:"nowrap",
        }}>{loading?"Scanning…":"→ Analyze"}</button>
      </form>

      {/* Error */}
      {error&&(
        <div style={{background:C.redD,border:`1px solid ${C.red}33`,borderRadius:6,padding:"10px 14px",marginBottom:12,fontFamily:M,fontSize:11,color:C.red}}>⚠ {error}</div>
      )}

      {/* Empty */}
      {!loading&&!sd&&!error&&(
        <div style={{textAlign:"center",padding:"60px 0",color:C.tm}}>
          <div style={{fontSize:28,opacity:.2,marginBottom:8}}>◎</div>
          <div style={{fontFamily:M,fontSize:10,letterSpacing:"0.12em"}}>ENTER A TICKER TO BEGIN</div>
        </div>
      )}

      {/* Loading */}
      {loading&&(
        <div style={{textAlign:"center",padding:"60px 0"}}>
          <div style={{fontSize:24,color:C.mint,opacity:.4,marginBottom:8,animation:"pulse 1s infinite"}}>◈</div>
          <div style={{fontFamily:M,fontSize:10,color:C.ts,letterSpacing:"0.1em"}}>SCANNING {ticker}…</div>
        </div>
      )}

      {/* Results */}
      {!loading&&sd&&(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>

          {/* Hero strip */}
          <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:8,padding:"12px 16px",display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
            <ScoreRing score={totalScore} C={C} M={M}/>
            <div style={{flex:1,minWidth:180}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                <span style={{fontFamily:M,fontSize:22,fontWeight:700}}>{ticker}</span>
                {signal&&<span style={{fontFamily:M,fontSize:9,fontWeight:600,letterSpacing:".8px",padding:"3px 9px",borderRadius:4,
                  background:sigColor(signal)+(signal?.toUpperCase().includes("STRONG")?"":"18"),
                  color:signal?.toUpperCase().includes("STRONG BUY")?"#000":sigColor(signal),
                  border:`1px solid ${sigColor(signal)}44`}}>{signal.toUpperCase()}</span>}
              </div>
              <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
                {price!=null&&<div><div style={{fontFamily:M,fontSize:9,color:C.tm,marginBottom:2}}>PRICE</div><div style={{fontFamily:M,fontSize:18,fontWeight:700,color:C.mint}}>{fmt(price)}</div></div>}
                {sd.change!=null&&<div><div style={{fontFamily:M,fontSize:9,color:C.tm,marginBottom:2}}>24H</div><div style={{fontFamily:M,fontSize:18,fontWeight:700,color:dc(sd.change)}}>{pf(sd.change)}</div></div>}
                {sd.volume!=null&&<div><div style={{fontFamily:M,fontSize:9,color:C.tm,marginBottom:2}}>VOLUME</div><div style={{fontFamily:M,fontSize:14,fontWeight:600}}>{Number(sd.volume).toLocaleString()}</div></div>}
              </div>
            </div>
            {/* Tier badges */}
            {Object.keys(tiers).length>0&&(
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {Object.entries(tiers).map(([tier,val])=>{
                  const passed=val?.passed??val;
                  return(
                    <div key={tier} style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{color:passed?C.grn:C.red,fontSize:11,fontWeight:700,width:14}}>{passed?"✓":"✗"}</span>
                      <span style={{fontSize:11,color:C.ts}}>{tier}</span>
                      {val?.score!=null&&<span style={{fontFamily:M,fontSize:10,color:C.tm}}>{Math.round(val.score)}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 6mo Chart */}
          {candles&&candles.length>0&&(
            <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:8,padding:"10px 14px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <span style={{fontFamily:M,fontSize:9,color:C.ts,letterSpacing:"0.12em"}}>6-MONTH PRICE ACTION</span>
                <div style={{display:"flex",gap:12,fontFamily:M,fontSize:8,color:C.tm}}>
                  <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{display:"inline-block",width:16,height:2,background:C.mint}}/>PRICE</span>
                  <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{display:"inline-block",width:16,height:0,borderTop:`2px dashed ${C.lav}`}}/>MA20</span>
                </div>
              </div>
              <MiniChart data={candles}/>
            </div>
          )}

          {/* 2-col: Technical + Fundamental */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:8,padding:"10px 14px"}}>
              <div style={{fontFamily:M,fontSize:9,color:C.mint,letterSpacing:"0.12em",marginBottom:8}}>▸ TECHNICAL STRUCTURE</div>
              {price!=null&&<Row label="Current Price" val={fmt(price)} color={C.mint}/>}
              {(tech.ma20??sd.ma20)!=null&&<Row label="MA 20" val={fmt(tech.ma20??sd.ma20)} color={price>(tech.ma20??sd.ma20)?C.grn:C.red}/>}
              {(tech.ma50??sd.ma50)!=null&&<Row label="MA 50" val={fmt(tech.ma50??sd.ma50)} color={price>(tech.ma50??sd.ma50)?C.grn:C.red}/>}
              {(tech.ma200??sd.ma200)!=null&&<Row label="MA 200" val={fmt(tech.ma200??sd.ma200)} color={price>(tech.ma200??sd.ma200)?C.grn:C.red}/>}
              {(tech.rsi??sd.indicators?.rsi)!=null&&<Row label="RSI (14)" val={(tech.rsi??sd.indicators?.rsi)?.toFixed(1)} color={(tech.rsi??sd.indicators?.rsi)>70?C.red:(tech.rsi??sd.indicators?.rsi)<30?C.grn:C.lav}/>}
              {(tech.atr??sd.atr)!=null&&<Row label="ATR" val={fmt(tech.atr??sd.atr)}/>}
              {(tech.volume_ratio??sd.volume_ratio)!=null&&<Row label="Vol / Avg" val={`${(tech.volume_ratio??sd.volume_ratio).toFixed(2)}×`} color={(tech.volume_ratio??sd.volume_ratio)>1.5?C.mint:C.txt}/>}
              {(tech.support??sd.support)!=null&&<Row label="Support" val={fmt(tech.support??sd.support)} color={C.grn}/>}
              {(tech.resistance??sd.resistance)!=null&&<Row label="Resistance" val={fmt(tech.resistance??sd.resistance)} color={C.red}/>}
              {(tech.ma20??sd.ma20)&&(tech.ma50??sd.ma50)&&<Row label="Trend" val={(tech.ma20??sd.ma20)>(tech.ma50??sd.ma50)?"UPTREND":"DOWNTREND"} color={(tech.ma20??sd.ma20)>(tech.ma50??sd.ma50)?C.grn:C.red}/>}
            </div>

            <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:8,padding:"10px 14px"}}>
              <div style={{fontFamily:M,fontSize:9,color:C.mint,letterSpacing:"0.12em",marginBottom:8}}>▸ FUNDAMENTAL SNAPSHOT</div>
              {(fund.pe??sd.pe)!=null&&<Row label="P/E Ratio" val={(fund.pe??sd.pe)?.toFixed(1)}/>}
              {(fund.fwd_pe??sd.fwd_pe)!=null&&<Row label="Fwd P/E" val={(fund.fwd_pe??sd.fwd_pe)?.toFixed(1)}/>}
              {(fund.ps??sd.ps)!=null&&<Row label="P/S Ratio" val={(fund.ps??sd.ps)?.toFixed(1)}/>}
              {(fund.analyst_target??sd.analyst_target)!=null&&<Row label="Analyst Target" val={fmt(fund.analyst_target??sd.analyst_target)} color={price&&(fund.analyst_target??sd.analyst_target)>price?C.grn:C.red}/>}
              {(fund.upside??sd.upside)!=null&&<Row label="Analyst Upside" val={(fund.upside??sd.upside)>=0?"+"+( fund.upside??sd.upside).toFixed(1)+"%":(fund.upside??sd.upside).toFixed(1)+"%"} color={(fund.upside??sd.upside)>0?C.grn:C.red}/>}
              {(fund.eps??sd.eps)!=null&&<Row label="EPS (TTM)" val={fmt(fund.eps??sd.eps)}/>}
              {(fund.revenue_growth??sd.revenue_growth)!=null&&<Row label="Rev Growth" val={pf(fund.revenue_growth??sd.revenue_growth)} color={(fund.revenue_growth??sd.revenue_growth)>0?C.grn:C.red}/>}
              {(catalyst.insider_buying??sd.insider_buying)!=null&&<Row label="Insider Buying" val={(catalyst.insider_buying??sd.insider_buying)?"YES":"NO"} color={(catalyst.insider_buying??sd.insider_buying)?C.mint:C.tm}/>}
              {(catalyst.analyst_upgrade??sd.analyst_upgrade)!=null&&<Row label="Analyst Upgrade" val={(catalyst.analyst_upgrade??sd.analyst_upgrade)?"YES":"NO"} color={(catalyst.analyst_upgrade??sd.analyst_upgrade)?C.grn:C.tm}/>}
              {(sd.indicators?.mfi??catalyst.mfi)!=null&&<Row label="MFI" val={(sd.indicators?.mfi??catalyst.mfi)?.toFixed(0)} color={(sd.indicators?.mfi??catalyst.mfi)>60?C.grn:C.ts}/>}
            </div>
          </div>

          {/* Scenario Analysis */}
          <div style={{background:C.card,border:`1px solid ${C.b}`,borderRadius:8,padding:"12px 16px"}}>
            <div style={{fontFamily:M,fontSize:9,color:C.mint,letterSpacing:"0.12em",marginBottom:12}}>▸ SCENARIO ANALYSIS — 4–8 WEEK HORIZON</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:24}}>
              <div>
                <div style={{fontFamily:M,fontSize:9,color:C.grn,letterSpacing:"0.1em",marginBottom:8}}>BULL CASE</div>
                <ScenBar label="Price Target" tgt={bullTgt} pct={bullPct} prob={bullProb} color={C.grn}/>
                <div style={{fontSize:11,color:C.ts,lineHeight:1.7}}>Momentum continues, volume confirms. Catalyst event (upgrade, earnings beat, macro tailwind) accelerates the move.</div>
              </div>
              <div>
                <div style={{fontFamily:M,fontSize:9,color:C.lav,letterSpacing:"0.1em",marginBottom:8}}>BASE CASE</div>
                <ScenBar label="Price Target" tgt={baseTgt} pct={basePct} prob={baseProb} color={C.lav}/>
                <div style={{fontSize:11,color:C.ts,lineHeight:1.7}}>Gradual grind with normal pullbacks. Market stays constructive. Technical trend holds without a major catalyst.</div>
              </div>
              <div>
                <div style={{fontFamily:M,fontSize:9,color:C.red,letterSpacing:"0.1em",marginBottom:8}}>BEAR CASE</div>
                <ScenBar label="Price Target" tgt={bearTgt} pct={bearPct} prob={bearProb} color={C.red}/>
                <div style={{fontSize:11,color:C.ts,lineHeight:1.7}}>Macro deteriorates or support breaks. Gate closes. Score drops below 40. Risk-off rotation drags to key support zones.</div>
              </div>
            </div>
          </div>

          {/* ATLAS Verdict */}
          <div style={{background:C.card,border:`1px solid ${C.mint}22`,borderRadius:8,padding:"12px 16px"}}>
            <div style={{fontFamily:M,fontSize:9,color:C.mint,letterSpacing:"0.12em",marginBottom:10}}>▸ ATLAS VERDICT</div>
            <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
              <div style={{width:3,alignSelf:"stretch",background:`linear-gradient(to bottom,${C.mint},${C.lav})`,borderRadius:2,flexShrink:0}}/>
              <p style={{fontSize:13,color:C.txt,lineHeight:1.85,margin:0}}>{verdict()}</p>
            </div>
            {signal&&(
              <div style={{marginTop:10,display:"flex",gap:8,flexWrap:"wrap"}}>
                <span style={{fontFamily:M,fontSize:9,fontWeight:600,padding:"2px 8px",borderRadius:3,
                  background:sigColor(signal)+(signal?.toUpperCase().includes("STRONG")?"":"18"),
                  color:signal?.toUpperCase().includes("STRONG BUY")?"#000":sigColor(signal),
                  border:`1px solid ${sigColor(signal)}44`}}>{signal.toUpperCase()}</span>
                <span style={{fontFamily:M,fontSize:9,fontWeight:600,padding:"2px 8px",borderRadius:3,background:C.mintD,color:C.lav,border:`1px solid ${C.lav}33`}}>SCORE {Math.round(totalScore)}/100</span>
                {catalyst.catalyst_count!=null&&<span style={{fontFamily:M,fontSize:9,padding:"2px 8px",borderRadius:3,background:C.grnD,color:C.grn,border:`1px solid ${C.grn}33`}}>{catalyst.catalyst_count} CATALYSTS</span>}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
export default function App(){
  const[page,setPage]=useState("radar");
  const[scan,setScan]=useState("STOCKS");
  const[sel,setSel]=useState(0);
  const[tab,setTab]=useState("plan");
  const[capital,setCapital]=useState(3500);
  const[chartTk,setChartTk]=useState("");
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
          {[{id:"radar",icon:"◆",l:"Radar"},{id:"charts",icon:"◻",l:"Charts"},{id:"outlook",icon:"◎",l:"AtlasStonks"},{id:"guide",icon:"⚡",l:"Guide"},{id:"settings",icon:"⚙",l:"Settings"}].map(n=>(
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

          {page==="outlook"&&<AtlasStonks C={C} M={M} S={S} fmt={fmt} pf={pf} dc={dc} api={api}/>}

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
