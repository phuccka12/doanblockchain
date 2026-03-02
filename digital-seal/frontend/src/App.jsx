import { useState } from "react";
import { ethers } from "ethers";
import abi from "./abi/ImageRegistryABI.json"; // Đảm bảo file ABI này là của Contract V2 (có parentHash)
import { BACKEND_URL, CONTRACT_ADDRESS, SEPOLIA_CHAIN_ID_HEX } from "./config.js";
import "./App.css"; 

// --- HÀM TIỆN ÍCH ---
function hexToBytes32(sha256Hex) {
  if (!/^[0-9a-fA-F]{64}$/.test(sha256Hex)) throw new Error("Invalid sha256 hex");
  return "0x" + sha256Hex;
}

function formatTs(ts) {
  if (!ts) return "-";
  try { return new Date(ts * 1000).toLocaleString(); } catch { return "-"; }
}

async function ensureSepolia() {
  if (!window.ethereum) throw new Error("Vui lòng cài đặt MetaMask!");
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  if (chainId !== SEPOLIA_CHAIN_ID_HEX) {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
      });
    } catch (error) {
      alert("Vui lòng chuyển MetaMask sang mạng Sepolia Testnet!");
      throw error;
    }
  }
}

export default function App() {
  const [tab, setTab] = useState("seal");

  // --- STATE LEVEL 3: GIA PHẢ SỐ ---
  const [suggestedParent, setSuggestedParent] = useState(null); // Hash ảnh cha tiềm năng
  const [useParent, setUseParent] = useState(false); // User có đồng ý link không

  // --- STATE CHO TAB SEAL ---
  const [sealFile, setSealFile] = useState(null);
  const [watermarkId, setWatermarkId] = useState("banquyen.vn"); 
  const [sealResult, setSealResult] = useState(null); 
  const [sealStatus, setSealStatus] = useState("");
  const [txHash, setTxHash] = useState("");

  // --- STATE CHO TAB VERIFY ---
  const [verifyFile, setVerifyFile] = useState(null);
  const [verifyStatus, setVerifyStatus] = useState(""); 
  const [verifyColor, setVerifyColor] = useState("");   
  const [verifyResult, setVerifyResult] = useState(null); 
  const [chainRecord, setChainRecord] = useState(null);   

  // ==========================================
  // 1. CHỨC NĂNG NIÊM PHONG (SEAL) - UPDATE LEVEL 3
  // ==========================================
  async function doSeal() {
    try {
      setSealStatus("Đang xử lý AI...");
      setSealResult(null);
      setTxHash("");
      setSuggestedParent(null); // Reset gợi ý cũ
      setUseParent(false);

      if (!sealFile) throw new Error("Chưa chọn ảnh!");

      const form = new FormData();
      form.append("file", sealFile);
      form.append("watermark_id", watermarkId);

      // Gọi Backend Seal
      const res = await fetch(`${BACKEND_URL}/seal`, { method: "POST", body: form });
      if (!res.ok) throw new Error("Lỗi kết nối Backend");

      const sha = res.headers.get("X-Image-SHA256");
      const dh = res.headers.get("X-Image-DHASH");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      setSealResult({ sha, dhash: dh, blobUrl: url });

      // --- LOGIC LEVEL 3: TÌM ẢNH CHA ---
      // Gọi API Verify để xem ảnh này có giống ảnh nào trong DB không
      setSealStatus("Đang kiểm tra trùng lặp...");
      const verifyForm = new FormData();
      verifyForm.append("file", sealFile);
      
      const vRes = await fetch(`${BACKEND_URL}/verify`, { method: "POST", body: verifyForm });
      const vData = await vRes.json();

      // Nếu tìm thấy ảnh tương đồng (best_match) và khoảng cách < 10 (giống > 90%)
      if (vData.best_match && vData.best_match.distance < 10) {
        // Chỉ gợi ý nếu ảnh đó KHÁC ảnh vừa seal (tránh tự link chính mình nếu seal lại)
        if (vData.best_match.sha256 !== sha) {
             setSuggestedParent(vData.best_match.sha256);
             setUseParent(true); // Tự động tích chọn cho tiện
             setSealStatus("⚠️ Phát hiện ảnh này là phiên bản chỉnh sửa của một ảnh cũ!");
             return; // Dừng để user chú ý
        }
      }

      setSealStatus("✅ Đã đóng dấu AI thành công! Sẵn sàng ghi lên Blockchain.");
    } catch (e) {
      setSealStatus("❌ Lỗi: " + e.message);
    }
  }

  async function doRegister() {
    try {
      setSealStatus("Đang gọi MetaMask...");
      await ensureSepolia();

      if (!sealResult?.sha) throw new Error("Chưa có mã Hash!");

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);

      const hashBytes32 = hexToBytes32(sealResult.sha);
      
      // --- XỬ LÝ LEVEL 3: PARENT HASH ---
      // Nếu user đồng ý link, dùng hash gợi ý. Nếu không, dùng 0x00... (ảnh gốc)
      let parentHashBytes32 = "0x0000000000000000000000000000000000000000000000000000000000000000";
      
      if (useParent && suggestedParent) {
          parentHashBytes32 = hexToBytes32(suggestedParent);
          console.log("Linking to parent:", suggestedParent);
      }

      // Gửi giao dịch (Hàm register bây giờ nhận 3 tham số)
      // register(hash, watermarkId, parentHash)
      const tx = await contract.register(hashBytes32, watermarkId, parentHashBytes32);
      
      setSealStatus("⏳ Đang chờ xác nhận trên Blockchain...");
      await tx.wait();
      setTxHash(tx.hash);
      setSealStatus("🎉 THÀNH CÔNG! Ảnh đã được bảo vệ vĩnh viễn.");
    } catch (e) {
      setSealStatus("❌ Lỗi Blockchain: " + e.message);
      console.error(e);
    }
  }

  // ==========================================
  // 2. CHỨC NĂNG KIỂM TRA (VERIFY)
  // ==========================================
  async function readChainRecord(sha256Hex) {
    if (!sha256Hex) return null;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);
      // Contract V2 trả về thêm parentHash
      const r = await contract.get(hexToBytes32(sha256Hex));
      return { 
          exists: r[0], 
          issuer: r[1], 
          timestamp: Number(r[2]), 
          watermarkId: r[3],
          parentHash: r[4] // Lấy thêm cái này về để hiển thị nếu muốn
      };
    } catch {
      return null;
    }
  }

  async function doVerify() {
    try {
      setVerifyStatus("Đang phân tích...");
      setVerifyColor("gray");
      setVerifyResult(null);
      setChainRecord(null);

      if (!verifyFile) throw new Error("Chưa chọn ảnh!");

      const form = new FormData();
      form.append("file", verifyFile);
      const res = await fetch(`${BACKEND_URL}/verify`, { method: "POST", body: form });
      const data = await res.json();
      setVerifyResult(data);

      await ensureSepolia();
      
      let record = await readChainRecord(data.sha256);
      
      if (!record?.exists && data.best_match?.sha256) {
        record = await readChainRecord(data.best_match.sha256);
      }
      setChainRecord(record);

      // --- LOGIC ĐÈN GIAO THÔNG ---
      const hasForgery = !!data.best_match?.forgery_image;
      const isExactMatch = record?.exists && (data.sha256 === data.best_match?.sha256 || !data.best_match);
      const isCompressed = record?.exists && !isExactMatch;
      const hasWatermark = !!data.watermark_id_extracted;

      if (hasForgery) {
        setVerifyStatus("🚨 CẢNH BÁO: ẢNH ĐÃ BỊ CHỈNH SỬA (FAKE)!");
        setVerifyColor("red");
      } else if (isExactMatch) {
        setVerifyStatus("🟢 ẢNH GỐC NGUYÊN BẢN (100% Authentic)");
        setVerifyColor("green");
      } else if (isCompressed || hasWatermark) {
        setVerifyStatus("🟡 ẢNH CHÍNH CHỦ (Đã bị nén/resize nhưng nội dung an toàn)");
        setVerifyColor("yellow");
      } else {
        setVerifyStatus("🔴 KHÔNG RÕ NGUỒN GỐC (Unknown)");
        setVerifyColor("red");
      }

    } catch (e) {
      setVerifyStatus("Lỗi: " + e.message);
      setVerifyColor("red");
    }
  }

  // ==========================================
  // GIAO DIỆN (UI)
  // ==========================================
  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans p-8">
      <div className="max-w-4xl mx-auto">
        
        {/* HEADER */}
        <header className="text-center mb-10">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-green-400 mb-2">
            TrustLens 👁️
          </h1>
          <p className="text-gray-400">Hệ thống xác thực ảnh số & Chống Fake News (Level 3 - Gia Phả Số)</p>
        </header>

        {/* TABS */}
        <div className="flex justify-center mb-8 gap-4">
          <button 
            onClick={() => setTab("seal")}
            className={`px-6 py-2 rounded-full font-bold transition ${tab === "seal" ? "bg-blue-600 shadow-lg shadow-blue-500/50" : "bg-gray-800 hover:bg-gray-700"}`}
          >
            🛡️ Bảo Vệ (Seal)
          </button>
          <button 
            onClick={() => setTab("verify")}
            className={`px-6 py-2 rounded-full font-bold transition ${tab === "verify" ? "bg-green-600 shadow-lg shadow-green-500/50" : "bg-gray-800 hover:bg-gray-700"}`}
          >
            🔍 Kiểm Tra (Verify)
          </button>
        </div>

        {/* PANEL: SEAL */}
        {tab === "seal" && (
          <div className="bg-gray-800 p-8 rounded-2xl shadow-xl border border-gray-700">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <span className="text-blue-400">1.</span> Niêm phong ảnh gốc
            </h2>
            
            <div className="space-y-4">
              <input type="file" onChange={(e) => setSealFile(e.target.files?.[0])} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"/>
              
              <input 
                type="text" 
                placeholder="Nhập ID bản quyền (VD: tuoitre.vn)" 
                value={watermarkId}
                onChange={(e) => setWatermarkId(e.target.value)}
                className="w-full p-3 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-blue-500"
              />

              <div className="flex gap-4 mt-4">
                <button onClick={doSeal} className="bg-blue-600 px-6 py-3 rounded-lg font-bold hover:bg-blue-500 transition w-1/2">
                  Bước 1: Đóng dấu AI
                </button>
                <button 
                  onClick={doRegister} 
                  disabled={!sealResult} 
                  className={`px-6 py-3 rounded-lg font-bold w-1/2 transition ${!sealResult ? "bg-gray-600 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-500"}`}
                >
                  Bước 2: Ghi lên Blockchain
                </button>
              </div>

              {/* UI GỢI Ý ẢNH CHA (LEVEL 3) */}
              {suggestedParent && (
                <div className="mt-4 p-4 bg-yellow-900/40 border border-yellow-500 rounded-lg animate-pulse">
                    <p className="font-bold text-yellow-400 flex items-center gap-2">
                        ⚠️ PHÁT HIỆN PHIÊN BẢN CŨ
                    </p>
                    <p className="text-sm text-gray-300 mt-1">
                        Hệ thống phát hiện ảnh này có nội dung giống với một ảnh đã đăng ký trước đó.
                    </p>
                    <label className="flex items-center gap-3 mt-3 cursor-pointer bg-gray-800 p-3 rounded border border-gray-600 hover:bg-gray-700">
                      <input 
                        type="checkbox" 
                        checked={useParent} 
                        onChange={(e) => setUseParent(e.target.checked)}
                        className="w-5 h-5 accent-yellow-500"
                      />
                      <span className="text-sm">
                          Đăng ký đây là <b>Phiên bản chỉnh sửa (Version 2)</b> của ảnh cũ?
                          <br/>
                          <span className="text-xs text-gray-500">Parent Hash: {suggestedParent.slice(0, 15)}...</span>
                      </span>
                    </label>
                </div>
              )}

              {sealStatus && <p className="mt-4 p-3 bg-gray-700 rounded text-center">{sealStatus}</p>}

              {sealResult && (
                <div className="mt-6 p-4 bg-gray-900 rounded border border-gray-700 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Ảnh đã đóng dấu:</p>
                    <img src={sealResult.blobUrl} alt="Sealed" className="mt-2 rounded border border-blue-500 max-h-64 object-contain" />
                    <a href={sealResult.blobUrl} download="sealed_image.png" className="text-blue-400 text-sm mt-2 inline-block hover:underline">⬇️ Tải ảnh về</a>
                  </div>
                  <div className="text-sm overflow-hidden break-all">
                    <p className="mb-2"><b className="text-blue-400">SHA-256:</b> {sealResult.sha}</p>
                    <p className="mb-2"><b className="text-gray-400">dHash:</b> {sealResult.dhash}</p>
                    {txHash && <p><b className="text-green-400">Tx Hash:</b> <a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" className="underline">{txHash}</a></p>}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PANEL: VERIFY */}
        {tab === "verify" && (
          <div className="bg-gray-800 p-8 rounded-2xl shadow-xl border border-gray-700">
             <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <span className="text-green-400">2.</span> Kiểm tra & Phát hiện Fake
            </h2>

            <div className="flex gap-4">
               <input type="file" onChange={(e) => setVerifyFile(e.target.files?.[0])} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-600 file:text-white hover:file:bg-green-700"/>
               <button onClick={doVerify} className="bg-green-600 px-8 py-2 rounded-lg font-bold hover:bg-green-500 transition">
                 KIỂM TRA NGAY
               </button>
            </div>

            {verifyStatus && (
              <div className={`mt-8 p-6 rounded-xl border-2 text-center ${
                verifyColor === 'green' ? 'border-green-500 bg-green-900/20' :
                verifyColor === 'yellow' ? 'border-yellow-500 bg-yellow-900/20' :
                verifyColor === 'red' ? 'border-red-500 bg-red-900/20' : 'border-gray-600'
              }`}>
                <h3 className={`text-2xl font-bold uppercase mb-2 ${
                   verifyColor === 'green' ? 'text-green-400' :
                   verifyColor === 'yellow' ? 'text-yellow-400' :
                   verifyColor === 'red' ? 'text-red-500' : 'text-white'
                }`}>
                  {verifyStatus}
                </h3>
              </div>
            )}

            {verifyResult && (
              <div className="mt-6 space-y-6">
                
                {/* HIỂN THỊ ẢNH FAKE */}
                {verifyResult.best_match?.forgery_image && (
                  <div className="p-4 bg-red-900/30 border border-red-500 rounded-lg">
                    <h4 className="text-red-400 font-bold mb-4 text-xl">📸 BẰNG CHỨNG GIẢ MẠO:</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-gray-400 text-sm mb-2">Ảnh bạn tải lên:</p>
                        <img src={URL.createObjectURL(verifyFile)} className="rounded border border-gray-600 w-full" />
                      </div>
                      <div>
                        <p className="text-red-400 text-sm mb-2">Phát hiện vùng bị sửa (Khoanh đỏ):</p>
                        <img src={`data:image/png;base64,${verifyResult.best_match.forgery_image}`} className="rounded border-2 border-red-500 w-full" />
                      </div>
                    </div>
                  </div>
                )}

                {/* THÔNG TIN KỸ THUẬT */}
                <div className="grid grid-cols-2 gap-4 text-sm text-gray-300">
                  <div className="bg-gray-900 p-4 rounded">
                    <p className="text-gray-500 uppercase text-xs mb-1">Dữ liệu ảnh Upload</p>
                    <p><b>Watermark:</b> {verifyResult.watermark_id_extracted || "Không tìm thấy"}</p>
                    <p className="truncate"><b>SHA:</b> {verifyResult.sha256}</p>
                    <p><b>dHash:</b> {verifyResult.dhash}</p>
                  </div>

                  {chainRecord?.exists && (
                    <div className="bg-gray-900 p-4 rounded border border-green-800">
                      <p className="text-green-500 uppercase text-xs mb-1">Dữ liệu trên Blockchain</p>
                      <p><b>Người đăng:</b> {chainRecord.issuer.slice(0, 6)}...{chainRecord.issuer.slice(-4)}</p>
                      <p><b>Thời gian:</b> {formatTs(chainRecord.timestamp)}</p>
                      <p><b>ID Đăng ký:</b> {chainRecord.watermarkId}</p>
                      {/* Hiển thị Parent Hash nếu có */}
                      {chainRecord.parentHash && chainRecord.parentHash !== "0x0000000000000000000000000000000000000000000000000000000000000000" && (
                          <p className="text-yellow-400 mt-2 border-t border-gray-700 pt-2">
                              <b>🔗 Phát triển từ ảnh gốc:</b> <br/>
                              {chainRecord.parentHash.slice(0,10)}...
                          </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}