import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { ethers } from "ethers";
import abi from "../abi/ImageRegistryABI.json";
import { BACKEND_URL, CONTRACT_ADDRESS } from "../config.js";

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
  const [err,     setErr]     = useState("");

  const onDrop = useCallback(fs=>{
    const f=fs[0];
    if(f){ setFile(f); setPreview(URL.createObjectURL(f)); setResult(null); setChain(null); setPct(0); setErr(""); }
  },[]);
  const {getRootProps,getInputProps,isDragActive,open} = useDropzone({
    onDrop, accept:{"image/*":[".jpeg",".jpg",".png",".tiff"]}, multiple:false,
  });

  const go = async () => {
    if (!file) return;
    try {
      setBusy(true); setPct(10); setTask("Phân tích ELA & pHash..."); setErr("");
      const form=new FormData(); form.append("file",file);
      const r=await fetch(`${BACKEND_URL}/verify`,{method:"POST",body:form});
      if(!r.ok) throw new Error(`Backend lỗi (${r.status})`);
      setPct(55); setTask("Tra cứu blockchain...");
      const data=await r.json();
      let rec=null;
      try {
        if(window.ethereum){
          const p=new ethers.BrowserProvider(window.ethereum);
          const ct=new ethers.Contract(CONTRACT_ADDRESS,abi,p);
          if(data.sha256){
            const rv=await ct.getRecordByHash(data.sha256);
            if(rv&&rv.author&&rv.author!=="0x0000000000000000000000000000000000000000") rec=rv;
          }
        }
      } catch(_){}
      setPct(100); setTask("Hoàn tất!"); setResult(data); setChain(rec);
    } catch(e){ console.error(e); setErr(e.message||"Lỗi không xác định"); }
    finally{ setBusy(false); }
  };

  const getVerdict = ()=>{
    if(!result) return "unknown";
    const d=result.best_match?.distance;
    if(d==null) return "unknown";
    if(d<=5) return "authentic"; if(d<=20) return "suspicious"; return "forged";
  };
  const vd = VERDICT[getVerdict()];

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
    dot:   (c)=>({width:8,height:8,borderRadius:"50%",background:c,flexShrink:0}),
    dz:    (drag)=>({border:drag?"2px dashed #8b5cf6":"2px dashed rgba(255,255,255,.12)",
                     background:drag?"rgba(139,92,246,.08)":"rgba(255,255,255,.02)",
                     borderRadius:16,minHeight:260,display:"flex",alignItems:"center",
                     justifyContent:"center",cursor:"pointer",transition:"all .2s",position:"relative",overflow:"hidden"}),
    pBar:  {height:6,background:"rgba(255,255,255,.06)",borderRadius:99,overflow:"hidden"},
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

        {/* LEFT */}
        <div style={s.col}>
          <div {...getRootProps()} style={s.dz(isDragActive)}>
            <input {...getInputProps()}/>
            {preview?(
              <>
                <img src={preview} alt="suspect" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"contain",padding:16}}/>
                {busy&&(
                  <div style={{position:"absolute",inset:0,background:"rgba(8,8,24,.8)",
                               display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
                    <span style={{width:40,height:40,borderRadius:"50%",border:"3px solid rgba(255,255,255,.1)",
                                  borderTopColor:"#c4b5fd",animation:"spin 1s linear infinite",display:"inline-block"}}/>
                    <p style={{fontSize:13,color:"#c4b5fd",fontWeight:600,margin:0}}>{task}</p>
                    <div style={{width:200,...s.pBar}}>
                      <div style={{height:"100%",background:"linear-gradient(90deg,#8b5cf6,#ec4899)",
                                   borderRadius:99,transition:"width .5s",width:`${pct}%`}}/>
                    </div>
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

          {err&&(
            <div style={{padding:14,borderRadius:12,background:"rgba(239,68,68,.08)",
                         border:"1px solid rgba(239,68,68,.25)",fontSize:13,color:"#f87171"}}>
              ⚠️ {err}
              <span style={{fontSize:12,color:"#64748b",display:"block",marginTop:4}}>
                Đảm bảo backend đang chạy: <code style={{color:"#818cf8"}}>uvicorn app:app --reload</code>
              </span>
            </div>
          )}

          {result&&(
            <div style={s.card}>
              <h3 style={s.cTit}><span style={s.dot("#8b5cf6")}/>Kết quả phân tích AI</h3>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
                {[
                  {l:"Khoảng cách Hash",v:d??"-",u:"bit",c:d==null?"#94a3b8":d<=5?"#4ade80":d<=20?"#fbbf24":"#f87171"},
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

              {result.watermark_id_extracted&&(
                <div style={{marginBottom:16,padding:"10px 14px",borderRadius:10,
                             background:"rgba(99,102,241,.08)",border:"1px solid rgba(99,102,241,.2)"}}>
                  <span style={{fontSize:11,color:"#64748b",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase"}}>
                    Thủy vân trích xuất:{" "}
                  </span>
                  <span style={{fontSize:13,color:"#a5b4fc",fontWeight:600}}>{result.watermark_id_extracted}</span>
                </div>
              )}

              {result.best_match&&(
                <div style={{marginBottom: result.best_match.forgery_image?16:0,
                             padding:12,borderRadius:10,background:"rgba(255,255,255,.03)",
                             border:"1px solid rgba(255,255,255,.07)",fontFamily:"monospace",
                             fontSize:11,color:"#64748b",wordBreak:"break-all"}}>
                  <span>SHA256 khớp: </span><span style={{color:"#818cf8"}}>{result.best_match.sha256}</span>
                  <span style={{display:"block",marginTop:4}}>
                    Chủ sở hữu: <span style={{color:"#c4b5fd"}}>{result.best_match.watermark_id}</span>
                  </span>
                </div>
              )}

              {result.best_match?.forgery_image&&(
                <div>
                  <p style={{fontSize:12,color:"#f87171",fontWeight:700,marginBottom:10}}>
                    🚨 ELA phát hiện vùng bị can thiệp (khung đỏ):
                  </p>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div>
                      <p style={{fontSize:11,color:"#64748b",marginBottom:6,textAlign:"center"}}>Ảnh gốc</p>
                      <img src={preview} alt="original"
                           style={{width:"100%",borderRadius:10,border:"1px solid rgba(255,255,255,.1)"}}/>
                    </div>
                    <div>
                      <p style={{fontSize:11,color:"#f87171",marginBottom:6,textAlign:"center"}}>Phân tích ELA</p>
                      <img src={`data:image/png;base64,${result.best_match.forgery_image}`}
                           alt="ELA"
                           style={{width:"100%",borderRadius:10,border:"1px solid rgba(239,68,68,.3)"}}/>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div style={s.col}>
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

          <div style={s.card}>
            <h3 style={s.cTit}><span style={s.dot("#6366f1")}/>Hồ sơ Blockchain</h3>
            {chain?(
              <div>
                <div style={s.row}><span style={{color:"#64748b"}}>Tác giả</span>
                  <span style={{color:"#818cf8",fontFamily:"monospace",fontSize:12}}>{chain.author?.slice(0,16)}...</span></div>
                <div style={s.row}><span style={{color:"#64748b"}}>Định danh</span>
                  <span style={{color:"#c4b5fd"}}>{chain.watermarkId}</span></div>
                <div style={{...s.row,borderBottom:"none"}}><span style={{color:"#64748b"}}>Trạng thái</span>
                  <span style={{color:"#4ade80",fontWeight:600}}>✅ Đã xác minh</span></div>
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

          <button style={!file||busy?s.btnOff:s.btnPri} onClick={go} disabled={!file||busy}>
            {busy?(<><span style={{width:16,height:16,borderRadius:"50%",border:"2px solid rgba(255,255,255,.2)",
                                   borderTopColor:"#fff",animation:"spin 1s linear infinite",display:"inline-block"}}/>Đang phân tích...</>)
                 :"🔬 Bắt đầu giám định AI"}
          </button>

          <div style={{...s.card,background:"rgba(139,92,246,.06)",border:"1px solid rgba(139,92,246,.15)"}}>
            <h3 style={{...s.cTit,color:"#c4b5fd"}}>🔬 Công nghệ pháp lý</h3>
            {["ELA — Phân tích sai số nén JPEG","pHash — So khớp thị giác 64-bit",
              "DCT — Trích xuất thủy vân số","Ethereum — Tra cứu NFT on-chain"].map((t,i)=>(
              <div key={i} style={{display:"flex",gap:8,fontSize:12,color:"#94a3b8",marginBottom:8,lineHeight:1.6}}>
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
