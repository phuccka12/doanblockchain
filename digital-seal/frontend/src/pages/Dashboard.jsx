import { useState, useEffect } from "react";
import { BACKEND_URL } from "../config";

const STATS = [
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
  const [works, setWorks]   = useState([]);
  const [total, setTotal]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BACKEND_URL}/records?limit=20`)
      .then(r => r.json())
      .then(data => {
        setTotal(data.total ?? data.records?.length ?? 0);
        setWorks(data.records ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Merge real total into STATS[0]
  const statsDisplay = STATS.map((st, i) =>
    i === 0 && total !== null ? { ...st, value: total.toLocaleString() } : st
  );

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
          <h3 style={s.cTit}><span style={s.dot("#4ade80")}/>Tác phẩm gần đây {total !== null && <span style={{color:"#475569",fontWeight:400}}>({total} tổng)</span>}</h3>
          {loading ? (
            <p style={{ color:"#475569",textAlign:"center",padding:"24px 0" }}>Đang tải dữ liệu...</p>
          ) : works.length === 0 ? (
            <p style={{ color:"#475569",textAlign:"center",padding:"24px 0" }}>Chưa có tác phẩm nào được đăng ký.</p>
          ) : (
          <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:"1px solid rgba(255,255,255,.07)" }}>
                {["Watermark ID","SHA-256","DHash","Ngày đăng ký","Trạng thái"].map(h=>(
                  <th key={h} style={{ textAlign:"left",padding:"8px 12px",
                                       color:"#475569",fontWeight:600,fontSize:11,textTransform:"uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {works.map((w,i)=>(
                <tr key={i} style={{ borderBottom:"1px solid rgba(255,255,255,.04)" }}>
                  <td style={{ padding:"12px",color:"#818cf8",fontFamily:"monospace" }}>{w.watermark_id || "—"}</td>
                  <td style={{ padding:"12px",fontFamily:"monospace",fontSize:11,color:"#94a3b8",maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}
                      title={w.sha256}>{w.sha256 ? w.sha256.slice(0,16)+"…" : "—"}</td>
                  <td style={{ padding:"12px",fontFamily:"monospace",fontSize:11,color:"#94a3b8" }}>{w.dhash ? w.dhash.slice(0,12)+"…" : "—"}</td>
                  <td style={{ padding:"12px",color:"#64748b" }}>
                    {w.created_at ? new Date(w.created_at).toLocaleDateString("vi-VN") : "—"}
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
