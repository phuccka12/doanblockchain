import { useState } from "react";

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
