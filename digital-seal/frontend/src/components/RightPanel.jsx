import React from "react";
import { Server, CheckCircle, Shield, Zap } from 'lucide-react';

export default function RightPanel({
  watermarkId,
  setWatermarkId,
  isProcessing,
  step,
  file,
  handleRegisterFlow,
  setFile,
  setPreview,
  txHash,
  sealResult,
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="bg-gradient-to-b from-[#071224] to-[#05121a] border border-gray-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Server className="text-blue-400 w-5 h-5" />
            <div>
              <div className="text-sm font-semibold text-white">Thiết lập Blockchain</div>
              <div className="text-xs text-gray-400">Chọn mạng và xác nhận giao dịch</div>
            </div>
          </div>
        </div>

        <div className="space-y-4 mb-4">
          <div>
            <label className="block text-xs text-gray-400 uppercase font-medium mb-2">Định danh tác giả</label>
            <input 
              type="text" 
              value={watermarkId}
              onChange={(e) => setWatermarkId(e.target.value)}
              disabled={isProcessing || step === 3}
              className="w-full bg-[#031018] border border-gray-800 rounded-md p-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="Ví dụ: NguyenVanA"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-md bg-[#021017] border border-gray-800 text-sm">
              <div className="font-semibold text-white">Ethereum</div>
              <div className="text-xs text-gray-400">Sepolia Testnet</div>
            </div>
            <div className="p-3 rounded-md border border-gray-800 text-sm opacity-50">
              <div className="font-semibold text-gray-300">Polygon</div>
              <div className="text-xs text-gray-500">Sắp ra mắt</div>
            </div>
          </div>

          <div className="pt-3 border-t border-gray-800 text-sm text-gray-400">
            <div className="flex justify-between"><span>Phí Gas ước tính:</span><span className="text-gray-200">~ 0.005 ETH</span></div>
            <div className="flex justify-between mt-2 font-semibold text-white"><span>Tổng cộng:</span><span className="text-blue-400">Mạng Thử nghiệm</span></div>
          </div>
        </div>

        {step === 3 ? (
           <button 
             onClick={() => { setFile(null); setPreview(null); }}
             className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold py-3 rounded-xl transition shadow-md flex items-center justify-center gap-2"
           >
             <CheckCircle className="w-5 h-5" /> Đăng ký tác phẩm khác
           </button>
        ) : (
          <button 
            onClick={handleRegisterFlow}
            disabled={!file || isProcessing}
            className={`w-full font-semibold py-3 rounded-xl transition shadow-md flex items-center justify-center gap-2
              ${!file ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 
                isProcessing ? 'bg-blue-600/60 text-white cursor-wait' : 
                'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500'}`}
          >
            {isProcessing ? (
              <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Đang xử lý...</>
            ) : (
              <><Shield className="w-5 h-5" /> Xác thực & Ghi Blockchain</>
            )}
          </button>
        )}

        <p className="text-xs text-gray-500 text-center mt-3">Nhấn để xác nhận bạn đồng ý với điều khoản sử dụng.</p>
      </div>

      {step === 3 && (
        <div className="bg-[#051b12] border border-green-800 rounded-2xl p-4">
           <h3 className="text-green-400 font-bold mb-2 flex items-center gap-2"><CheckCircle className="w-5 h-5"/> Chứng nhận Blockchain</h3>
           <div className="space-y-2 text-sm break-all text-gray-300">
              <p className="text-gray-400">Tx Hash:</p>
              <a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" className="text-blue-400 hover:underline block mb-1">{txHash?.slice(0, 24)}...</a>
              <p className="text-gray-400">Lưu trữ IPFS:</p>
              <a href={sealResult?.ipfs} target="_blank" className="text-yellow-400 hover:underline block">Xem File Gốc</a>
           </div>
        </div>
      )}

      <div className="rounded-lg p-4 bg-gradient-to-b from-[#05132a] to-[#03101d] border border-gray-800">
        <h4 className="text-blue-300 font-semibold mb-3">Lợi ích xác thực</h4>
        <ul className="space-y-2 text-sm text-gray-300">
          <li>Chứng chỉ quyền sở hữu vĩnh viễn.</li>
          <li>Bảo vệ trước AI tạo hình và Deepfake.</li>
          <li>Sẵn sàng cho giao dịch NFT thương mại.</li>
        </ul>
      </div>
    </div>
  );
}
