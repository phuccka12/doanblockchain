import React from "react";

export default function VerifyPanel({
  verifyFile,
  setVerifyFile,
  doVerify,
  verifyStatus,
  verifyColor,
  verifyResult,
  chainRecord,
}) {
  return (
    <div className="bg-gray-800 p-8 rounded-2xl shadow-xl border border-gray-700">
       <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <span className="text-green-400">2.</span> Giám định AI & Truy xuất Blockchain
      </h2>

      <div className="flex gap-4">
         <input type="file" onChange={(e) => setVerifyFile(e.target.files?.[0])} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-600 file:text-white hover:file:bg-green-700"/>
         <button onClick={doVerify} className="bg-green-600 px-8 py-2 rounded-lg font-bold hover:bg-green-500 transition">
           BẮT ĐẦU GIÁM ĐỊNH
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
          {verifyResult.best_match?.forgery_image && (
            <div className="p-4 bg-red-900/30 border border-red-500 rounded-lg">
              <h4 className="text-red-400 font-bold mb-4 text-xl">📸 AI (ELA) BẮT LỖI GIẢ MẠO:</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-400 text-sm mb-2">Ảnh giám định:</p>
                  <img src={URL.createObjectURL(verifyFile)} className="rounded border border-gray-600 w-full" />
                </div>
                <div>
                  <p className="text-red-400 text-sm mb-2">Vùng điểm ảnh bị can thiệp (Photoshop/Deepfake):</p>
                  <img src={`data:image/png;base64,${verifyResult.best_match.forgery_image}`} className="rounded border-2 border-red-500 w-full" />
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm text-gray-300">
            <div className="bg-gray-900 p-4 rounded border border-gray-700">
              <p className="text-blue-400 font-bold uppercase text-xs mb-2">Trích xuất Thủy vân số (AI)</p>
              <p><b>ID Bản quyền:</b> {verifyResult.watermark_id_extracted || "Không có dấu vết"}</p>
              <p className="truncate"><b>Mã băm (SHA256):</b> {verifyResult.sha256}</p>
            </div>

            {chainRecord?.exists && (
              <div className="bg-gray-900 p-4 rounded border border-green-800">
                <p className="text-green-500 font-bold uppercase text-xs mb-2">Hồ sơ Blockchain (NFT)</p>
                <p><b>Ví Chủ sở hữu:</b> {chainRecord.owner.slice(0, 6)}...{chainRecord.owner.slice(-4)}</p>
                <p><b>Thời gian đúc:</b> {typeof chainRecord.timestamp === 'bigint' ? new Date(Number(chainRecord.timestamp) * 1000).toLocaleString() : (chainRecord.timestamp ? new Date(Number(chainRecord.timestamp) * 1000).toLocaleString() : '-')}</p>
                <p><b>Đăng ký bởi:</b> {chainRecord.watermarkId}</p>
                
                {chainRecord.parentHash && chainRecord.parentHash !== "0x00" && (
                    <p className="text-yellow-400 mt-2 border-t border-gray-700 pt-2">
                        <b>🔗 Tác phẩm phái sinh từ mã:</b> <br/>
                        {chainRecord.parentHash.slice(0,15)}...
                    </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
