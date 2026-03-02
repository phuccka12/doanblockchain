import React from "react";
import { Cpu } from 'lucide-react';

export default function AIProgress({ step, progress, currentTask }) {
  const p1 = step > 1 ? 100 : step === 1 ? progress : 0;
  const p2 = step > 2 ? 100 : step === 2 ? Math.max(0, (progress - 60) / 40 * 100) : 0;

  return (
    <div className="bg-gradient-to-b from-[#05101b] to-[#031018] border border-gray-800 rounded-2xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <Cpu className="text-blue-400" />
        <div>
          <div className="text-sm text-gray-300 font-semibold">Trình phân tích AI (Đang hoạt động)</div>
          <div className="text-xs text-gray-500">{step === 0 ? 'Chờ tải ảnh' : currentTask}</div>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-2">
            <span>Đang trích xuất dấu vân tay số</span>
            <span>{Math.round(p1)}%</span>
          </div>
          <div className="w-full bg-gray-900 rounded-full h-2 overflow-hidden">
            <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${p1}%` }} />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-2">
            <span>Đăng ký Smart Contract & Lưu trữ IPFS</span>
            <span>{Math.round(p2)}%</span>
          </div>
          <div className="w-full bg-gray-900 rounded-full h-2 overflow-hidden">
            <div className="bg-purple-500 h-2 rounded-full transition-all" style={{ width: `${p2}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
