import React from 'react';

export default function ChartPlaceholder({ title = 'Lượt AI Quét Bảo Vệ' }) {
  return (
    <div className="rounded-lg p-4 border border-gray-800 bg-gradient-to-b from-[#05121a] to-[#041017] shadow-inner">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-white font-semibold">{title}</h4>
        <span className="text-xs text-gray-400">7 ngày</span>
      </div>
      <div className="w-full h-36 bg-transparent rounded-md overflow-hidden flex items-end gap-2 px-2">
        {[20,40,35,60,75,50,85].map((h,i)=> (
          <div key={i} className="flex-1 bg-gradient-to-t from-blue-600 to-indigo-600 rounded-md shadow-xl" style={{height: `${h}%`}} />
        ))}
      </div>
      <div className="flex items-center justify-between text-xs text-gray-500 mt-3">
        <span>Thứ 2</span>
        <span>Thứ 3</span>
        <span>Thứ 4</span>
        <span>Thứ 5</span>
        <span>Thứ 6</span>
        <span>Thứ 7</span>
        <span>CN</span>
      </div>
    </div>
  );
}
