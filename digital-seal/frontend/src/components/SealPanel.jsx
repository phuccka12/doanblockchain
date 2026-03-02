import React from "react";

export default function SealPanel({
  sealFile,
  setSealFile,
  watermarkId,
  setWatermarkId,
  doSeal,
  doRegister,
  suggestedParent,
  useParent,
  setUseParent,
  sealResult,
  sealStatus,
  txHash,
}) {
  return (
    <div className="bg-gray-800 p-8 rounded-2xl shadow-xl border border-gray-700">
      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <span className="text-blue-400">1.</span> Số hóa và Cấp quyền sở hữu (NFT)
      </h2>

      <div className="space-y-4">
        <input type="file" onChange={(e) => setSealFile(e.target.files?.[0])} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"/>
        
        <input 
          type="text" 
          placeholder="Nhập tên tổ chức/cá nhân sở hữu (VD: HV Hàng Không)" 
          value={watermarkId}
          onChange={(e) => setWatermarkId(e.target.value)}
          className="w-full p-3 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-blue-500"
        />

        <div className="flex gap-4 mt-4">
          <button onClick={doSeal} className="bg-blue-600 px-6 py-3 rounded-lg font-bold hover:bg-blue-500 transition w-1/2">
            Bước 1: Nhúng Thủy vân AI
          </button>
          <button 
            onClick={doRegister} 
            disabled={!sealResult} 
            className={`px-6 py-3 rounded-lg font-bold w-1/2 transition ${!sealResult ? "bg-gray-600 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-500"}`}
          >
            Bước 2: Đúc NFT lên Blockchain
          </button>
        </div>

        {suggestedParent && (
          <div className="mt-4 p-4 bg-yellow-900/40 border border-yellow-500 rounded-lg animate-pulse">
              <p className="font-bold text-yellow-400 flex items-center gap-2">
                  ⚠️ PHÁT HIỆN TÀI SẢN LIÊN QUAN (GIA PHẢ SỐ)
              </p>
              <p className="text-sm text-gray-300 mt-1">
                  AI phát hiện ảnh này được tinh chỉnh từ một tác phẩm đã có bản quyền.
              </p>
              <label className="flex items-center gap-3 mt-3 cursor-pointer bg-gray-800 p-3 rounded border border-gray-600 hover:bg-gray-700">
                <input 
                  type="checkbox" 
                  checked={useParent} 
                  onChange={(e) => setUseParent(e.target.checked)}
                  className="w-5 h-5 accent-yellow-500"
                />
                <span className="text-sm">
                    Khai báo đây là <b>Tác phẩm phái sinh (Kế thừa)</b>?
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
              <p className="text-xs text-gray-500 uppercase">Ảnh đã nhúng bản quyền (DCT):</p>
              <img src={sealResult.blobUrl} alt="Sealed" className="mt-2 rounded border border-blue-500 max-h-64 object-contain" />
            </div>
            <div className="text-sm overflow-hidden break-all">
              <p className="mb-2"><b className="text-blue-400">SHA-256:</b> {sealResult.sha}</p>
              {sealResult.ipfs && <p className="mb-2"><b className="text-yellow-400">Lưu trữ IPFS:</b> <a href={sealResult.ipfs} target="_blank" className="underline">Xem File Gốc</a></p>}
              {txHash && <p><b className="text-green-400">Giao dịch đúc NFT:</b> <a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" className="underline">{txHash}</a></p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
