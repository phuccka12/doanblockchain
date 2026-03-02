import { Link } from "react-router-dom";

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
