import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { BACKEND_URL } from "../config";

export default function Provenance() {
  const [params, setParams] = useSearchParams();
  const initSha = params.get("sha") || "";
  
  const [query, setQuery] = useState(initSha);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [treeData, setTreeData] = useState(null); // { query_sha, root_sha, nodes:[], edges:[] }

  useEffect(() => {
    if (initSha) fetchTree(initSha);
  }, [initSha]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setParams({ sha: query.trim() });
  };

  const fetchTree = async (sha) => {
    try {
      setLoading(true); setError(""); setTreeData(null);
      const res = await fetch(`${BACKEND_URL}/provenance?sha=${encodeURIComponent(sha)}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Không tìm thấy tác phẩm này trong CSDL.");
        throw new Error("Lỗi máy chủ khi tải gia phả.");
      }
      const data = await res.json();
      setTreeData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ---- UPLOAD FILE ĐỂ LẤY SHA ----
  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    try {
      setLoading(true); setError(""); setTreeData(null);
      setQuery(""); // Clear text input

      // Dùng endpoint /verify để backend tính SHA256 và check db
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${BACKEND_URL}/verify`, { method: "POST", body: fd });
      if (!res.ok) throw new Error("Chưa thể quét ảnh này. Vui lòng thử lại.");
      
      const resData = await res.json();
      
      // Lấy sha256 từ kết quả trả về của json API
      // Ưu tiên dùng sha của best_match (tức là ảnh gốc/liên quan đã có trong CSDL)
      // Nếu không có best_match (ảnh hoàn toàn mới lạ), mới fallback về sha256 của ảnh upload
      const sha = (resData.best_match && resData.best_match.sha256) || resData.sha256;
      if (!sha) throw new Error("Không lấy được mã băm từ ảnh.");
      
      // Search tree ngay lập tức dùng `sha` vừa tính được
      setQuery(sha);
      setParams({ sha });

    } catch(e) {
      setError(e.message);
      setLoading(false);
    }
  }, [setParams]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/jpeg": [], "image/png": [], "image/webp": [] },
    multiple: false
  });

  // ---- HIỂN THỊ CÂY (Recursive Component) ----
  // Chuyển mảng edges thành cấu trúc tree: { [parentSha]: [childSha1, childSha2] }
  const renderTree = () => {
    if (!treeData) return null;
    const { root_sha, query_sha, nodes, edges } = treeData;
    
    const nodeMap = {};
    nodes.forEach(n => nodeMap[n.sha] = n);

    const childrenMap = {};
    edges.forEach(e => {
      if (!childrenMap[e.from]) childrenMap[e.from] = [];
      childrenMap[e.from].push(e.to);
    });

    // Helper vẽ 1 node và các node con (đệ quy)
    const TreeNode = ({ sha, level = 0 }) => {
      const node = nodeMap[sha];
      if (!node) return null;
      
      const children = childrenMap[sha] || [];
      const isRoot = sha === root_sha;
      const isTarget = sha === query_sha;

      let bdColor = "rgba(255,255,255,0.1)";
      let bgColor = "rgba(255,255,255,0.02)";
      let badge = null;

      if (isRoot) {
        bdColor = "rgba(251, 191, 36, 0.5)"; // yellow
        bgColor = "rgba(251, 191, 36, 0.05)";
        badge = <span style={{ background:"#fbbf24",color:"#000",fontSize:9,padding:"2px 6px",borderRadius:4,fontWeight:800,marginLeft:8 }}>BẢN GỐC</span>;
      }
      if (isTarget) {
        bdColor = "rgba(99, 102, 241, 0.8)"; // indigo
        bgColor = "rgba(99, 102, 241, 0.1)";
        badge = <span style={{ background:"#6366f1",color:"#fff",fontSize:9,padding:"2px 6px",borderRadius:4,fontWeight:800,marginLeft:8 }}>ĐANG XEM</span>;
      }

      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
          
          {/* THE NODE CARD */}
          <div style={{
            background: bgColor, border: `1px solid ${bdColor}`,
            borderRadius: 12, padding: 12, width: 260, zIndex: 2,
            display: "flex", gap: 12, alignItems: "center",
            boxShadow: isTarget ? "0 0 20px rgba(99,102,241,0.2)" : "none",
            transition: "all 0.2s"
          }}
          className="hover:scale-105 cursor-pointer"
          onClick={() => setParams({ sha: node.sha })}>
            <img src={`${BACKEND_URL}${node.thumbnail}`} alt="thumb" 
                 style={{ width:48, height:48, borderRadius:8, objectFit:"cover", border:"1px solid rgba(255,255,255,0.1)" }}
                 onError={(e) => { e.target.onerror = null; e.target.src = "https://placehold.co/48x48/1e293b/cbd5e1?text=404"; }} />
            <div style={{ flex: 1, minWidth:0 }}>
              <p style={{ fontSize:13, fontWeight:700, margin:"0 0 2px", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", color:"#fff" }}>
                {node.watermark_id || "Khuyết danh"}
                {badge}
              </p>
              <p style={{ fontSize:11, color:"#94a3b8", margin:"0 0 4px", fontFamily:"monospace" }}>
                {node.sha.slice(0,12)}...
              </p>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                {node.registered 
                  ? <span style={{ fontSize:10, color:"#4ade80", fontWeight:600 }}>✅ Đã lên chuỗi</span>
                  : <span style={{ fontSize:10, color:"#fbbf24" }}>⏳ Chờ ghi chuỗi</span>}
              </div>
            </div>
          </div>

          {/* CHILDREN LAYER */}
          {children.length > 0 && (
            <div style={{ display: "flex", mt: 24, position: "relative", paddingTop: 32, marginTop: 4 }}>
              
              {/* Vertical line passing down from parent */}
              <div style={{ position: "absolute", top: -4, left: "50%", width: 1, height: 20, background: "rgba(99,102,241,0.4)" }}/>
              
              {/* Horizontal line connecting all children */}
              {children.length > 1 && (
                <div style={{ 
                  position: "absolute", top: 15, height: 1, background: "rgba(99,102,241,0.4)",
                  // Calculate width based on first and last child center
                  left: `calc(50% / ${children.length})`, right: `calc(50% / ${children.length})` 
                }}/>
              )}

              <div style={{ display: "flex", gap: 32 }}>
                {children.map((cSha, idx) => (
                  <div key={cSha} style={{ position: "relative", paddingTop: 16 }}>
                    {/* Vertical drop line for each child */}
                    <div style={{ position: "absolute", top: 0, left: "50%", width: 1, height: 16, background: "rgba(99,102,241,0.4)" }}/>
                    <TreeNode sha={cSha} level={level + 1} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    };

    return (
      <div style={{ overflowX: "auto", padding: "40px 20px", display: "flex", justifyContent: "center", minHeight: 400 }}>
        <TreeNode sha={root_sha} />
      </div>
    );
  };

  const s = {
    page:  { minHeight:"100vh", background:"#080818", color:"#fff", fontFamily:"Inter,system-ui,sans-serif" },
    hdr:   { borderBottom:"1px solid rgba(255,255,255,.07)", padding:"30px 32px" },
    h1:    { fontSize:24, fontWeight:800, margin:"0 0 8px" },
    sub:   { fontSize:14, color:"#94a3b8", margin:0, maxWidth:600 },
    wrap:  { maxWidth:1200, margin:"0 auto" },
    body:  { padding:"32px" },
    searchBox: { display:"flex", gap:12, maxWidth:600, margin:"0 auto 40px" },
    input: { flex:1, padding:"14px 20px", borderRadius:12, background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.1)", color:"#fff", fontSize:14, outline:"none", fontFamily:"monospace" },
    btn:   { padding:"0 24px", borderRadius:12, background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", border:"none", fontWeight:600, cursor:"pointer" }
  };

  return (
    <div style={s.page}>
      <div style={s.hdr}>
        <div style={s.wrap}>
          <h1 style={s.h1}>🌳 Gia Phả Số (Digital Provenance)</h1>
          <p style={s.sub}>Theo dõi nguồn gốc và lịch sử phái sinh của tác phẩm kỹ thuật số. Cây hiển thị bản gốc và toàn bộ các phiên bản sao chép, chỉnh sửa được đăng ký trên TrustLens.</p>
        </div>
      </div>

      <div style={{...s.wrap, ...s.body}}>
        <form onSubmit={handleSearch} style={s.searchBox}>
          <input 
            value={query} onChange={e=>setQuery(e.target.value)}
            placeholder="Nhập SHA-256 của ảnh cần xem gia phả..."
            style={s.input} 
          />
          <button type="submit" style={s.btn} disabled={loading}>
            {loading ? "Đang xử lý..." : "Tra cứu"}
          </button>
        </form>

        <div style={{ textAlign:"center", marginBottom:40, color:"#64748b", fontSize:13 }}>
          <span style={{ display:"inline-block", background:"rgba(255,255,255,0.05)", padding:"2px 12px", borderRadius:20 }}>hoặc</span>
        </div>

        {/* DROPZONE */}
        <div {...getRootProps()} style={{
          maxWidth: 600, margin: "0 auto 40px",
          border: isDragActive ? "2px dashed #6366f1" : "2px dashed rgba(255,255,255,.1)",
          background: isDragActive ? "rgba(99,102,241,.05)" : "rgba(255,255,255,.02)",
          borderRadius: 16, padding: "30px", textAlign: "center",
          cursor: "pointer", transition: "all .2s"
        }}>
          <input {...getInputProps()} />
          <div style={{ fontSize:32, marginBottom:12 }}>{isDragActive ? "📥" : "📸"}</div>
          <p style={{ margin:"0 0 4px", fontSize:15, fontWeight:600, color:isDragActive?"#818cf8":"#e2e8f0" }}>
            {isDragActive ? "Thả ảnh vào đây..." : "Kéo thả ảnh cần kiểm tra vào đây"}
          </p>
          <p style={{ margin:0, fontSize:13, color:"#64748b" }}>
            Hệ thống sẽ tự động trích xuất mã SHA-256 và dựng bản đồ phái sinh
          </p>
        </div>

        {error && (
          <div style={{ padding:16, background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:12, color:"#f87171", textAlign:"center", maxWidth:600, margin:"0 auto" }}>
            ⚠️ {error}
          </div>
        )}

        {treeData && (
          <div style={{ background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16 }}>
            {renderTree()}
          </div>
        )}

        {!treeData && !loading && !error && (
          <div style={{ textAlign:"center", padding:"60px 20px", color:"#475569" }}>
            <div style={{ fontSize:40, marginBottom:16, opacity:0.5 }}>🌲</div>
            <p>Nhập mã băm SHA-256 ở trên để bắt đầu truy xuất cây gia phả</p>
          </div>
        )}
      </div>
    </div>
  );
}
