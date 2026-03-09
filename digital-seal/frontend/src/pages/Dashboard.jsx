import { useState, useEffect, useCallback } from "react";
import { BACKEND_URL, CONTRACT_ADDRESS } from "../config";
import { ethers } from "ethers";
import abi from "../abi/ImageRegistryABI.json";

// ─── tiny helpers ─────────────────────────────────────────────────────────────
const timeAgo = (ts) => {
  if (!ts) return "—";
  const d = Date.now() - ts * 1000;
  const m = Math.floor(d / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
};
const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
const shortHash = (h) => (h ? `${h.slice(0, 14)}…` : "—");

const SEV = {
  high:   { bg: "rgba(239,68,68,.12)",  bd: "rgba(239,68,68,.28)",  c: "#fca5a5" },
  medium: { bg: "rgba(251,191,36,.10)", bd: "rgba(251,191,36,.22)", c: "#fde68a" },
  low:    { bg: "rgba(99,102,241,.10)", bd: "rgba(99,102,241,.22)", c: "#a5b4fc" },
};

// ─── SVG donut ring ──────────────────────────────────────────────────────────
function Ring({ pct = 0, size = 90, stroke = 9, color = "#6366f1", label, sub }) {
  const r    = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, pct)) / 100) * circ;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="rgba(255,255,255,.07)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray .6s ease" }} />
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
          fill="#fff" fontSize={size * 0.22} fontWeight="800"
          style={{ transform: "rotate(90deg)", transformOrigin: "50% 50%" }}>
          {pct}%
        </text>
      </svg>
      {label && <p style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", margin: 0, textAlign: "center" }}>{label}</p>}
      {sub   && <p style={{ fontSize: 11, color: "#64748b", margin: 0, textAlign: "center" }}>{sub}</p>}
    </div>
  );
}

// ─── stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color = "#818cf8" }) {
  return (
    <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)",
                  borderRadius: 16, padding: "20px 22px" }}>
      <div style={{ fontSize: 26, marginBottom: 8 }}>{icon}</div>
      <p style={{ fontSize: 28, fontWeight: 800, color, margin: "0 0 4px" }}>{value}</p>
      <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 2px" }}>{label}</p>
      {sub && <p style={{ fontSize: 11, color: "#475569", margin: 0 }}>{sub}</p>}
    </div>
  );
}

// ─── IPFS CID pill ────────────────────────────────────────────────────────────
function CIDPill({ ipfs }) {
  if (!ipfs) return <span style={{ color: "#334155", fontSize: 11 }}>—</span>;
  const cid = ipfs.replace("https://gateway.pinata.cloud/ipfs/", "").slice(0, 12) + "…";
  return (
    <a href={ipfs} target="_blank" rel="noreferrer"
      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px",
               borderRadius: 6, background: "rgba(251,191,36,.1)", border: "1px solid rgba(251,191,36,.2)",
               color: "#fbbf24", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
      📦 {cid}
    </a>
  );
}

// ─── main component ───────────────────────────────────────────────────────────
export default function Dashboard() {
  /* wallet */
  const [address,    setAddress]    = useState(null);
  const [connecting, setConnecting] = useState(false);

  /* personal assets from /my-assets */
  const [myAssets,  setMyAssets]  = useState(null);
  const [myLoading, setMyLoading] = useState(false);

  /* global stats from /records */
  const [globalTotal,      setGlobalTotal]      = useState(null);
  const [globalRegistered, setGlobalRegistered] = useState(null);
  const [recentWorks,      setRecentWorks]      = useState([]);
  const [globalLoading,    setGlobalLoading]    = useState(true);

  /* alerts */
  const [alerts, setAlerts] = useState([]);

  /* CID integrity check */
  const [verifyingCid, setVerifyingCid] = useState(null);
  const [cidResults,   setCidResults]   = useState({});

  // ── load global data once ────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${BACKEND_URL}/records?limit=10&registered_only=true`)
      .then(r => r.json())
      .then(d => {
        setGlobalTotal(d.total ?? 0);
        setGlobalRegistered(d.registered_total ?? 0);
        setRecentWorks(d.records ?? []);
      })
      .catch(() => {})
      .finally(() => setGlobalLoading(false));
    fetch(`${BACKEND_URL}/alerts?limit=5`)
      .then(r => r.json())
      .then(d => setAlerts(d.alerts ?? []))
      .catch(() => {});
  }, []);

  // ── detect already-connected wallet ──────────────────────────────────────────
  useEffect(() => {
    const detect = async () => {
      if (!window.ethereum) return;
      try {
        const accs = await window.ethereum.request({ method: "eth_accounts" });
        if (accs && accs.length > 0) setAddress(accs[0]);
      } catch (_) {}
    };
    detect();
    const handler = (accs) => setAddress(accs[0] || null);
    window.ethereum?.on("accountsChanged", handler);
    return () => window.ethereum?.removeListener?.("accountsChanged", handler);
  }, []);

  // ── load my-assets whenever address changes ───────────────────────────────────
  const loadMyAssets = useCallback((addr) => {
    if (!addr) { setMyAssets(null); return; }
    setMyLoading(true);
    fetch(`${BACKEND_URL}/my-assets?owner=${encodeURIComponent(addr)}`)
      .then(r => r.json())
      .then(setMyAssets)
      .catch(() => setMyAssets(null))
      .finally(() => setMyLoading(false));
  }, []);

  useEffect(() => { loadMyAssets(address); }, [address, loadMyAssets]);

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) return alert("Vui lòng cài MetaMask!");
    setConnecting(true);
    try {
      const accs = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (accs[0]) setAddress(accs[0]);
    } catch (_) {}
    finally { setConnecting(false); }
  }, []);

  // ── CID integrity check (browser SubtleCrypto) ───────────────────────────────
  const verifyCid = useCallback(async (rec) => {
    if (!rec.ipfs_link || !rec.sha256) return;
    setVerifyingCid(rec.sha256);
    try {
      const res = await fetch(rec.ipfs_link);
      const buf = await res.arrayBuffer();
      const hashBuf = await crypto.subtle.digest("SHA-256", buf);
      const hex = Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2, "0")).join("");
      setCidResults(prev => ({ ...prev, [rec.sha256]: { ok: hex === rec.sha256 } }));
    } catch (e) {
      setCidResults(prev => ({ ...prev, [rec.sha256]: { ok: false } }));
    } finally { setVerifyingCid(null); }
  }, []);

  const hasAssets = myAssets && !myAssets.error;

  // ── styles ────────────────────────────────────────────────────────────────────
  const S = {
    page:    { minHeight: "100vh", background: "#080818", color: "#fff", fontFamily: "Inter,system-ui,sans-serif" },
    hdr:     { borderBottom: "1px solid rgba(255,255,255,.07)", padding: "20px 32px" },
    crumb:   { fontSize: 11, color: "#818cf8", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 },
    h1:      { fontSize: 22, fontWeight: 800, margin: "0 0 2px" },
    sub:     { fontSize: 13, color: "#64748b", margin: 0 },
    body:    { maxWidth: 1200, margin: "0 auto", padding: "28px" },
    grid4:   { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 },
    grid2:   { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 },
    grid3:   { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 24 },
    card:    { background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: 22 },
    cTit:    { fontSize: 13, fontWeight: 700, margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 },
    dot:     (c) => ({ width: 8, height: 8, borderRadius: "50%", background: c }),
    thr:     { textAlign: "left", padding: "8px 12px", color: "#475569", fontWeight: 600, fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,.07)" },
    tr:      { borderBottom: "1px solid rgba(255,255,255,.04)" },
    td:      { padding: "11px 12px", fontSize: 13 },
    badge:   (c) => ({ display: "inline-block", padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: `${c}22`, color: c }),
    wBtn:    { padding: "10px 22px", borderRadius: 12, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontWeight: 700, fontSize: 13, border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 },
    divider: { border: "none", borderTop: "1px solid rgba(255,255,255,.06)", margin: "20px 0" },
    banner:  { background: "linear-gradient(135deg,rgba(99,102,241,.15),rgba(139,92,246,.10))", border: "1px solid rgba(99,102,241,.25)", borderRadius: 16, padding: "20px 26px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 24, flexWrap: "wrap" },
  };

  return (
    <div style={S.page}>

      {/* ── HEADER ── */}
      <div style={S.hdr}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <p style={S.crumb}>TrustLens › Bảng điều hành</p>
            <h1 style={S.h1}>Dashboard Quản lý Bản quyền</h1>
            <p style={S.sub}>Báo cáo tài sản số — cá nhân hóa theo ví MetaMask của bạn</p>
          </div>
          <div>
            {address ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "8px 14px" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80", flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "monospace" }}>{shortAddr(address)}</span>
              </div>
            ) : (
              <button style={S.wBtn} onClick={connectWallet} disabled={connecting}>
                {connecting ? "⏳ Đang kết nối..." : "🦊 Kết nối MetaMask"}
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={S.body}>

        {/* ══════════════════════════════════════════════════════════════
            SECTION A — WALLET-CENTRIC (khi đã kết nối MetaMask)
        ══════════════════════════════════════════════════════════════ */}
        {address ? (<>

          {/* wallet banner */}
          <div style={S.banner}>
            <div>
              <p style={{ fontSize: 11, color: "#818cf8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 4px" }}>Ví đang kết nối</p>
              <p style={{ fontSize: 15, fontWeight: 800, fontFamily: "monospace", margin: "0 0 4px", wordBreak: "break-all" }}>{address}</p>
              <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>Ethereum Sepolia · Dữ liệu quét trực tiếp từ Blockchain</p>
            </div>
            <button onClick={() => loadMyAssets(address)}
              style={{ padding: "8px 18px", borderRadius: 10, background: "rgba(99,102,241,.2)", border: "1px solid rgba(99,102,241,.4)", color: "#a5b4fc", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
              🔄 Làm mới
            </button>
          </div>

          {myLoading ? (
            <div style={{ ...S.card, textAlign: "center", padding: "48px 0", color: "#64748b", marginBottom: 24 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
              <p style={{ margin: 0 }}>Đang quét Blockchain cho ví <strong style={{ color: "#a5b4fc" }}>{shortAddr(address)}</strong>…</p>
            </div>
          ) : hasAssets ? (<>

            {/* ── 4 personal stat cards ── */}
            <div style={S.grid4}>
              <StatCard icon="🖼️" label="NFT đang sở hữu"  value={myAssets.nft_count}          color="#818cf8" sub="Tác phẩm đã đăng ký on-chain" />
              <StatCard icon="🏆" label="Tác phẩm gốc"     value={myAssets.original_count}      color="#4ade80" sub="Thuần gốc, không phái sinh" />
              <StatCard icon="🔗" label="Phái sinh"         value={myAssets.derivative_count}    color="#c4b5fd" sub="Có gia phả với ảnh khác" />
              <StatCard icon="🛡️" label="Sự cố bị chặn"    value={myAssets.protection_events}   color="#f87171" sub="AI phát hiện vi phạm ảnh bạn" />
            </div>

            {/* ── 3 col: rings + IPFS explainer ── */}
            <div style={S.grid3}>

              {/* original score ring */}
              <div style={{ ...S.card, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "28px 22px" }}>
                <h3 style={{ ...S.cTit, margin: 0 }}><span style={S.dot("#4ade80")} />Original Score</h3>
                <Ring pct={myAssets.original_score} color="#4ade80" size={100} stroke={9}
                  label="Điểm Tính Gốc"
                  sub={`${myAssets.original_count}/${myAssets.nft_count} gốc`} />
                <p style={{ fontSize: 12, color: "#64748b", textAlign: "center", margin: 0, lineHeight: 1.7 }}>
                  Tỉ lệ tác phẩm bạn sở hữu là bản gốc (không phải phái sinh).
                  Điểm càng cao → danh mục càng độc quyền &amp; có giá trị.
                </p>
              </div>

              {/* protection level ring */}
              <div style={{ ...S.card, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "28px 22px" }}>
                <h3 style={{ ...S.cTit, margin: 0 }}><span style={S.dot("#f87171")} />Protection Level</h3>
                <Ring
                  pct={myAssets.nft_count > 0
                    ? Math.min(100, 60 + Math.round((myAssets.protection_events / Math.max(1, myAssets.nft_count)) * 40))
                    : 0}
                  color="#f87171" size={100} stroke={9}
                  label="Cấp Bảo Vệ"
                  sub={`${myAssets.protection_events} lần AI chặn`} />
                <p style={{ fontSize: 12, color: "#64748b", textAlign: "center", margin: 0, lineHeight: 1.7 }}>
                  Số lần hệ thống AI từ chối đăng ký bản sao / chỉnh sửa
                  trái phép nhắm vào tác phẩm của bạn (log thực tế).
                </p>
              </div>

              {/* IPFS concept card */}
              <div style={{ ...S.card, padding: "24px 22px", background: "rgba(251,191,36,.05)", border: "1px solid rgba(251,191,36,.18)" }}>
                <h3 style={{ ...S.cTit, color: "#fbbf24" }}><span style={S.dot("#fbbf24")} />Content-Addressing IPFS</h3>
                <p style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.7, margin: "0 0 14px" }}>
                  Mỗi tác phẩm được <strong style={{ color: "#fde68a" }}>ghim lên IPFS</strong> qua Pinata.
                  CID = băm nội dung file. Thay đổi 1 pixel → CID thay đổi hoàn toàn.
                </p>
                {[
                  { icon: "📦", t: "Bất biến",            d: "CID không thể giả mạo hay ghi đè." },
                  { icon: "📖", t: "Sổ đỏ kỹ thuật số",  d: "Blockchain lưu CID, IPFS lưu file nặng." },
                  { icon: "🔍", t: "Kiểm chứng tức thì", d: "SHA256(file_IPFS) == SHA256 on-chain ✅" },
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 15, flexShrink: 0 }}>{item.icon}</span>
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "#fde68a", margin: "0 0 1px" }}>{item.t}</p>
                      <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>{item.d}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── personal asset table ── */}
            <div style={S.card}>
              <h3 style={S.cTit}>
                <span style={S.dot("#818cf8")} />Tài sản số của tôi
                <span style={{ marginLeft: "auto", fontSize: 11, color: "#475569", fontWeight: 400 }}>
                  {myAssets.nft_count} NFT · {shortAddr(address)}
                </span>
              </h3>
              {myAssets.records.length === 0 ? (
                <p style={{ color: "#475569", textAlign: "center", padding: "24px 0" }}>
                  Ví này chưa có tác phẩm nào được đăng ký on-chain.
                </p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead><tr>
                      {["Ảnh", "Watermark ID", "Loại", "SHA-256", "IPFS CID", "Kiểm chứng CID", "Ngày", "Tx"].map(h => (
                        <th key={h} style={S.thr}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {myAssets.records.map((rec, i) => {
                        const isOrig = !rec.orig_dhash;
                        const cr     = cidResults[rec.sha256];
                        return (
                          <tr key={i} style={S.tr}>
                            <td style={{ ...S.td, width: 58 }}>
                              {rec.ipfs_link ? (
                                <img src={rec.ipfs_link} alt="thumb"
                                  style={{ width: 46, height: 46, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(255,255,255,.08)" }}
                                  onError={e => { e.currentTarget.src = `${BACKEND_URL}/thumbnail?sha=${rec.sha256}&size=92`; }} />
                              ) : (
                                <img src={`${BACKEND_URL}/thumbnail?sha=${rec.sha256}&size=92`} alt="thumb"
                                  style={{ width: 46, height: 46, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(255,255,255,.08)" }} />
                              )}
                            </td>
                            <td style={{ ...S.td, color: "#818cf8", fontFamily: "monospace" }}>{rec.watermark_id || "—"}</td>
                            <td style={S.td}>
                              <span style={S.badge(isOrig ? "#4ade80" : "#c4b5fd")}>
                                {isOrig ? "Gốc 👑" : "Phái sinh 🔗"}
                              </span>
                            </td>
                            <td style={{ ...S.td, fontFamily: "monospace", fontSize: 11, color: "#94a3b8" }}
                              title={rec.sha256}>{shortHash(rec.sha256)}</td>
                            <td style={S.td}><CIDPill ipfs={rec.ipfs_link} /></td>
                            <td style={S.td}>
                              {rec.ipfs_link ? (
                                cr ? (
                                  <span style={S.badge(cr.ok ? "#4ade80" : "#f87171")}>
                                    {cr.ok ? "✅ Toàn vẹn" : "❌ Không khớp"}
                                  </span>
                                ) : (
                                  <button disabled={verifyingCid === rec.sha256}
                                    onClick={() => verifyCid(rec)}
                                    style={{ padding: "4px 10px", borderRadius: 8, background: "rgba(99,102,241,.15)", border: "1px solid rgba(99,102,241,.3)", color: "#a5b4fc", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                                    {verifyingCid === rec.sha256 ? "⏳…" : "🔍 Kiểm tra"}
                                  </button>
                                )
                              ) : <span style={{ color: "#334155", fontSize: 11 }}>—</span>}
                            </td>
                            <td style={{ ...S.td, color: "#64748b", whiteSpace: "nowrap" }}>
                              {rec.created_at ? new Date(rec.created_at * 1000).toLocaleDateString("vi-VN") : "—"}
                            </td>
                            <td style={S.td}>
                              {rec.tx_hash ? (
                                <a href={`https://sepolia.etherscan.io/tx/${rec.tx_hash}`} target="_blank" rel="noreferrer"
                                  style={{ color: "#67e8f9", fontSize: 11, fontFamily: "monospace", textDecoration: "none" }}>
                                  {rec.tx_hash.slice(0, 10)}…
                                </a>
                              ) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </>) : (
            <div style={{ ...S.card, textAlign: "center", padding: "40px 0", color: "#64748b", marginBottom: 24 }}>
              <p style={{ fontSize: 32, marginBottom: 10 }}>📭</p>
              <p>Không tải được tài sản. Vui lòng thử lại.</p>
            </div>
          )}

          <hr style={S.divider} />
          <p style={{ fontSize: 12, color: "#475569", marginBottom: 20 }}>
            📊 Thống kê toàn hệ thống bên dưới (tất cả người dùng)
          </p>

        </>) : (
          /* ── wallet not connected ── */
          <div style={{ ...S.card, display: "flex", alignItems: "center", gap: 24, padding: "28px 32px", marginBottom: 24,
                        background: "linear-gradient(135deg,rgba(99,102,241,.08),rgba(139,92,246,.06))", border: "1px solid rgba(99,102,241,.2)" }}>
            <div style={{ fontSize: 48 }}>🦊</div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 17, fontWeight: 800, margin: "0 0 6px" }}>Kết nối ví để xem "Báo cáo tài sản" của bạn</p>
              <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 16px", lineHeight: 1.6 }}>
                Dashboard sẽ tự động quét Blockchain và hiển thị toàn bộ NFT bạn sở hữu,
                điểm Original Score, Protection Level và xác minh toàn vẹn IPFS cho từng tác phẩm.
              </p>
              <button style={S.wBtn} onClick={connectWallet} disabled={connecting}>
                {connecting ? "⏳ Đang kết nối..." : "🦊 Kết nối MetaMask"}
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            SECTION B — GLOBAL STATS (luôn hiển thị)
        ══════════════════════════════════════════════════════════════ */}
        <div style={S.grid4}>
          <StatCard icon="🌐" label="Tổng tác phẩm đã seal"   value={globalTotal ?? "—"}      color="#818cf8" />
          <StatCard icon="⬡"  label="NFT đã đăng ký on-chain" value={globalRegistered ?? "—"} color="#06b6d4" />
          <StatCard icon="🔬" label="Cảnh báo AI gần nhất"    value={alerts.length}            color="#f87171" />
          <StatCard icon="⛓️" label="Mạng lưới"                value="Sepolia"                 color="#4ade80" sub="Ethereum Testnet" />
        </div>

        {/* blockchain flow + alerts */}
        <div style={S.grid2}>
          <div style={S.card}>
            <h3 style={S.cTit}><span style={S.dot("#6366f1")} />Luồng Web3: Upload → Bất Tử</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                { s: "1", c: "#6366f1", t: "Upload & Seal",      d: "File ảnh → DCT watermark → tính SHA256" },
                { s: "2", c: "#8b5cf6", t: "IPFS Upload",         d: "Pinata ghim file. CID = hash nội dung. Bất biến." },
                { s: "3", c: "#ec4899", t: "On-Chain Registry",   d: "Smart Contract lưu: Owner + SHA256 + CID mãi mãi." },
                { s: "4", c: "#06b6d4", t: "Kiểm chứng tức thì", d: "SHA256(file_từ_IPFS) == SHA256 on-chain? ✅" },
              ].map(item => (
                <div key={item.s} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${item.c}22`, border: `1px solid ${item.c}55`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 12, fontWeight: 800, color: item.c, flexShrink: 0 }}>
                    {item.s}
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", margin: "0 0 2px" }}>{item.t}</p>
                    <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>{item.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={S.card}>
            <h3 style={S.cTit}><span style={S.dot("#ef4444")} />Cảnh báo AI gần đây</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {alerts.length === 0 ? (
                <p style={{ color: "#475569", padding: "12px 0", margin: 0, fontSize: 13 }}>✅ Không có cảnh báo gần đây</p>
              ) : alerts.map((a, i) => (
                <div key={i} style={{ padding: "12px 14px", borderRadius: 10,
                                      background: SEV[a.severity]?.bg || "rgba(99,102,241,.06)",
                                      border: `1px solid ${SEV[a.severity]?.bd || "rgba(255,255,255,.04)"}` }}>
                  <p style={{ fontSize: 13, color: SEV[a.severity]?.c || "#a5b4fc", fontWeight: 600, margin: "0 0 3px" }}>
                    {a.message}
                  </p>
                  <p style={{ fontSize: 11, color: "#475569", margin: 0 }}>{timeAgo(a.created_at)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* global recent works table */}
        <div style={S.card}>
          <h3 style={S.cTit}>
            <span style={S.dot("#4ade80")} />Tác phẩm đăng ký gần đây (toàn hệ thống)
            {globalRegistered !== null && (
              <span style={{ marginLeft: "auto", fontSize: 11, color: "#475569", fontWeight: 400 }}>
                Tổng: {globalRegistered} tác phẩm on-chain
              </span>
            )}
          </h3>
          {globalLoading ? (
            <p style={{ color: "#475569", textAlign: "center", padding: "24px 0" }}>Đang tải…</p>
          ) : recentWorks.length === 0 ? (
            <p style={{ color: "#475569", textAlign: "center", padding: "24px 0" }}>Chưa có tác phẩm nào được đăng ký.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr>
                  {["Ảnh", "Watermark ID", "Người đăng ký", "SHA-256", "IPFS", "Ngày đăng ký"].map(h => (
                    <th key={h} style={S.thr}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {recentWorks.map((w, i) => (
                    <tr key={i} style={S.tr}>
                      <td style={{ ...S.td, width: 56 }}>
                        {w.ipfs_link ? (
                          <img src={w.ipfs_link} alt="thumb"
                            style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid rgba(255,255,255,.08)" }}
                            onError={e => { e.currentTarget.src = `${BACKEND_URL}/thumbnail?sha=${w.sha256}&size=88`; }} />
                        ) : (
                          <img src={`${BACKEND_URL}/thumbnail?sha=${w.sha256}&size=88`} alt="thumb"
                            style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid rgba(255,255,255,.08)" }} />
                        )}
                      </td>
                      <td style={{ ...S.td, color: "#818cf8", fontFamily: "monospace" }}>{w.watermark_id || "—"}</td>
                      <td style={{ ...S.td, fontWeight: 600 }}>{w.registrant_name || "—"}</td>
                      <td style={{ ...S.td, fontFamily: "monospace", fontSize: 11, color: "#94a3b8", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={w.sha256}>{w.sha256 ? w.sha256.slice(0, 16) + "…" : "—"}</td>
                      <td style={S.td}><CIDPill ipfs={w.ipfs_link} /></td>
                      <td style={{ ...S.td, color: "#64748b" }}>
                        {w.created_at ? new Date(w.created_at * 1000).toLocaleDateString("vi-VN") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
