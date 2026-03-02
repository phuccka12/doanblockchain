import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { ethers } from "ethers";
import toast from "react-hot-toast";
import abi from "../abi/ImageRegistryABI.json";
import { BACKEND_URL, CONTRACT_ADDRESS, SEPOLIA_CHAIN_ID_HEX } from "../config.js";

async function ensureSepolia() {
  if (!window.ethereum) throw new Error("Vui lòng cài đặt ví MetaMask!");
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  if (chainId !== SEPOLIA_CHAIN_ID_HEX)
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }] });
}

/* ---- inline style tokens ---- */
const C = {
  page:    { minHeight:"100vh", background:"#080818", color:"#fff", fontFamily:"Inter,system-ui,sans-serif" },
  topbar:  { borderBottom:"1px solid rgba(255,255,255,.07)", padding:"20px 32px",
             display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:16 },
  h1:      { fontSize:22, fontWeight:800, margin:"6px 0 4px", lineHeight:1.3 },
  crumb:   { fontSize:11, color:"#818cf8", fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase" },
  sub:     { fontSize:13, color:"#64748b", margin:0 },
  steps:   { display:"flex", alignItems:"center", gap:10 },
  divLine: { width:24, height:1, background:"rgba(255,255,255,.08)" },
  body:    { maxWidth:1180, margin:"0 auto", padding:"28px 28px",
             display:"grid", gridTemplateColumns:"1fr 340px", gap:24, alignItems:"start" },
  col:     { display:"flex", flexDirection:"column", gap:20 },
  card:    { background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:16, padding:24 },
  cTitle:  { fontSize:13, fontWeight:700, margin:"0 0 18px", display:"flex", alignItems:"center", gap:8 },
  dot:     (c)=>({ width:8, height:8, borderRadius:"50%", background:c, flexShrink:0 }),
  label:   { fontSize:11, color:"#64748b", fontWeight:700, letterSpacing:"0.1em",
             textTransform:"uppercase", marginBottom:6, display:"block" },
  input:   { width:"100%", background:"#0e0e26", border:"1px solid rgba(255,255,255,.1)",
             borderRadius:10, padding:"11px 14px", fontSize:13, color:"#fff",
             outline:"none", boxSizing:"border-box", fontFamily:"inherit" },
  row:     { display:"flex", justifyContent:"space-between", alignItems:"center",
             padding:"9px 0", borderBottom:"1px solid rgba(255,255,255,.05)", fontSize:13 },
  btnPri:  { width:"100%", padding:"14px 0", borderRadius:12,
             background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff",
             fontWeight:700, fontSize:14, border:"none", cursor:"pointer",
             display:"flex", alignItems:"center", justifyContent:"center", gap:8 },
  btnOff:  { width:"100%", padding:"14px 0", borderRadius:12, background:"rgba(255,255,255,.05)",
             color:"#475569", fontWeight:700, fontSize:14, border:"none",
             cursor:"not-allowed", display:"flex", alignItems:"center", justifyContent:"center", gap:8 },
  btnGrn:  { width:"100%", padding:"14px 0", borderRadius:12, background:"#16a34a",
             color:"#fff", fontWeight:700, fontSize:14, border:"none", cursor:"pointer",
             display:"flex", alignItems:"center", justifyContent:"center", gap:8 },
  pBar:    { height:6, background:"rgba(255,255,255,.06)", borderRadius:99, overflow:"hidden", marginTop:6 },
  net:     (a)=>({ padding:"12px 14px", borderRadius:10, position:"relative",
             border: a?"2px solid #6366f1":"1px solid rgba(255,255,255,.08)",
             background: a?"rgba(99,102,241,.1)":"transparent",
             opacity: a?1:.4, cursor: a?"default":"not-allowed" }),
  netNm:   { fontSize:13, fontWeight:700, margin:"0 0 2px" },
  netSb:   (a)=>({ fontSize:11, color: a?"#a5b4fc":"#64748b", margin:0 }),
  aDot:    { position:"absolute", top:8, right:8, width:7, height:7, borderRadius:"50%", background:"#6366f1" },
  res:     { marginTop:16, padding:14, borderRadius:12,
             background:"rgba(74,222,128,.05)", border:"1px solid rgba(74,222,128,.2)", fontSize:12 },
  sBar:    { display:"flex", justifyContent:"space-between", fontSize:10, fontWeight:700,
             textTransform:"uppercase", letterSpacing:"0.1em", color:"#334155" },
  sDot:    (c)=>({ display:"inline-block", width:6, height:6, borderRadius:"50%", background:c, marginRight:5 }),
};

function StepBadge({ n, label, active, done }) {
  const col = done ? "#4ade80" : active ? "#a5b4fc" : "#334155";
  const circBg = done ? "rgba(74,222,128,.15)" : active ? "rgba(99,102,241,.25)" : "rgba(255,255,255,.04)";
  const circBd = done ? "#4ade80" : active ? "#6366f1" : "rgba(255,255,255,.1)";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, fontWeight:600, color:col }}>
      <span style={{ width:26, height:26, borderRadius:"50%", display:"flex", alignItems:"center",
                     justifyContent:"center", fontSize:11, fontWeight:700, border:`1.5px solid ${circBd}`,
                     background:circBg, flexShrink:0 }}>
        {done ? "✓" : n}
      </span>
      {label}
    </div>
  );
}

function PRow({ label, pct, g1, g2, active }) {
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:5 }}>
        <span style={{ color:active?"#a5b4fc":"#475569", fontWeight:active?600:400 }}>{label}</span>
        <span style={{ color:"#475569", fontFamily:"monospace" }}>{pct>0?`${Math.round(pct)}%`:"—"}</span>
      </div>
      <div style={C.pBar}>
        <div style={{ height:"100%", borderRadius:99, width:`${pct}%`,
                      transition:"width .7s", background:`linear-gradient(90deg,${g1},${g2})` }} />
      </div>
    </div>
  );
}

export default function Studio() {
  const [file, setFile]         = useState(null);
  const [preview, setPreview]   = useState(null);
  const [wid, setWid]           = useState("TrustLens_Artist");
  const [busy, setBusy]         = useState(false);
  const [pct, setPct]           = useState(0);
  const [task, setTask]         = useState("");
  const [step, setStep]         = useState(0);
  const [seal, setSeal]         = useState(null);
  const [txHash, setTxHash]     = useState("");
  const [sealedUrl, setSealedUrl] = useState(null); // blob URL của ảnh đã nhúng thủy vân
  const [gasEth, setGasEth]     = useState(null);  // ước tính phí gas thực (ETH string)
  const [gasUsd, setGasUsd]     = useState(null);  // ước tính phí gas thực (USD string)

  const onDrop = useCallback(fs => {
    const f = fs[0];
    if (f) { setFile(f); setPreview(URL.createObjectURL(f)); setStep(0); setPct(0); setSeal(null); setTxHash(""); setSealedUrl(null); }
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop, accept:{"image/*":[".jpeg",".jpg",".png",".tiff"]}, multiple:false,
  });

  // Lấy phí gas thực từ mạng Sepolia khi component mount
  useEffect(() => {
    async function fetchGas() {
      try {
        if (!window.ethereum) return;
        const provider = new ethers.BrowserProvider(window.ethereum);
        const feeData  = await provider.getFeeData();
        // gasPrice (wei) * 200_000 gas units (registerCopyright ước tính)
        const GAS_UNITS = 200_000n;
        const gasPrice  = feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n;
        const costWei   = gasPrice * GAS_UNITS;
        const costEth   = Number(costWei) / 1e18;
        // Lấy giá ETH/USD từ CoinGecko (public, no key)
        let ethPriceUsd = 0;
        try {
          const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
          const j   = await res.json();
          ethPriceUsd = j?.ethereum?.usd ?? 0;
        } catch(_) {}
        setGasEth(costEth.toFixed(5));
        setGasUsd(ethPriceUsd > 0 ? (costEth * ethPriceUsd).toFixed(2) : null);
      } catch(e) { console.warn("fetchGas:", e); }
    }
    fetchGas();
  }, []);

  const go = async () => {
    if (!file) return toast.error("Vui lòng chọn một tác phẩm!");
    if (!wid.trim()) return toast.error("Vui lòng nhập định danh!");
    try {
      setBusy(true); setStep(1); setPct(15); setTask("Đang nhúng thủy vân số (DCT)...");
      const form = new FormData(); form.append("file",file); form.append("watermark_id",wid);
      const r = await fetch(`${BACKEND_URL}/seal`,{method:"POST",body:form});
      if (!r.ok) throw new Error("Lỗi Backend AI");
      const sha  = r.headers.get("X-Image-SHA256");
      const ipfs = r.headers.get("X-IPFS-Link");
      const sealedBlob = await r.blob();
      if (sealedUrl) URL.revokeObjectURL(sealedUrl);
      setSealedUrl(URL.createObjectURL(sealedBlob));
      setPct(40);

      setTask("Đang quét trùng lặp...");
      const vf = new FormData(); vf.append("file",file);
      const vr = await fetch(`${BACKEND_URL}/verify`,{method:"POST",body:vf});
      const vd = await vr.json(); setPct(60);

      let parent = "0x00";
      if (vd.best_match && vd.best_match.distance<15 && vd.best_match.sha256!==sha) {
        toast("⚠️ Phát hiện tác phẩm phái sinh.",{icon:"🔗"});
        parent = vd.best_match.sha256;
      }
      setSeal({sha,ipfs}); setStep(2); setTask("Gọi Smart Contract...");
      await ensureSepolia(); setPct(75);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer  = await provider.getSigner();
      const ct      = new ethers.Contract(CONTRACT_ADDRESS,abi,signer);
      setTask("Xác nhận trên MetaMask...");
      const tx = await ct.registerCopyright(await signer.getAddress(),sha,wid,parent,ipfs||"");
      setTask("Ghi khối Sepolia..."); setPct(90);
      await tx.wait();
      setTxHash(tx.hash); setStep(3); setPct(100); setTask("Hoàn tất!");
      toast.success("🎉 Đăng ký bản quyền thành công!");
    } catch(e) {
      toast.error(e.message||"Lỗi không xác định"); setStep(0); setPct(0);
    } finally { setBusy(false); }
  };

  const p1 = step>1?100:step===1?pct:0;
  const p2 = step>2?100:step===2?Math.max(0,((pct-60)/40)*100):0;

  return (
    <div style={C.page}>

      {/* TOP BAR */}
      <div style={C.topbar}>
        <div>
          <p style={C.crumb}>Studio › Đăng ký mới</p>
          <h1 style={C.h1}>Đăng ký Tác phẩm &amp; Đúc NFT</h1>
          <p style={C.sub}>Nhúng thủy vân số DCT · Ghi bản quyền lên Ethereum Blockchain</p>
        </div>
        <div style={C.steps}>
          <StepBadge n="1" label="Thủy vân AI"  active={step===1} done={step>1} />
          <div style={C.divLine}/>
          <StepBadge n="2" label="Blockchain"   active={step===2} done={step>2} />
          <div style={C.divLine}/>
          <StepBadge n="3" label="Hoàn tất"     active={false}    done={step===3} />
        </div>
      </div>

      {/* BODY */}
      <div style={C.body}>

        {/* ── LEFT ── */}
        <div style={C.col}>

          {/* DROPZONE */}
          <div {...getRootProps()} style={{
            border: isDragActive?"2px dashed #6366f1":"2px dashed rgba(255,255,255,.12)",
            background: isDragActive?"rgba(99,102,241,.08)":"rgba(255,255,255,.02)",
            borderRadius:16, minHeight:280, display:"flex", alignItems:"center",
            justifyContent:"center", cursor:"pointer", transition:"all .2s",
            position:"relative", overflow:"hidden",
          }}>
            <input {...getInputProps()} />
            {preview ? (
              <>
                <img src={preview} alt="preview" style={{ position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"contain",padding:16 }} />
                {busy && (
                  <div style={{ position:"absolute",bottom:16,left:16,right:16,background:"rgba(0,0,0,.8)",
                                backdropFilter:"blur(6px)",borderRadius:10,padding:"10px 16px",
                                display:"flex",alignItems:"center",gap:10 }}>
                    <span style={{ width:16,height:16,borderRadius:"50%",border:"2px solid rgba(255,255,255,.2)",
                                   borderTopColor:"#a5b4fc",animation:"spin 1s linear infinite",
                                   display:"inline-block",flexShrink:0 }}/>
                    <span style={{ fontSize:13,color:"#a5b4fc",fontWeight:500 }}>{task}</span>
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign:"center",padding:"40px 24px" }}>
                <div style={{ width:72,height:72,borderRadius:16,background:"rgba(99,102,241,.1)",
                              border:"1px solid rgba(99,102,241,.2)",display:"flex",alignItems:"center",
                              justifyContent:"center",fontSize:32,margin:"0 auto 20px" }}>☁️</div>
                <p style={{ fontWeight:700,fontSize:17,marginBottom:8,color:"#fff" }}>Kéo &amp; thả ảnh vào đây</p>
                <p style={{ fontSize:13,color:"#475569",marginBottom:20 }}>JPG · PNG · TIFF &nbsp;·&nbsp; Tối đa 50MB</p>
                <button onClick={e=>{e.stopPropagation();open();}}
                  style={{ padding:"10px 28px",borderRadius:10,background:"#6366f1",
                           color:"#fff",fontWeight:600,fontSize:13,border:"none",cursor:"pointer" }}>
                  Chọn tệp từ thiết bị
                </button>
              </div>
            )}
          </div>

          {/* AI PROGRESS */}
          <div style={C.card}>
            <h3 style={C.cTitle}>
              <span style={{ ...C.dot("#6366f1") }}/>
              Trình phân tích AI
            </h3>
            <PRow label={step===1?task:"Trích xuất dấu vân tay số (Digital Fingerprint)"}
                  pct={p1} g1="#6366f1" g2="#8b5cf6" active={step>=1}/>
            <PRow label={step===2?task:"Đăng ký Smart Contract & Lưu trữ IPFS"}
                  pct={p2} g1="#8b5cf6" g2="#ec4899" active={step>=2}/>

            {/* Hiện preview + nút tải ngay sau khi thủy vân hoàn tất */}
            {sealedUrl && (
              <div style={{ display:"flex", alignItems:"center", gap:14, padding:12, borderRadius:12,
                            background:"rgba(99,102,241,.06)", border:"1px solid rgba(99,102,241,.2)", marginBottom:4 }}>
                <img src={sealedUrl} alt="sealed" style={{ width:80, height:80, objectFit:"cover",
                  borderRadius:8, border:"1px solid rgba(255,255,255,.08)", flexShrink:0 }} />
                <div>
                  <p style={{ fontSize:13, fontWeight:700, color:"#c7d2fe", marginBottom:4 }}>
                    ✅ Ảnh đã nhúng thủy vân (có tên chủ bên trong)
                  </p>
                  <p style={{ fontSize:11, color:"#64748b", marginBottom:10 }}>
                    Tải về để lưu bản có dấu bản quyền DCT
                  </p>
                  <a href={sealedUrl}
                    download={`sealed_${seal?.sha?.slice(0,8) || "image"}.png`}
                    style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"7px 14px",
                             borderRadius:8, background:"#6366f1", color:"#fff",
                             textDecoration:"none", fontWeight:700, fontSize:12 }}>
                    ⬇️ Tải ảnh đã đóng dấu
                  </a>
                </div>
              </div>
            )}

            {step===3 && seal && (
              <div style={C.res}>
                <p style={{ color:"#4ade80",fontWeight:700,marginBottom:8 }}>🎉 Đăng ký thành công!</p>
                <p style={{ color:"#94a3b8",fontFamily:"monospace",wordBreak:"break-all",marginBottom:4 }}>
                  <span style={{ color:"#475569" }}>SHA256: </span>{seal.sha}
                </p>
                {txHash && <a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noreferrer"
                               style={{ color:"#818cf8",display:"block",marginTop:4,wordBreak:"break-all" }}>
                  Tx: {txHash.slice(0,32)}...</a>}
                {seal.ipfs && <a href={seal.ipfs} target="_blank" rel="noreferrer"
                                  style={{ color:"#fbbf24",display:"block",marginTop:4 }}>📁 IPFS</a>}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT ── */}
        <div style={C.col}>

          {/* BLOCKCHAIN CONFIG */}
          <div style={C.card}>
            <h3 style={C.cTitle}>⛓️ Thiết lập Blockchain</h3>

            <label style={C.label}>Mạng lưới</label>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20 }}>
              <div style={C.net(true)}>
                <div style={C.aDot}/>
                <p style={C.netNm}>Ethereum</p>
                <p style={C.netSb(true)}>Sepolia Testnet</p>
              </div>
              <div style={C.net(false)}>
                <p style={C.netNm}>Polygon</p>
                <p style={C.netSb(false)}>Sắp ra mắt</p>
              </div>
            </div>

            <label style={C.label}>Định danh tác giả</label>
            <input style={C.input} type="text" value={wid}
              onChange={e=>setWid(e.target.value)}
              disabled={busy||step===3}
              placeholder="Ví dụ: NguyenVanA_2026"/>

            <div style={{ marginTop:20,paddingTop:16,borderTop:"1px solid rgba(255,255,255,.06)" }}>
              <div style={C.row}>
                <span style={{ color:"#64748b" }}>Phí gas ước tính</span>
                <span>{gasEth ? `~${gasEth} ETH` : <span style={{color:"#475569"}}>Đang tải...</span>}</span>
              </div>
              <div style={C.row}>
                <span style={{ color:"#64748b" }}>Phí dịch vụ</span>
                <span style={{ color:"#4ade80",fontWeight:600 }}>Miễn phí</span>
              </div>
              <div style={{ ...C.row,borderBottom:"none",fontWeight:700,fontSize:14,marginTop:4 }}>
                <span>Tổng cộng</span>
                <span style={{ color:"#818cf8" }}>
                  {gasUsd ? `~$${gasUsd}` : gasEth ? `~${gasEth} ETH` : "—"}
                </span>
              </div>
            </div>
          </div>

          {/* CTA */}
          {step===3 ? (
            <button style={C.btnGrn} onClick={()=>{setFile(null);setPreview(null);setStep(0);setPct(0);setTxHash("");setSeal(null);}}>
              ✅ Đăng ký tác phẩm khác
            </button>
          ) : (
            <button style={!file?C.btnOff:busy?{...C.btnPri,opacity:.6,cursor:"wait"}:C.btnPri}
              onClick={go} disabled={!file||busy}>
              {busy ? (
                <><span style={{ width:16,height:16,borderRadius:"50%",border:"2px solid rgba(255,255,255,.25)",
                                 borderTopColor:"#fff",animation:"spin 1s linear infinite",display:"inline-block" }}/>
                Đang xử lý...</>
              ) : "🔒 Xác thực & Ghi Blockchain"}
            </button>
          )}

          {/* BENEFITS */}
          <div style={{ ...C.card,background:"rgba(99,102,241,.07)",border:"1px solid rgba(99,102,241,.15)" }}>
            <h3 style={{ ...C.cTitle,color:"#a5b4fc" }}>⚡ Lợi ích xác thực</h3>
            {["Chứng chỉ bản quyền vĩnh viễn, không thể tẩy xóa",
              "Bảo vệ trước AI tạo hình và Deepfake",
              "Sẵn sàng đúc NFT thương mại toàn cầu"].map((t,i)=>(
              <div key={i} style={{ display:"flex",gap:8,fontSize:12,color:"#94a3b8",marginBottom:8,lineHeight:1.6 }}>
                <span style={{ color:"#6366f1",flexShrink:0 }}>●</span>{t}
              </div>
            ))}
          </div>

          {/* STATUS */}
          <div style={C.sBar}>
            <span><span style={C.sDot("#4ade80")}/>Blockchain: Online</span>
            <span><span style={C.sDot("#818cf8")}/>AI Node: Active</span>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
