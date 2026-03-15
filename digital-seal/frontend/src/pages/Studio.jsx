import { useState, useCallback, useEffect, useRef } from "react";
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

/** Chuyển "ipfs://Qm..." → "https://gateway.pinata.cloud/ipfs/Qm..." để mở được trong Chrome. */
function ipfsToGateway(uri) {
  if (!uri) return uri;
  if (uri.startsWith('ipfs://')) return `https://gateway.pinata.cloud/ipfs/${uri.slice(7)}`;
  return uri;
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
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [step, setStep] = useState(0); // 0=init, 1=seal, 2=blockchain, 3=done
  const [pct, setPct] = useState(0);
  const [task, setTask] = useState("");
  const [busy, setBusy] = useState(false);

  // Form
  const [registrantName, setRegistrantName] = useState("");
  const [wid, setWid] = useState("");
  const [royaltyPct, setRoyaltyPct] = useState("5"); // ERC-2981 Royalty % (mặc định 5%)
  const [seal, setSeal]         = useState(null);
  const [txHash, setTxHash]     = useState("");
  const [sealedUrl, setSealedUrl] = useState(null); // blob URL của ảnh đã nhúng thủy vân
  const [gasEth, setGasEth]     = useState(null);  // ước tính phí gas thực (ETH string)
  const [gasUsd, setGasUsd]     = useState(null);  // ước tính phí gas thực (USD string)
  const [legacyGasHex, setLegacyGasHex] = useState(null); // hex string from eth_gasPrice when fallback
  const runningRef = useRef(false); // guard against double-click / StrictMode double-invoke

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
        // Some providers (or wallet RPC proxies) do not expose `eth_maxPriorityFeePerGas`
        // which causes provider.getFeeData() to throw. Try getFeeData(), but fall back to
        // asking the provider for `eth_gasPrice` which is widely supported.
        let feeData = null;
        try {
          feeData = await provider.getFeeData();
          // clear any previous fallback flag
          setLegacyGasHex(null);
        } catch(err) {
          console.warn("getFeeData failed, falling back to eth_gasPrice:", err);
          try {
            const gasPriceHex = await window.ethereum.request({ method: "eth_gasPrice" });
            const gasPriceBn = BigInt(gasPriceHex);
            feeData = { gasPrice: gasPriceBn, maxFeePerGas: gasPriceBn, maxPriorityFeePerGas: 0n };
            // remember the hex so we can use it as an override when sending tx
            setLegacyGasHex(gasPriceHex);
          } catch(err2) {
            console.warn("eth_gasPrice fallback failed:", err2);
            feeData = { gasPrice: 0n, maxFeePerGas: 0n, maxPriorityFeePerGas: 0n };
            setLegacyGasHex(null);
          }
        }

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
    if (runningRef.current || busy) return; // prevent double-click / concurrent runs
    if (!file) return toast.error("Vui lòng chọn một tác phẩm!");
    if (!registrantName.trim()) return toast.error("Vui lòng nhập họ và tên người đăng ký!");
    if (!wid.trim()) return toast.error("Vui lòng nhập định danh!");
    runningRef.current = true;
    try {
      setBusy(true); setStep(1); setPct(5); setTask("Kết nối ví MetaMask...");

      // ── Bước 0: Ký xác thực quyền sở hữu ví trước khi seal ──────────────
      let walletAddress = '';
      let walletSignature = '';
      if (window.ethereum) {
        try {
          await ensureSepolia();
          const provider = new ethers.BrowserProvider(window.ethereum);
          const signer   = await provider.getSigner();
          walletAddress  = await signer.getAddress();

          setTask("Ký xác thực với MetaMask...");
          // Message format phải khớp với backend: "TrustLens|{watermark_id}|{wallet_address}"
          const signMsg = `TrustLens|${wid}|${walletAddress}`;
          walletSignature = await signer.signMessage(signMsg);
          console.info('[Studio] Wallet signature OK:', walletAddress.slice(0,10));
        } catch (sigErr) {
          // User từ chối ký → dừng flow
          if (sigErr.code === 4001 || sigErr.message?.includes('rejected')) {
            toast.error('⛔ Bạn đã từ chối ký xác thực. Vui lòng ký để tiếp tục!');
            setStep(0); setPct(0); setBusy(false); runningRef.current = false;
            return;
          }
          // MetaMask không có hoặc lỗi khác → tiếp tục ở chế độ không chữ ký (dev)
          console.warn('[Studio] signMessage failed (dev mode, no sig):', sigErr.message);
          walletAddress = ''; walletSignature = '';
        }
      }
      // ──────────────────────────────────────────────────────────────────────

      setPct(15); setTask("Đang nhúng thủy vân số (DCT)...");
      const form = new FormData();
      form.append("file", file);
      form.append("watermark_id", wid);
      form.append("registrant_name", registrantName);
      if (walletAddress)  form.append("wallet_address", walletAddress);
      if (walletSignature) form.append("signature", walletSignature);
  const r = await fetch(`${BACKEND_URL}/seal`,{method:"POST",body:form});
      if (r.status === 429) {
        toast.error("⏳ Bạn đang gửi yêu cầu quá nhanh (Spam). Vui lòng đợi 1 phút rồi thử lại sau!", { duration: 6000 });
        setStep(0); setPct(0); setBusy(false); runningRef.current = false;
        return;
      }
      if (r.status === 409) {
        // Duplicate / derivative detected by backend at seal time
        const errData = await r.json().catch(()=>({}));
        const msg = errData.error || "Ảnh này đã được seal hoặc tương tự ảnh đã đăng ký trước đó!";
        toast.error(`⛔ ${msg}`, { duration: 10000 });
        setStep(0); setPct(0); setBusy(false); runningRef.current = false;
        return;
      }
      if (!r.ok) throw new Error("Lỗi Backend AI");
      const sha  = r.headers.get("X-Image-SHA256");
      const ipfs = r.headers.get("X-IPFS-Link");
      const sealedBlob = await r.blob();
      if (sealedUrl) URL.revokeObjectURL(sealedUrl);
      setSealedUrl(URL.createObjectURL(sealedBlob));
      setPct(40);

      setTask("Đang quét trùng lặp...");
      // Gửi bản ĐÃ SEAL lên /verify để so sánh đúng với bản trong DB
      const sealedFile = new File([sealedBlob], "sealed.png", { type: "image/png" });
      const vf = new FormData(); vf.append("file", sealedFile);
      const vr = await fetch(`${BACKEND_URL}/verify`,{method:"POST",body:vf});
      const vd = await vr.json(); setPct(60);

      // Detect derivative / parent using multi-metric result from backend.
      // Backend now reports matched_by: ['dhash'|'phash'|'ssim'] and clamps distance
      // to DHASH_THRESHOLD (25) when phash/ssim matched but raw dhash is higher.
      // Accept a match if:
      //   (a) distance <= 25  (covers dhash match and clamped phash/ssim match), OR
      //   (b) matched_by array explicitly contains 'ssim' or 'phash'
      let parent = "";
      const bm = vd.best_match;

      // Case 0: SHA khớp hoàn toàn VÀ đã registered on-chain → không cho đăng ký lại
      if (bm && bm.sha256 === sha && bm.registered === true) {
        toast.error(
          `⛔ Tác phẩm này đã được đăng ký bản quyền trước đó (watermark: ${bm.watermark_id || '—'}). Không thể đăng ký lại!`,
          { duration: 8000 }
        );
        setStep(0); setPct(0); setBusy(false); runningRef.current = false;
        return;
      }

      if (bm && bm.sha256 !== sha) {
        const byMetric = Array.isArray(bm.matched_by) && bm.matched_by.length > 0;
        const byDist   = typeof bm.distance === 'number' && bm.distance <= 25;
        if (byMetric || byDist) {
          const methods = (bm.matched_by || []).join(', ') || `distance=${bm.distance}`;
          const ssimPct = bm.ssim_score != null ? ` · SSIM=${(bm.ssim_score*100).toFixed(0)}%` : '';
          const phashInfo = bm.phash_distance != null ? ` · pHash=${bm.phash_distance}` : '';

          // If the image was also detected as tampered/forged (crop, draw-over, etc.),
          // block the registration completely — do not allow registering a tampered
          // derivative as an original or even as a legitimate derivative.
          if (bm.forgery_image) {
            toast.error(
              "⛔ Ảnh bị phát hiện là đã chỉnh sửa / cắt ghép từ tác phẩm đã đăng ký. Không thể đăng ký!",
              { duration: 8000 }
            );
            setStep(0); setPct(0); setBusy(false);
            return;
          }

          toast(`🔗 Phát hiện tác phẩm phái sinh! (${methods}${ssimPct}${phashInfo})`,
                { icon:"⚠️", duration: 5000 });
          parent = bm.sha256;
        }
      }

      // If the image has no derivative match but is still flagged as forged
      // (e.g. the SHA matched a different record via watermark but pixels are tampered),
      // also block registration.
      if (!parent && bm && bm.forgery_image) {
        toast.error(
          "⛔ Ảnh bị phát hiện can thiệp / giả mạo. Không thể đăng ký bản quyền!",
          { duration: 8000 }
        );
        setStep(0); setPct(0); setBusy(false);
        return;
      }

      setSeal({sha,ipfs}); setStep(2); setTask("Gọi Smart Contract...");
      // Pre-check on-chain and backend to avoid attempting a blockchain tx that will revert
      try {
        // 1) check backend DB quickly via /exists (precise)
        try {
          const ex = await fetch(`${BACKEND_URL}/exists?sha=${encodeURIComponent(sha)}`).then(r=>r.json()).catch(()=>null);
          if (ex && ex.exists) {
            const rec = ex.record || {};
            console.warn('Duplicate detected in local DB', rec);
            toast.error(`Lỗi: Tác phẩm đã được đăng ký (CSDL). ${rec.registrant_name?`Người đăng ký: ${rec.registrant_name}. `:''}Định danh: ${rec.watermark_id || '—'}`);
            setStep(0); setPct(0); setBusy(false);
            return;
          }
        } catch(_) {
          // ignore
        }

        // 2) check on-chain via contract view call
        if (window.ethereum) {
          const providerCheck = new ethers.BrowserProvider(window.ethereum);
          const ctCheck = new ethers.Contract(CONTRACT_ADDRESS, abi, providerCheck);
          try {
            const rec = await ctCheck.getRecordByHash(sha);
            // rec.exists (bool) is at index 0 or property exists
            const existsOnChain = rec && (rec.exists === true || rec[0] === true);
            if (existsOnChain) {
              const owner = (rec.owner || rec[1]);
              toast.error(`Lỗi: Đã tồn tại on-chain (owner ${owner}). Không gửi giao dịch.`);
              setStep(0); setPct(0); setBusy(false);
              return;
            }
          } catch(_) {
            // view call failed — ignore and continue (we'll handle revert later)
          }
        }
      } catch(_) {
        // any network error — we'll still attempt tx but capture revert
      }

      await ensureSepolia(); setPct(75);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer  = await provider.getSigner();
      const ct      = new ethers.Contract(CONTRACT_ADDRESS,abi,signer);
      setTask("Xác nhận trên MetaMask...");
      let tx;
      try {
        // If we previously fell back to eth_gasPrice, include a legacy gasPrice override
        let overrides = {};
        if (legacyGasHex) {
          try {
            overrides = { gasPrice: BigInt(legacyGasHex), type: 0 };
            console.info("Using legacy gasPrice override for tx");
          } catch(e) { console.warn("Invalid legacyGasHex, skipping override", e); }
        }
        // The new contract expects `_parentHash` as a string, no need for bytes32 padding
        const parentHashStr = parent || "";
        
        // Calculate royalty basis points (Bps). E.g: 5.5% -> 5.5 * 100 = 550 Bps. Max is 10000 (100%).
        const parsedRoyalty = parseFloat(royaltyPct) || 0;
        const royaltyBps = Math.min(10000, Math.max(0, Math.floor(parsedRoyalty * 100)));

        tx = await ct.registerCopyright(
          await signer.getAddress(),
          sha || "",
          wid || "",
          parentHashStr,
          ipfs || "",
          BigInt(royaltyBps),
          overrides
        );
        setTask("Ghi khối Sepolia..."); setPct(90);
        await tx.wait();
        // After on-chain confirmation, inform backend so record is marked registered
        try {
          const ownerAddr = await signer.getAddress();
          await fetch(`${BACKEND_URL}/confirm_registration`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sha,
              tx_hash: tx.hash,
              owner: ownerAddr,
              registrant_name: registrantName,
              parent_hash: parent || null
            })
          });
          console.info('Confirmed registration to backend', sha, tx.hash, parent);
        } catch(err) {
          console.warn('Failed to confirm registration to backend', err);
        }
      } catch(innerE) {
        // Try to surface a clearer revert reason when present
        const msg = innerE?.reason || innerE?.error?.message || innerE?.message || '';
        // Some providers include 'execution reverted: <reason>' inside data
        const m = (msg || '').toString().match(/execution reverted[:\s]*"?([^"\n]*)"?/i);
        const reason = m ? m[1] : msg;
        toast.error(reason || "Giao dịch bị revert (xem console)");
        console.error("tx failed:", innerE);
        setStep(0); setPct(0);
        setBusy(false);
        return;
      }
      setTxHash(tx.hash); setStep(3); setPct(100); setTask("Hoàn tất!");
      toast.success("🎉 Đăng ký bản quyền thành công!");
    } catch(e) {
      toast.error(e.message||"Lỗi không xác định"); setStep(0); setPct(0);
    } finally { setBusy(false); runningRef.current = false; }
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
                {seal.ipfs && <a href={ipfsToGateway(seal.ipfs)} target="_blank" rel="noreferrer"
                                  style={{ color:"#fbbf24",display:"block",marginTop:4 }}>📁 Xem Metadata IPFS</a>}
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

            <label style={C.label}>Họ và tên người đăng ký</label>
            <input style={C.input} type="text" value={registrantName}
              onChange={e=>setRegistrantName(e.target.value)}
              disabled={busy||step===3}
              placeholder="Ví dụ: Nguyễn Văn A"/>

            <label style={{...C.label,marginTop:12}}>Định danh tác giả (watermark id)</label>
            <input style={C.input} type="text" value={wid}
              onChange={e=>setWid(e.target.value)}
              disabled={busy||step===3}
              placeholder="Ví dụ: NguyenVanA_2026"/>

            <label style={{...C.label,marginTop:12}}>
              Tiền bản quyền NFT (%) <span style={{fontWeight:'normal',color:'#64748b'}}>(ERC-2981 Royalty)</span>
            </label>
            <input style={C.input} type="number" step="0.1" min="0" max="100" value={royaltyPct}
              onChange={e=>setRoyaltyPct(e.target.value)}
              disabled={busy||step===3}
              placeholder="Ví dụ: 5"/>

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
