import { useState, useEffect } from "react";
import { BACKEND_URL, CONTRACT_ADDRESS } from "../config";
import { ethers } from "ethers";
import abi from "../abi/ImageRegistryABI.json";

const ZERO_HASH = '0x' + '0'.repeat(64);

/** Normalise a parentHash returned from the contract into a plain hex string or '' if none. */
function normParentHash(raw) {
  if (!raw) return '';
  const s = raw.toString().toLowerCase().replace(/^0x/, '');
  // All-zeros = no parent
  if (/^0+$/.test(s)) return '';
  return s;  // return without 0x prefix to match sha256 strings in DB records
}

const PALETTE=["#6366f1","#8b5cf6","#a855f7","#06b6d4","#10b981","#f59e0b"];

export default function Explorer() {
  const [sel,    setSel]    = useState(null);
  const [search, setSearch] = useState("");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const filtered = records.filter(n=>
    (n.watermark_id||"").toLowerCase().includes(search.toLowerCase())||
    (n.registrant_name||"").toLowerCase().includes(search.toLowerCase())
  );

  const provenance = (sha) => {
    const chain = [];
    let map = {};
    for (const r of records) map[r.sha256] = r;
    let cur = map[sha];
    while (cur) { chain.unshift(cur); cur = map[cur.parentHash]; }
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

  // provChain state (on-chain preferred) will be built in an effect; fallback uses `provenance()`

  const [tokenId, setTokenId] = useState(null);
  const [provChain, setProvChain] = useState([]);
  const [provLoading, setProvLoading] = useState(false);

  // Fetch tokenId for selected record (if any) so we can link to OpenSea
  useEffect(() => {
    const loadToken = async () => {
      setTokenId(null);
      if (!sel || !sel.sha256) return;
      try {
        if (!window.ethereum) return;
        const provider = new ethers.BrowserProvider(window.ethereum);
        const ct = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);
        const tid = await ct.hashToTokenId(sel.sha256);
        // hashToTokenId returns uint256; treat 0 as not minted/found
        const n = Number(tid?.toString?.() || tid || 0);
        if (n && n > 0) setTokenId(n);
      } catch (e) {
        console.warn('hashToTokenId failed', e);
      }
    };
    loadToken();
  }, [sel]);

  // Load records from backend and enrich with on-chain parent info
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // registered_only=true → only confirmed on-chain records
        // limit=0 → no cap, fetch ALL registered records so the count is always accurate
        const res = await fetch(`${BACKEND_URL}/records?registered_only=true&limit=0`);
        const j = await res.json();
        const recs = (j.records || []);

        if (window.ethereum && recs.length > 0) {
          const provider = new ethers.BrowserProvider(window.ethereum);
          const ct = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);
          // fetch on-chain metadata in parallel
          const enriched = await Promise.all(recs.map(async (r) => {
            try {
              const rv = await ct.getRecordByHash(r.sha256);
              const exists = rv.exists ?? rv[0];
              const owner = rv.owner ?? rv[1];
              const watermarkId = rv.watermarkId ?? rv[2];
              // Normalise parentHash: ZeroHash → '' so UI correctly shows 'Tác phẩm gốc'
              const parentHash = normParentHash(rv.parentHash ?? rv[3]);
              return { ...r, owner, watermark_id: watermarkId || r.watermark_id, parentHash };
            } catch (e) {
              return { ...r, parentHash: '' };
            }
          }));
          setRecords(enriched);
        } else {
          // if no wallet, still show backend-registered records (parentHash may be empty)
          setRecords(recs.map(r=>({ ...r, parentHash: r.parentHash || '' })));
        }
      } catch (e) {
        console.error(e);
        setRecords([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Build provenance chain for selected record using on-chain data when possible.
  useEffect(() => {
    if (!sel) { setProvChain([]); return; }
    const build = async () => {
      setProvLoading(true);
      try {
        // prefer on-chain walk if provider available
        if (window.ethereum) {
          try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const ct = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);
            const chain = [];
            let cur = sel.sha256;
            const seen = new Set();
            for (let depth = 0; depth < 16 && cur; depth++) {
              if (seen.has(cur)) break;
              seen.add(cur);
              try {
                const rv = await ct.getRecordByHash(cur);
                const parentHash = normParentHash(rv.parentHash ?? rv[3]);
                const watermarkId = rv.watermarkId ?? rv[2] ?? '';
                const owner = rv.owner ?? rv[1] ?? '';
                // unshift to build root -> ... -> selected
                chain.unshift({ sha256: cur, parentHash, watermark_id: watermarkId, owner });
                if (!parentHash) break;
                cur = parentHash;
              } catch (e) {
                // on-chain call failed for this node; fallback to local provenance
                const local = provenance(cur);
                // local returns root->...->cur, append existing chain (which may be empty)
                const merged = local.concat(chain.filter(x=>!local.find(l=>l.sha256===x.sha256)));
                setProvChain(merged);
                return;
              }
            }
            setProvChain(chain);
            return;
          } catch (e) {
            // provider exists but something failed; fall back to local
            console.warn('Provenance on-chain walk failed, falling back to local records', e);
          }
        }
        // fallback: use local records to compute provenance
        setProvChain(provenance(sel.sha256));
      } finally {
        setProvLoading(false);
      }
    };
    build();
  }, [sel, records]);

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
                const isSelected = sel && sel.sha256 === n.sha256;
                const shortId = n.sha256 ? n.sha256.slice(0,10) : `id-${i}`;
                return (
                  <div key={n.sha256 || i} style={s.nftCard(isSelected,c)} onClick={()=>setSel(n)}>
                    <div style={s.thumb(c)}>
                      {n.sha256 ? (
                        <img
                          src={`${BACKEND_URL}/thumbnail?sha=${encodeURIComponent(n.sha256)}&size=480`}
                          alt={n.watermark_id || 'thumb'}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      ) : (
                        '🖼️'
                      )}
                      {n.parentHash && <span style={s.pill}>Phái sinh</span>}
                    </div>
                    <div style={s.nftBody}>
                      <p style={s.nftNm}>{n.watermark_id || shortId}</p>
                      <p style={s.nftAu}>@{n.registrant_name || '—'} · {n.created_at ? new Date(n.created_at*1000).toLocaleDateString('vi-VN') : '—'}</p>
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
                    <p style={{fontWeight:800,fontSize:15,margin:"0 0 2px"}}>{sel.watermark_id || sel.sha256}</p>
                    <p style={{color:"#64748b",fontSize:13,margin:0}}>@{sel.registrant_name || '—'}</p>
                  </div>
                  <button onClick={()=>setSel(null)}
                    style={{background:"none",border:"none",color:"#475569",fontSize:20,cursor:"pointer",lineHeight:1}}>×</button>
                </div>
                <div style={s.row}><span style={{color:"#64748b"}}>SHA</span><span style={{color:"#818cf8"}}>{sel.sha256 ? sel.sha256.slice(0,16)+"…" : '—'}</span></div>
                <div style={{...s.row,alignItems:'center'}}>
                  <span style={{color:"#64748b"}}>Chứng thực On‑chain</span>
                  <span>
                    {sel?.tx_hash ? (
                      <a href={`https://sepolia.etherscan.io/tx/${sel.tx_hash}`} target="_blank" rel="noreferrer" 
                        title={"Bấm để mở giao dịch trên Etherscan — các giảng viên sẽ thấy 'Success'"}
                        style={{background:'#0b1220',border:'1px solid rgba(255,255,255,.06)',padding:'6px 10px',borderRadius:8,color:'#67e8f9',fontWeight:700,textDecoration:'none',fontSize:13,display:'inline-flex',alignItems:'center',gap:8}}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#67e8f9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flex:'none'}}>
                          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 1 1-2.1-11.4" />
                          <path d="M22 2l-6 6" />
                        </svg>
                        <span>Tra cứu Etherscan</span>
                      </a>
                    ) : (
                      <span style={{color:'#64748b',fontSize:13}}>—</span>
                    )}
                  </span>
                </div>
                <div style={s.row}><span style={{color:"#64748b"}}>Ngày đăng ký</span><span>{sel.created_at ? new Date(sel.created_at*1000).toLocaleDateString('vi-VN') : '—'}</span></div>
                <div style={{...s.row,borderBottom:"none"}}><span style={{color:"#64748b"}}>Loại</span>
                  <span style={{color:sel.parentHash?"#c4b5fd":"#4ade80"}}>{sel.parentHash?"Phái sinh":"Tác phẩm gốc"}</span></div>
              </div>

              {/* PROVENANCE TREE */}
              <div style={s.card}>
                <h3 style={s.cTit}><span style={s.dot("#06b6d4")}/>Gia phả số</h3>
                {/* On-chain enhanced provenance visualization */}
                <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
                  {provLoading ? (
                    <div style={{color:'#64748b'}}>Đang tải gia phả...</div>
                  ) : provChain.length === 0 ? (
                    <div style={{color:'#64748b'}}>Không có dữ liệu gia phả</div>
                  ) : (
                    provChain.map((node,i) => {
                      const active = node.sha256 === sel.sha256;
                      const localRec = records.find(r => r.sha256 === node.sha256);
                      const thumb = localRec ? `${BACKEND_URL}/thumbnail?sha=${encodeURIComponent(node.sha256)}&size=320` : null;
                      return (
                        <div key={node.sha256||i} style={{display:'flex',alignItems:'center',gap:8}}>
                          <button onClick={() => {
                              const rec = records.find(r=>r.sha256===node.sha256);
                              if (rec) setSel(rec); else setSel({ ...node, registrant_name: '—', created_at: null, tx_hash: null, parentHash: node.parentHash });
                            }}
                            style={{
                              background: active? '#0b1220' : 'transparent',
                              border: active? '2px solid #06b6d4' : '1px solid rgba(255,255,255,.06)',
                              color: active? '#67e8f9' : '#e2e8f0',
                              padding: 8, borderRadius:10, cursor:'pointer', fontWeight:700,
                              display:'flex',alignItems:'center',gap:10
                            }}>
                            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
                              {thumb ? (
                                <img src={thumb} alt={node.watermark_id||node.sha256} style={{width:120,height:80,objectFit:'cover',borderRadius:8}} />
                              ) : (
                                <div style={{width:120,height:80,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(255,255,255,.02)',borderRadius:8}}>🖼️</div>
                              )}
                              <div style={{fontSize:12, fontWeight:700, color: active? '#67e8f9' : '#e2e8f0'}}>
                                {node.watermark_id || (node.sha256||'').slice(0,10)} {(!node.parentHash && i===0) ? <span style={{marginLeft:6}}>👑</span> : null}
                              </div>
                            </div>
                          </button>
                          {i < provChain.length-1 && (
                            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
                              <div style={{fontSize:18,color:'#64748b'}}>→</div>
                              <div style={{fontSize:12,color:'#94a3b8'}}>Kế thừa</div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
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
            {[
              { l: "Tổng tác phẩm", v: records.length, c: "#818cf8" },
              { l: "Tác phẩm gốc", v: records.filter(n => !n.parentHash).length, c: "#06b6d4" },
              { l: "Phái sinh", v: records.filter(n => n.parentHash).length, c: "#c4b5fd" },
              { l: "Tác giả", v: [...new Set(records.map(n => n.registrant_name || ''))].filter(x=>x).length, c: "#4ade80" },
            ].map((st, i) => (
              <div key={i} style={s.statB}>
                <p style={{ fontSize:24, fontWeight:800, color:st.c, margin: "0 0 4px" }}>{st.v}</p>
                <p style={{ fontSize:11, color: "#475569", margin:0 }}>{st.l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
