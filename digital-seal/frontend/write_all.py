
navbar_content = r'''import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ethers } from "ethers";
import { SEPOLIA_CHAIN_ID_HEX } from "../config";

const NAV = [
  { to:"/",          label:"Trang chủ",  icon:"🏠" },
  { to:"/dashboard", label:"Dashboard",  icon:"📊" },
  { to:"/studio",    label:"Studio",     icon:"🔒" },
  { to:"/verify",    label:"Giám định",  icon:"🔬" },
  { to:"/explorer",  label:"NFT Explorer",icon:"🗂️" },
];

export default function Navbar() {
  const [addr, setAddr] = useState("");
  const [open, setOpen] = useState(false);
  const loc = useLocation();

  const connect = async () => {
    if (!window.ethereum) { alert("Cài MetaMask!"); return; }
    try {
      const p = new ethers.BrowserProvider(window.ethereum);
      const accs = await p.send("eth_requestAccounts",[]);
      const cid  = await window.ethereum.request({method:"eth_chainId"});
      if (cid !== SEPOLIA_CHAIN_ID_HEX)
        await window.ethereum.request({method:"wallet_switchEthereumChain",params:[{chainId:SEPOLIA_CHAIN_ID_HEX}]});
      setAddr(accs[0]);
    } catch(e){ console.error(e); }
  };

  const s = {
    nav:   { position:"sticky",top:0,zIndex:50,background:"rgba(8,8,24,.92)",
             backdropFilter:"blur(16px)",borderBottom:"1px solid rgba(255,255,255,.07)",
             fontFamily:"Inter,system-ui,sans-serif" },
    inner: { maxWidth:1180,margin:"0 auto",padding:"0 24px",
             display:"flex",alignItems:"center",justifyContent:"space-between",height:60 },
    logo:  { display:"flex",alignItems:"center",gap:10,textDecoration:"none" },
    logoIcon: { width:34,height:34,borderRadius:10,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:15,fontWeight:900,color:"#fff",flexShrink:0 },
    logoTxt: { fontSize:17,fontWeight:800,background:"linear-gradient(90deg,#a5b4fc,#c4b5fd)",
               WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent" },
    desktopNav: { display:"flex",alignItems:"center",gap:2 },
    link: (active) => ({
      display:"flex",alignItems:"center",gap:6,padding:"7px 13px",
      borderRadius:10,fontSize:13,fontWeight:500,textDecoration:"none",
      transition:"all .15s",
      color: active?"#c7d2fe":"#64748b",
      background: active?"rgba(99,102,241,.15)":"transparent",
      border: active?"1px solid rgba(99,102,241,.3)":"1px solid transparent",
    }),
    walletOn:  { display:"flex",alignItems:"center",gap:8,padding:"7px 14px",
                 borderRadius:20,background:"rgba(74,222,128,.1)",
                 border:"1px solid rgba(74,222,128,.25)",fontSize:13,fontWeight:600,color:"#4ade80" },
    walletOff: { padding:"8px 18px",borderRadius:20,border:"none",cursor:"pointer",
                 background:"linear-gradient(135deg,#6366f1,#8b5cf6)",
                 color:"#fff",fontSize:13,fontWeight:600 },
    dot: (c) => ({ width:7,height:7,borderRadius:"50%",background:c,flexShrink:0 }),
  };

  return (
    <nav style={s.nav}>
      <div style={s.inner}>
        <Link to="/" style={s.logo}>
          <div style={s.logoIcon}>T</div>
          <span style={s.logoTxt}>TrustLens</span>
        </Link>

        <div style={s.desktopNav}>
          {NAV.map(({to,label,icon})=>(
            <Link key={to} to={to} style={s.link(loc.pathname===to)}>
              <span>{icon}</span>{label}
            </Link>
          ))}
        </div>

        <div>
          {addr ? (
            <div style={s.walletOn}>
              <span style={s.dot("#4ade80")}/>
              {addr.slice(0,6)}...{addr.slice(-4)}
            </div>
          ) : (
            <button onClick={connect} style={s.walletOff}>🔑 Kết nối Ví</button>
          )}
        </div>
      </div>
    </nav>
  );
}
'''

home_content = r'''import { Link } from "react-router-dom";

const STATS = [
  { v:"2,847", l:"Tác phẩm đã đăng ký" },
  { v:"1,203", l:"NFT đã đúc" },
  { v:"99.8%", l:"Độ chính xác AI" },
  { v:"0",     l:"Sai phạm bản quyền" },
];

const TECH = [
  { icon:"🔷", name:"DCT Watermark",    color:"#6366f1",
    desc:"Nhúng chữ ký số vô hình vào miền tần số ảnh — vô hiệu hoá mọi thao tác chỉnh sửa, nén, hay cắt xén." },
  { icon:"🔬", name:"ELA Forensics",    color:"#8b5cf6",
    desc:"Error Level Analysis phát hiện vùng ảnh bị can thiệp với độ nhạy sub-pixel, phân tích cấp độ nén JPEG." },
  { icon:"⬡",  name:"ERC-721 NFT",      color:"#a855f7",
    desc:"Ghi hồ sơ bản quyền lên Ethereum dưới dạng NFT không thể sao chép, không thể tẩy xóa, minh bạch vĩnh viễn." },
];

export default function Home() {
  const s = {
    page:    { minHeight:"100vh", background:"#080818", color:"#fff",
               fontFamily:"Inter,system-ui,sans-serif", overflow:"hidden" },
    hero:    { maxWidth:1180, margin:"0 auto", padding:"90px 28px 70px",
               textAlign:"center", position:"relative" },
    badge:   { display:"inline-block", padding:"6px 16px", borderRadius:99,
               background:"rgba(99,102,241,.15)", border:"1px solid rgba(99,102,241,.3)",
               fontSize:12, fontWeight:700, color:"#a5b4fc", letterSpacing:"0.1em",
               textTransform:"uppercase", marginBottom:28 },
    h1:      { fontSize:"clamp(34px,5vw,62px)", fontWeight:900, lineHeight:1.15, margin:"0 0 20px",
               background:"linear-gradient(135deg,#e2e8f0 30%,#a5b4fc 70%,#c4b5fd)",
               WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" },
    lead:    { fontSize:"clamp(15px,1.8vw,19px)", color:"#64748b", maxWidth:600,
               margin:"0 auto 40px", lineHeight:1.7 },
    cta:     { display:"inline-flex", alignItems:"center", gap:10, padding:"14px 36px",
               borderRadius:14, background:"linear-gradient(135deg,#6366f1,#8b5cf6)",
               color:"#fff", fontWeight:700, fontSize:15, textDecoration:"none",
               boxShadow:"0 8px 32px rgba(99,102,241,.35)" },
    statsRow:{ maxWidth:800, margin:"70px auto 0",
               display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:20 },
    statBox: { textAlign:"center", padding:"24px 12px",
               background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:16 },
    statV:   { fontSize:30, fontWeight:800, color:"#a5b4fc", margin:"0 0 4px" },
    statL:   { fontSize:12, color:"#64748b" },
    techSec: { maxWidth:1180, margin:"80px auto", padding:"0 28px" },
    secTitle:{ textAlign:"center", fontSize:32, fontWeight:800, margin:"0 0 10px" },
    secSub:  { textAlign:"center", fontSize:15, color:"#64748b", margin:"0 0 48px" },
    techGrid:{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:24 },
    techCard:{ padding:28, borderRadius:20, background:"rgba(255,255,255,.03)",
               border:"1px solid rgba(255,255,255,.08)", transition:"transform .2s" },
    techIcon:{ fontSize:36, marginBottom:16 },
    techNm:  { fontSize:17, fontWeight:700, marginBottom:10 },
    techDsc: { fontSize:13, color:"#64748b", lineHeight:1.7 },
    ctaSec:  { maxWidth:700, margin:"80px auto 100px", textAlign:"center", padding:"0 24px" },
    ctaCard: { padding:"52px 40px", borderRadius:24,
               background:"linear-gradient(135deg,rgba(99,102,241,.15),rgba(139,92,246,.1))",
               border:"1px solid rgba(99,102,241,.25)" },
    ctaH2:   { fontSize:30, fontWeight:800, margin:"0 0 14px" },
    ctaP:    { color:"#64748b", fontSize:15, margin:"0 0 32px", lineHeight:1.7 },
    ctaRow:  { display:"flex", gap:14, justifyContent:"center", flexWrap:"wrap" },
    btnSec:  { padding:"12px 28px", borderRadius:12, border:"1px solid rgba(255,255,255,.15)",
               background:"transparent", color:"#e2e8f0", fontWeight:600, fontSize:14,
               textDecoration:"none", display:"inline-block" },
  };
  return (
    <div style={s.page}>
      {/* HERO */}
      <div style={s.hero}>
        <span style={s.badge}>🛡️ Web3 · AI · Blockchain</span>
        <h1 style={s.h1}>Bảo vệ Tác phẩm số<br/>trong Kỷ nguyên AI</h1>
        <p style={s.lead}>
          Hệ thống đăng ký bản quyền ảnh số kết hợp thủy vân DCT,
          AI giám định pháp lý (ELA) và NFT Ethereum — bất biến, minh bạch, toàn cầu.
        </p>
        <Link to="/studio" style={s.cta}>🚀 Đăng ký tác phẩm ngay</Link>

        <div style={s.statsRow}>
          {STATS.map((st,i)=>(
            <div key={i} style={s.statBox}>
              <p style={s.statV}>{st.v}</p>
              <p style={s.statL}>{st.l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* TECH CARDS */}
      <div style={s.techSec}>
        <h2 style={s.secTitle}>Công nghệ cốt lõi</h2>
        <p style={s.secSub}>Ba lớp bảo vệ độc lập, kết hợp tạo thành lá chắn toàn diện</p>
        <div style={s.techGrid}>
          {TECH.map((t,i)=>(
            <div key={i} style={{ ...s.techCard, borderColor:`${t.color}25` }}>
              <div style={{ ...s.techIcon }}>{t.icon}</div>
              <p style={{ ...s.techNm, color:t.color }}>{t.name}</p>
              <p style={s.techDsc}>{t.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={s.ctaSec}>
        <div style={s.ctaCard}>
          <h2 style={s.ctaH2}>Bắt đầu bảo vệ tác phẩm</h2>
          <p style={s.ctaP}>Chỉ cần kết nối ví MetaMask và tải lên ảnh — toàn bộ quy trình tự động trong vài phút.</p>
          <div style={s.ctaRow}>
            <Link to="/studio" style={s.cta}>🔒 Đăng ký bản quyền</Link>
            <Link to="/verify" style={s.btnSec}>🔬 Kiểm tra tác phẩm</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
'''

dashboard_content = r'''const STATS = [
  { icon:"🖼️", label:"Tổng tác phẩm",  value:"2,847", trend:"+12%", up:true  },
  { icon:"⬡",  label:"NFT đã đúc",      value:"1,203", trend:"+8%",  up:true  },
  { icon:"🔬", label:"Cảnh báo giả mạo",value:"23",    trend:"-5%",  up:false },
  { icon:"💰", label:"Giá trị ước tính", value:"$48K",  trend:"+21%", up:true  },
];
const BARS = [40,60,45,75,85,60,95];
const ALERTS = [
  { time:"10 phút trước", msg:"Phát hiện bản sao ảnh #1823 trên mạng xã hội",  sev:"high"   },
  { time:"1 giờ trước",   msg:"Tác phẩm #1205 có dấu hiệu chỉnh sửa (ELA)",     sev:"medium" },
  { time:"3 giờ trước",   msg:"Yêu cầu cấp phép từ Studio XYZ cho ảnh #0892",   sev:"low"    },
];
const WORKS = [
  { id:"#1823", name:"Sunrise Over Hanoi",  date:"01/06/2025", status:"Xác thực",    color:"#4ade80" },
  { id:"#1205", name:"Digital Flora #7",    date:"03/06/2025", status:"Cảnh báo",    color:"#fbbf24" },
  { id:"#0892", name:"Neon Cityscape",      date:"05/06/2025", status:"Đang xét",    color:"#818cf8" },
  { id:"#0721", name:"Abstract Mind",       date:"10/06/2025", status:"Xác thực",    color:"#4ade80" },
];
const SEV = { high:{bg:"rgba(239,68,68,.12)",bd:"rgba(239,68,68,.25)",c:"#fca5a5"},
              medium:{bg:"rgba(251,191,36,.1)",bd:"rgba(251,191,36,.2)",c:"#fde68a"},
              low:{bg:"rgba(99,102,241,.1)",bd:"rgba(99,102,241,.2)",c:"#a5b4fc"} };

export default function Dashboard() {
  const s = {
    page:  { minHeight:"100vh",background:"#080818",color:"#fff",fontFamily:"Inter,system-ui,sans-serif" },
    hdr:   { borderBottom:"1px solid rgba(255,255,255,.07)",padding:"20px 32px" },
    crumb: { fontSize:11,color:"#818cf8",fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:6 },
    h1:    { fontSize:22,fontWeight:800,margin:"0 0 4px" },
    sub:   { fontSize:13,color:"#64748b",margin:0 },
    body:  { maxWidth:1180,margin:"0 auto",padding:"28px" },
    grid4: { display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:18,marginBottom:24 },
    grid2: { display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:24 },
    card:  { background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:16,padding:22 },
    cTit:  { fontSize:13,fontWeight:700,margin:"0 0 18px",display:"flex",alignItems:"center",gap:8 },
    dot:   (c)=>({ width:8,height:8,borderRadius:"50%",background:c }),
    statI: { fontSize:26,marginBottom:10 },
    statV: { fontSize:28,fontWeight:800,margin:"0 0 4px",color:"#e2e8f0" },
    statL: { fontSize:12,color:"#64748b",margin:"0 0 12px" },
    trend: (up)=>({ display:"inline-block",padding:"3px 10px",borderRadius:99,fontSize:11,fontWeight:700,
                    background:up?"rgba(74,222,128,.12)":"rgba(239,68,68,.12)",
                    color:up?"#4ade80":"#f87171" }),
  };
  return (
    <div style={s.page}>
      <div style={s.hdr}>
        <div style={{ maxWidth:1180,margin:"0 auto" }}>
          <p style={s.crumb}>TrustLens › Bảng điều hành</p>
          <h1 style={s.h1}>Dashboard Quản lý</h1>
          <p style={s.sub}>Tổng quan hệ sinh thái bản quyền số — cập nhật thực thời</p>
        </div>
      </div>
      <div style={s.body}>
        {/* STAT CARDS */}
        <div style={s.grid4}>
          {STATS.map((st,i)=>(
            <div key={i} style={s.card}>
              <div style={s.statI}>{st.icon}</div>
              <p style={s.statV}>{st.value}</p>
              <p style={s.statL}>{st.label}</p>
              <span style={s.trend(st.up)}>{st.trend}</span>
            </div>
          ))}
        </div>

        {/* CHART + ALERTS */}
        <div style={s.grid2}>
          {/* Chart */}
          <div style={s.card}>
            <h3 style={s.cTit}><span style={s.dot("#6366f1")}/>Hoạt động đăng ký (7 ngày)</h3>
            <div style={{ display:"flex",alignItems:"flex-end",gap:8,height:140,padding:"8px 0" }}>
              {BARS.map((h,i)=>(
                <div key={i} style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4 }}>
                  <div style={{ width:"100%",height:`${h}%`,borderRadius:"4px 4px 0 0",
                                background:`linear-gradient(180deg,#6366f1,rgba(99,102,241,.3))`,
                                minHeight:4 }}/>
                  <span style={{ fontSize:10,color:"#475569" }}>T{i+2}</span>
                </div>
              ))}
            </div>
            <div style={{ display:"flex",justifyContent:"space-between",fontSize:12,color:"#64748b",marginTop:8 }}>
              <span>Tổng tuần: <strong style={{ color:"#a5b4fc" }}>455</strong></span>
              <span>TB/ngày: <strong style={{ color:"#a5b4fc" }}>65</strong></span>
            </div>
          </div>

          {/* Alerts */}
          <div style={s.card}>
            <h3 style={s.cTit}><span style={s.dot("#ef4444")}/>Cảnh báo AI gần đây</h3>
            <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
              {ALERTS.map((a,i)=>(
                <div key={i} style={{ padding:"12px 14px",borderRadius:10,
                                      background:SEV[a.sev].bg, border:`1px solid ${SEV[a.sev].bd}` }}>
                  <p style={{ fontSize:13,color:SEV[a.sev].c,fontWeight:600,margin:"0 0 3px" }}>{a.msg}</p>
                  <p style={{ fontSize:11,color:"#475569",margin:0 }}>{a.time}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RECENT WORKS */}
        <div style={s.card}>
          <h3 style={s.cTit}><span style={s.dot("#4ade80")}/>Tác phẩm gần đây</h3>
          <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:"1px solid rgba(255,255,255,.07)" }}>
                {["Token ID","Tên tác phẩm","Ngày đăng ký","Trạng thái",""].map(h=>(
                  <th key={h} style={{ textAlign:"left",padding:"8px 12px",
                                       color:"#475569",fontWeight:600,fontSize:11,textTransform:"uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {WORKS.map((w,i)=>(
                <tr key={i} style={{ borderBottom:"1px solid rgba(255,255,255,.04)" }}>
                  <td style={{ padding:"12px",color:"#818cf8",fontFamily:"monospace" }}>{w.id}</td>
                  <td style={{ padding:"12px",fontWeight:600 }}>{w.name}</td>
                  <td style={{ padding:"12px",color:"#64748b" }}>{w.date}</td>
                  <td style={{ padding:"12px" }}>
                    <span style={{ padding:"4px 12px",borderRadius:99,fontSize:11,fontWeight:700,
                                   background:`${w.color}18`,color:w.color }}>{w.status}</span>
                  </td>
                  <td style={{ padding:"12px" }}>
                    <button style={{ padding:"6px 14px",borderRadius:8,border:"1px solid rgba(255,255,255,.1)",
                                     background:"transparent",color:"#94a3b8",fontSize:12,cursor:"pointer" }}>
                      Chi tiết
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
'''

verify_content = r'''import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { ethers } from "ethers";
import abi from "../abi/ImageRegistryABI.json";
import { BACKEND_URL, CONTRACT_ADDRESS, SEPOLIA_CHAIN_ID_HEX } from "../config.js";

const VERDICT = {
  authentic: { label:"Xác thực — Nguyên bản",           icon:"🟢", color:"#4ade80", bg:"rgba(74,222,128,.08)",  bd:"rgba(74,222,128,.25)"  },
  suspicious:{ label:"Nghi vấn — Cần kiểm tra thêm",    icon:"🟡", color:"#fbbf24", bg:"rgba(251,191,36,.08)", bd:"rgba(251,191,36,.25)"  },
  forged:    { label:"Giả mạo — Phát hiện can thiệp",   icon:"🔴", color:"#f87171", bg:"rgba(239,68,68,.08)",  bd:"rgba(239,68,68,.25)"   },
  unknown:   { label:"Chưa xác định",                   icon:"⚪", color:"#94a3b8", bg:"rgba(255,255,255,.04)", bd:"rgba(255,255,255,.1)"  },
};

export default function Verify() {
  const [file,    setFile]    = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy,    setBusy]    = useState(false);
  const [pct,     setPct]     = useState(0);
  const [task,    setTask]    = useState("");
  const [result,  setResult]  = useState(null);
  const [chain,   setChain]   = useState(null);

  const onDrop = useCallback(fs=>{
    const f=fs[0];
    if(f){ setFile(f); setPreview(URL.createObjectURL(f)); setResult(null); setChain(null); setPct(0); }
  },[]);
  const {getRootProps,getInputProps,isDragActive,open} = useDropzone({
    onDrop, accept:{"image/*":[".jpeg",".jpg",".png",".tiff"]}, multiple:false,
  });

  const go = async () => {
    if (!file) return;
    try {
      setBusy(true); setPct(10); setTask("Phân tích ELA...");
      const form=new FormData(); form.append("file",file);
      const r=await fetch(`${BACKEND_URL}/verify`,{method:"POST",body:form});
      if(!r.ok) throw new Error("Backend lỗi");
      setPct(55); setTask("Tra cứu blockchain...");
      const data=await r.json();
      let rec=null;
      try {
        if(window.ethereum){
          const p=new ethers.BrowserProvider(window.ethereum);
          const ct=new ethers.Contract(CONTRACT_ADDRESS,abi,p);
          if(data.sha256){ const rv=await ct.getRecordByHash(data.sha256); if(rv&&rv.author&&rv.author!="0x0000000000000000000000000000000000000000") rec=rv; }
        }
      } catch(_){}
      setPct(100); setTask("Hoàn tất!"); setResult(data); setChain(rec);
    } catch(e){ console.error(e); }
    finally{ setBusy(false); }
  };

  const verdict = ()=>{
    if(!result) return "unknown";
    const d=result.best_match?.distance;
    if(d==null) return "unknown";
    if(d<=5) return "authentic"; if(d<=20) return "suspicious"; return "forged";
  };
  const vd = VERDICT[verdict()];

  const s={
    page:  {minHeight:"100vh",background:"#080818",color:"#fff",fontFamily:"Inter,system-ui,sans-serif"},
    hdr:   {borderBottom:"1px solid rgba(255,255,255,.07)",padding:"20px 32px"},
    crumb: {fontSize:11,color:"#8b5cf6",fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:6},
    h1:    {fontSize:22,fontWeight:800,margin:"0 0 4px"},
    sub:   {fontSize:13,color:"#64748b",margin:0},
    body:  {maxWidth:1180,margin:"0 auto",padding:"28px",display:"grid",gridTemplateColumns:"1fr 320px",gap:24,alignItems:"start"},
    col:   {display:"flex",flexDirection:"column",gap:20},
    card:  {background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:16,padding:24},
    cTit:  {fontSize:13,fontWeight:700,margin:"0 0 18px",display:"flex",alignItems:"center",gap:8},
    dot:   (c)=>({width:8,height:8,borderRadius:"50%",background:c}),
    dz:    (drag)=>({border:drag?"2px dashed #8b5cf6":"2px dashed rgba(255,255,255,.12)",
                     background:drag?"rgba(139,92,246,.08)":"rgba(255,255,255,.02)",
                     borderRadius:16,minHeight:260,display:"flex",alignItems:"center",
                     justifyContent:"center",cursor:"pointer",transition:"all .2s",position:"relative",overflow:"hidden"}),
    pBar:  {height:6,background:"rgba(255,255,255,.06)",borderRadius:99,overflow:"hidden",marginTop:6},
    metric:{textAlign:"center",padding:"16px 12px",background:"rgba(255,255,255,.03)",
            border:"1px solid rgba(255,255,255,.06)",borderRadius:12},
    btnPri:{width:"100%",padding:"14px",borderRadius:12,border:"none",cursor:"pointer",
            background:"linear-gradient(135deg,#8b5cf6,#ec4899)",color:"#fff",fontWeight:700,fontSize:14,
            display:"flex",alignItems:"center",justifyContent:"center",gap:8},
    btnOff:{width:"100%",padding:"14px",borderRadius:12,border:"none",cursor:"not-allowed",
            background:"rgba(255,255,255,.05)",color:"#475569",fontWeight:700,fontSize:14,
            display:"flex",alignItems:"center",justifyContent:"center",gap:8},
    row:   {display:"flex",justifyContent:"space-between",padding:"8px 0",
            borderBottom:"1px solid rgba(255,255,255,.05)",fontSize:13},
  };

  const d=result?.best_match?.distance;
  const pctSim=d!=null?Math.max(0,100-d*4):0;

  return (
    <div style={s.page}>
      <div style={s.hdr}>
        <div style={{maxWidth:1180,margin:"0 auto"}}>
          <p style={s.crumb}>TrustLens › Phòng pháp lý</p>
          <h1 style={s.h1}>AI Forensics Inspector</h1>
          <p style={s.sub}>Phân tích ELA · Trích xuất thủy vân số · Tra cứu hồ sơ Blockchain</p>
        </div>
      </div>
      <div style={s.body}>
        <div style={s.col}>
          {/* DROPZONE */}
          <div {...getRootProps()} style={s.dz(isDragActive)}>
            <input {...getInputProps()}/>
            {preview?(
              <>
                <img src={preview} alt="suspect" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"contain",padding:16}}/>
                {busy&&(
                  <div style={{position:"absolute",bottom:16,left:16,right:16,background:"rgba(0,0,0,.8)",
                               backdropFilter:"blur(6px)",borderRadius:10,padding:"10px 16px",
                               display:"flex",alignItems:"center",gap:10}}>
                    <span style={{width:16,height:16,borderRadius:"50%",border:"2px solid rgba(255,255,255,.2)",
                                  borderTopColor:"#c4b5fd",animation:"spin 1s linear infinite",
                                  display:"inline-block",flexShrink:0}}/>
                    <span style={{fontSize:13,color:"#c4b5fd",fontWeight:500}}>{task}</span>
                  </div>
                )}
              </>
            ):(
              <div style={{textAlign:"center",padding:"40px 24px"}}>
                <div style={{width:72,height:72,borderRadius:16,background:"rgba(139,92,246,.1)",
                             border:"1px solid rgba(139,92,246,.2)",display:"flex",alignItems:"center",
                             justifyContent:"center",fontSize:32,margin:"0 auto 20px"}}>🔍</div>
                <p style={{fontWeight:700,fontSize:17,marginBottom:8}}>Nạp ảnh nghi vấn</p>
                <p style={{fontSize:13,color:"#475569",marginBottom:20}}>Kéo thả hoặc chọn ảnh để phân tích pháp lý</p>
                <button onClick={e=>{e.stopPropagation();open();}}
                  style={{padding:"10px 28px",borderRadius:10,background:"#8b5cf6",
                          color:"#fff",fontWeight:600,fontSize:13,border:"none",cursor:"pointer"}}>
                  Chọn ảnh kiểm tra
                </button>
              </div>
            )}
          </div>

          {/* ELA METRICS */}
          {result&&(
            <div style={s.card}>
              <h3 style={s.cTit}><span style={s.dot("#8b5cf6")}/>Kết quả phân tích</h3>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
                {[
                  {l:"Khoảng cách Hash",v:d??"-",u:"bit",c:"#f87171"},
                  {l:"Độ tương đồng",v:d!=null?`${pctSim.toFixed(1)}`:"-",u:"%",c:"#818cf8"},
                  {l:"Trong CSDL",v:result.total_in_db??"-",u:"ảnh",c:"#4ade80"},
                ].map((m,i)=>(
                  <div key={i} style={s.metric}>
                    <p style={{fontSize:11,color:"#475569",margin:"0 0 6px"}}>{m.l}</p>
                    <p style={{fontSize:26,fontWeight:800,color:m.c,margin:"0 0 2px"}}>{m.v}</p>
                    <p style={{fontSize:11,color:"#334155",margin:0}}>{m.u}</p>
                  </div>
                ))}
              </div>
              {result.best_match&&(
                <div style={{padding:12,borderRadius:10,background:"rgba(255,255,255,.03)",
                             border:"1px solid rgba(255,255,255,.07)",fontFamily:"monospace",
                             fontSize:11,color:"#64748b",wordBreak:"break-all"}}>
                  SHA256: {result.best_match.sha256}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={s.col}>
          {/* VERDICT */}
          <div style={{...s.card,background:vd.bg,border:`1px solid ${vd.bd}`}}>
            <p style={{fontSize:11,color:"#64748b",fontWeight:700,letterSpacing:"0.1em",
                       textTransform:"uppercase",margin:"0 0 14px"}}>Kết luận giám định</p>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
              <span style={{fontSize:32}}>{vd.icon}</span>
              <p style={{fontSize:16,fontWeight:800,color:vd.color,margin:0}}>{vd.label}</p>
            </div>
            {result?.best_match&&(
              <p style={{fontSize:12,color:"#64748b",margin:0}}>
                Hamming: <strong style={{color:"#fff"}}>{result.best_match.distance} bit</strong> / 256 bit
              </p>
            )}
          </div>

          {/* CHAIN RECORD */}
          <div style={s.card}>
            <h3 style={s.cTit}><span style={s.dot("#6366f1")}/>Hồ sơ Blockchain</h3>
            {chain?(
              <div>
                <div style={s.row}><span style={{color:"#64748b"}}>Tác giả</span><span style={{color:"#818cf8",fontFamily:"monospace"}}>{chain.author?.slice(0,16)}...</span></div>
                <div style={s.row}><span style={{color:"#64748b"}}>Định danh</span><span style={{color:"#c4b5fd"}}>{chain.watermarkId}</span></div>
                <div style={{...s.row,borderBottom:"none"}}><span style={{color:"#64748b"}}>Trạng thái</span><span style={{color:"#4ade80",fontWeight:600}}>✅ Xác minh</span></div>
                {chain.ipfsLink&&<a href={chain.ipfsLink} target="_blank" rel="noreferrer"
                  style={{display:"block",textAlign:"center",marginTop:14,padding:"9px",
                          borderRadius:10,background:"rgba(99,102,241,.1)",border:"1px solid rgba(99,102,241,.25)",
                          color:"#818cf8",fontSize:13,fontWeight:600}}>📁 Xem IPFS</a>}
              </div>
            ):(
              <div style={{textAlign:"center",padding:"24px 0",color:"#334155",fontSize:13}}>
                {result?"Không tìm thấy hồ sơ on-chain":"Chưa có dữ liệu"}
              </div>
            )}
          </div>

          {/* ACTION */}
          <button style={!file||busy?s.btnOff:s.btnPri} onClick={go} disabled={!file||busy}>
            {busy?(<><span style={{width:16,height:16,borderRadius:"50%",border:"2px solid rgba(255,255,255,.2)",
                                   borderTopColor:"#fff",animation:"spin 1s linear infinite",display:"inline-block"}}/>Đang phân tích...</>)
                 :"🔬 Bắt đầu giám định AI"}
          </button>

          <div style={{...s.card,background:"rgba(139,92,246,.06)",border:"1px solid rgba(139,92,246,.15)"}}>
            <h3 style={{...s.cTit,color:"#c4b5fd"}}>🔬 Công nghệ pháp lý</h3>
            {["ELA — Phân tích sai số nén JPEG","pHash — So khớp thị giác 64-bit",
              "DCT — Trích xuất thủy vân số","Ethereum — Tra cứu NFT on-chain"].map((t,i)=>(
              <div key={i} style={{display:"flex",gap:8,fontSize:12,color:"#94a3b8",marginBottom:8}}>
                <span style={{color:"#8b5cf6",flexShrink:0}}>●</span>{t}
              </div>
            ))}
          </div>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
'''

explorer_content = r'''import { useState } from "react";

const PALETTE=["#6366f1","#8b5cf6","#a855f7","#06b6d4","#10b981","#f59e0b"];
const NFTS=[
  {id:"001",title:"Sunrise Over Hanoi",   author:"NguyenVanA", sha:"0xabc1...f456", date:"2025-06-01",parent:null},
  {id:"002",title:"Digital Flora #7",     author:"TrinhThiB",  sha:"0xbcd2...0567", date:"2025-06-03",parent:"0xabc1...f456"},
  {id:"003",title:"Neon Cityscape",       author:"LeVanC",     sha:"0xcde3...1678", date:"2025-06-05",parent:null},
  {id:"004",title:"Deep Blue #2",         author:"NguyenVanA", sha:"0xdef4...2789", date:"2025-06-08",parent:"0xbcd2...0567"},
  {id:"005",title:"Abstract Mind",        author:"PhamThiD",   sha:"0xef05...389a", date:"2025-06-10",parent:null},
  {id:"006",title:"Mountain Light",       author:"TrinhThiB",  sha:"0xf016...490b", date:"2025-06-12",parent:"0xef05...389a"},
];

export default function Explorer() {
  const [sel,    setSel]    = useState(null);
  const [search, setSearch] = useState("");

  const filtered = NFTS.filter(n=>
    n.title.toLowerCase().includes(search.toLowerCase())||
    n.author.toLowerCase().includes(search.toLowerCase())
  );

  const provenance = (sha) => {
    const chain=[];
    let cur=NFTS.find(n=>n.sha===sha);
    while(cur){ chain.unshift(cur); cur=NFTS.find(n=>n.sha===cur.parent); }
    return chain;
  };

  const s={
    page: {minHeight:"100vh",background:"#080818",color:"#fff",fontFamily:"Inter,system-ui,sans-serif"},
    hdr:  {borderBottom:"1px solid rgba(255,255,255,.07)",padding:"20px 32px",
           display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,flexWrap:"wrap"},
    crumb:{fontSize:11,color:"#06b6d4",fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:6},
    h1:   {fontSize:22,fontWeight:800,margin:"0 0 4px"},
    sub:  {fontSize:13,color:"#64748b",margin:0},
    srch: {background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",
           borderRadius:10,padding:"9px 16px 9px 38px",fontSize:13,color:"#fff",
           outline:"none",width:240,fontFamily:"inherit"},
    srchW:{position:"relative"},
    srchI:{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:14,pointerEvents:"none"},
    body: {maxWidth:1180,margin:"0 auto",padding:"28px",display:"grid",
           gridTemplateColumns:"1fr 320px",gap:24,alignItems:"start"},
    grid: {display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16},
    nftCard:(active,color)=>({
      borderRadius:16,border:active?`2px solid ${color}`:"1px solid rgba(255,255,255,.08)",
      background:active?`${color}18`:"rgba(255,255,255,.03)",cursor:"pointer",
      overflow:"hidden",transition:"all .2s",
    }),
    thumb:(c)=>({height:130,background:`${c}18`,display:"flex",alignItems:"center",
                 justifyContent:"center",fontSize:36,position:"relative"}),
    nftBody:{padding:"14px 16px"},
    nftNm: {fontSize:14,fontWeight:700,margin:"0 0 4px",overflow:"hidden",
            textOverflow:"ellipsis",whiteSpace:"nowrap"},
    nftAu: {fontSize:12,color:"#64748b",margin:0},
    pill:  {position:"absolute",top:8,right:8,padding:"2px 8px",borderRadius:99,
            fontSize:10,fontWeight:700,background:"rgba(139,92,246,.8)",color:"#fff"},
    card:  {background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:16,padding:22},
    cTit:  {fontSize:13,fontWeight:700,margin:"0 0 16px",display:"flex",alignItems:"center",gap:8},
    dot:   (c)=>({width:8,height:8,borderRadius:"50%",background:c}),
    row:   {display:"flex",justifyContent:"space-between",padding:"8px 0",
            borderBottom:"1px solid rgba(255,255,255,.05)",fontSize:13},
    statG: {display:"grid",gridTemplateColumns:"1fr 1fr",gap:10},
    statB: {textAlign:"center",padding:"14px 8px",background:"rgba(255,255,255,.03)",
            border:"1px solid rgba(255,255,255,.06)",borderRadius:12},
    empty: {textAlign:"center",padding:"48px 0",color:"#334155"},
    col:   {display:"flex",flexDirection:"column",gap:16},
  };

  const prov = sel ? provenance(sel.sha) : [];

  return (
    <div style={s.page}>
      <div style={s.hdr}>
        <div>
          <p style={s.crumb}>TrustLens › Thư viện NFT</p>
          <h1 style={s.h1}>NFT Explorer &amp; Gia phả số</h1>
          <p style={s.sub}>Khám phá tác phẩm đã đăng ký và chuỗi nguồn gốc phái sinh</p>
        </div>
        <div style={s.srchW}>
          <span style={s.srchI}>🔍</span>
          <input style={s.srch} value={search} onChange={e=>setSearch(e.target.value)}
                 placeholder="Tìm tác phẩm hoặc tác giả..."/>
        </div>
      </div>
      <div style={s.body}>
        {/* GRID */}
        <div>
          <p style={{fontSize:13,color:"#64748b",marginBottom:16}}>
            <strong style={{color:"#fff"}}>{filtered.length}</strong> tác phẩm
          </p>
          {filtered.length>0?(
            <div style={s.grid}>
              {filtered.map((n,i)=>{
                const c=PALETTE[i%PALETTE.length];
                return (
                  <div key={n.id} style={s.nftCard(sel?.id===n.id,c)} onClick={()=>setSel(n)}>
                    <div style={s.thumb(c)}>
                      🖼️
                      {n.parent&&<span style={s.pill}>Phái sinh</span>}
                    </div>
                    <div style={s.nftBody}>
                      <p style={s.nftNm}>{n.title}</p>
                      <p style={s.nftAu}>@{n.author} · {n.date}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ):(
            <div style={s.empty}><p style={{fontSize:36,margin:"0 0 12px"}}>🗂️</p><p>Không tìm thấy tác phẩm</p></div>
          )}
        </div>

        {/* SIDEBAR */}
        <div style={s.col}>
          {sel?(
            <>
              <div style={s.card}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                  <div>
                    <p style={{fontWeight:800,fontSize:15,margin:"0 0 2px"}}>{sel.title}</p>
                    <p style={{color:"#64748b",fontSize:13,margin:0}}>@{sel.author}</p>
                  </div>
                  <button onClick={()=>setSel(null)}
                    style={{background:"none",border:"none",color:"#475569",fontSize:20,cursor:"pointer",lineHeight:1}}>×</button>
                </div>
                <div style={s.row}><span style={{color:"#64748b"}}>Token ID</span><span style={{color:"#818cf8"}}># {sel.id}</span></div>
                <div style={s.row}><span style={{color:"#64748b"}}>Ngày đăng ký</span><span>{sel.date}</span></div>
                <div style={{...s.row,borderBottom:"none"}}><span style={{color:"#64748b"}}>Loại</span>
                  <span style={{color:sel.parent?"#c4b5fd":"#4ade80"}}>{sel.parent?"Phái sinh":"Tác phẩm gốc"}</span></div>
              </div>

              {/* PROVENANCE TREE */}
              <div style={s.card}>
                <h3 style={s.cTit}><span style={s.dot("#06b6d4")}/>Gia phả số</h3>
                {prov.map((node,i)=>(
                  <div key={node.id} style={{display:"flex",gap:12,marginBottom:0}}>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
                      <div style={{width:11,height:11,borderRadius:"50%",marginTop:3,flexShrink:0,
                                   background:node.id===sel.id?"#06b6d4":"#6366f1"}}/>
                      {i<prov.length-1&&<div style={{width:1,flex:1,background:"rgba(255,255,255,.08)",minHeight:32}}/>}
                    </div>
                    <div style={{paddingBottom:16}}>
                      <p style={{fontSize:13,fontWeight:700,margin:"0 0 2px",
                                 color:node.id===sel.id?"#67e8f9":"#e2e8f0"}}>{node.title}</p>
                      <p style={{fontSize:11,color:"#475569",margin:0}}>@{node.author} · {node.date}</p>
                      {i===0&&<span style={{fontSize:10,color:"#6366f1",fontWeight:700}}>NGUỒN GỐC</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ):(
            <div style={{...s.card,textAlign:"center",padding:"40px 20px",color:"#334155"}}>
              <p style={{fontSize:32,margin:"0 0 10px"}}>🗺️</p>
              <p style={{fontSize:13}}>Chọn một tác phẩm để xem chi tiết và gia phả số</p>
            </div>
          )}

          {/* STATS */}
          <div style={s.statG}>
            {[{l:"Tổng tác phẩm",v:NFTS.length,c:"#818cf8"},
              {l:"Tác phẩm gốc",v:NFTS.filter(n=>!n.parent).length,c:"#06b6d4"},
              {l:"Phái sinh",v:NFTS.filter(n=>n.parent).length,c:"#c4b5fd"},
              {l:"Tác giả",v:[...new Set(NFTS.map(n=>n.author))].length,c:"#4ade80"},
            ].map((st,i)=>(
              <div key={i} style={s.statB}>
                <p style={{fontSize:24,fontWeight:800,color:st.c,margin:"0 0 4px"}}>{st.v}</p>
                <p style={{fontSize:11,color:"#475569",margin:0}}>{st.l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
'''

files = {
    r'd:\Block_chain\doanblockchain\digital-seal\frontend\src\components\Navbar.jsx': navbar_content,
    r'd:\Block_chain\doanblockchain\digital-seal\frontend\src\pages\Home.jsx': home_content,
    r'd:\Block_chain\doanblockchain\digital-seal\frontend\src\pages\Dashboard.jsx': dashboard_content,
    r'd:\Block_chain\doanblockchain\digital-seal\frontend\src\pages\Verify.jsx': verify_content,
    r'd:\Block_chain\doanblockchain\digital-seal\frontend\src\pages\Explorer.jsx': explorer_content,
}

for path, content in files.items():
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Written: {path}")
print("All done!")
