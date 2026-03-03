import { useState, useEffect } from "react";
import { BACKEND_URL, CONTRACT_ADDRESS } from "../config";
import { ethers } from "ethers";
import abi from "../abi/ImageRegistryABI.json";

const STATS = [
  { icon:"🖼️", label:"Tổng tác phẩm",  value:"2,847", trend:"+12%", up:true  },
  { icon:"⬡",  label:"NFT đã đúc",      value:"1,203", trend:"+8%",  up:true  },
  { icon:"🔬", label:"Cảnh báo giả mạo",value:"23",    trend:"-5%",  up:false },
  { icon:"💰", label:"Giá trị ước tính", value:"$48K",  trend:"+21%", up:true  },
];
const BARS = [40,60,45,75,85,60,95];
// Alerts will be fetched from backend (/alerts)
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
  const [works, setWorks]   = useState([]);
  const [total, setTotal]   = useState(null);
  const [registeredTotal, setRegisteredTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState([]);
  const [nftCountLocal, setNftCountLocal] = useState(null);

  useEffect(() => {
    fetch(`${BACKEND_URL}/records?limit=20&registered_only=true`)
      .then(r => r.json())
      .then(data => {
        setTotal(data.total ?? data.records?.length ?? 0);
        // registered_total = NFT đã đúc (confirmed on-chain) across all users
        if (data.registered_total != null) setRegisteredTotal(data.registered_total);
        setWorks(data.records ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // On-chain: if wallet connected, fetch balanceOf (NFT count) for that address
  useEffect(() => {
    const fetchOnChain = async () => {
      if (!window.ethereum) return;
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        // try to get currently connected accounts without prompting
        const accounts = await provider.send("eth_accounts", []);
        if (!accounts || accounts.length === 0) return;
        const address = accounts[0];
        const ct = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);
  const bal = await ct.balanceOf(address);
  // store nft count locally so we can display it in the stat card
  setNftCountLocal(Number(bal.toString()));
      } catch (e) {
        console.error("onchain fetch error", e);
      }
    };
    fetchOnChain();
  }, []);

  useEffect(() => {
    fetch(`${BACKEND_URL}/alerts?limit=5`)
      .then(r => r.json())
      .then(data => setAlerts(data.alerts ?? []))
      .catch(() => {});
  }, []);

  const timeAgo = (tsSeconds) => {
    if (!tsSeconds) return "";
    const d = Date.now() - (tsSeconds * 1000);
    const mins = Math.floor(d / 60000);
    if (mins < 1) return "vừa xong";
    if (mins < 60) return `${mins} phút trước`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} giờ trước`;
    const days = Math.floor(hrs / 24);
    return `${days} ngày trước`;
  };

  // Merge real total into STATS[0] and on-chain NFT count into STATS[1]
  const statsDisplay = STATS.map((st, i) => {
    // "Tổng tác phẩm" = tổng đã đăng ký on-chain (registered_total)
    if (i === 0 && registeredTotal !== null) return { ...st, value: registeredTotal.toLocaleString() };
    // "NFT đã đúc" = cùng registered_total (mỗi ảnh đăng ký = 1 NFT)
    if (i === 1) {
      if (registeredTotal !== null) return { ...st, value: registeredTotal.toLocaleString() };
      if (nftCountLocal !== null) return { ...st, value: nftCountLocal.toLocaleString() };
    }
    return st;
  });

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
          {statsDisplay.map((st,i)=>(
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
              {alerts.length === 0 ? (
                <p style={{ color:"#475569",padding:"12px 0",margin:0 }}>Không có cảnh báo gần đây</p>
              ) : (
                alerts.map((a,i)=>(
                  <div key={i} style={{ padding:"12px 14px",borderRadius:10,
                                        background:SEV[a.severity]?.bg || 'rgba(99,102,241,.06)', border:`1px solid ${SEV[a.severity]?.bd || 'rgba(255,255,255,.04)'}` }}>
                    <p style={{ fontSize:13,color:SEV[a.severity]?.c || '#a5b4fc',fontWeight:600,margin:"0 0 3px" }}>{a.message}</p>
                    <p style={{ fontSize:11,color:"#475569",margin:0 }}>{timeAgo(a.created_at)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* RECENT WORKS */}
        <div style={s.card}>
          <h3 style={s.cTit}><span style={s.dot("#4ade80")}/>Tác phẩm gần đây {total !== null && <span style={{color:"#475569",fontWeight:400}}>({total} tổng)</span>}</h3>
          {loading ? (
            <p style={{ color:"#475569",textAlign:"center",padding:"24px 0" }}>Đang tải dữ liệu...</p>
          ) : works.length === 0 ? (
            <p style={{ color:"#475569",textAlign:"center",padding:"24px 0" }}>Chưa có tác phẩm nào được đăng ký.</p>
          ) : (
          <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:"1px solid rgba(255,255,255,.07)" }}>
                {["Watermark ID","Người đăng ký","Tuổi","SHA-256","DHash","Ngày đăng ký","Trạng thái"].map(h=>(
                  <th key={h} style={{ textAlign:"left",padding:"8px 12px",
                                       color:"#475569",fontWeight:600,fontSize:11,textTransform:"uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {works.map((w,i)=>(
                <tr key={i} style={{ borderBottom:"1px solid rgba(255,255,255,.04)" }}>
                  <td style={{ padding:"12px",color:"#818cf8",fontFamily:"monospace" }}>{w.watermark_id || "—"}</td>
                  <td style={{ padding:"12px",fontWeight:600 }}>{w.registrant_name || "—"}</td>
                  <td style={{ padding:"12px",color:"#64748b" }}>{w.registrant_age != null ? w.registrant_age : "—"}</td>
                  <td style={{ padding:"12px",fontFamily:"monospace",fontSize:11,color:"#94a3b8",maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}
                      title={w.sha256}>{w.sha256 ? w.sha256.slice(0,16)+"…" : "—"}</td>
                  <td style={{ padding:"12px",fontFamily:"monospace",fontSize:11,color:"#94a3b8" }}>{w.dhash ? w.dhash.slice(0,12)+"…" : "—"}</td>
                  <td style={{ padding:"12px",color:"#64748b" }}>
                    {w.created_at ? new Date(w.created_at * 1000).toLocaleDateString("vi-VN") : "—"}
                  </td>
                  <td style={{ padding:"12px" }}>
                    <span style={{ padding:"4px 12px",borderRadius:99,fontSize:11,fontWeight:700,
                                   background:"rgba(74,222,128,.12)",color:"#4ade80" }}>Xác thực</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      </div>
    </div>
  );
}
