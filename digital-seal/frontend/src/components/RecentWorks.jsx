import React from 'react';
import { MoreHorizontal } from 'lucide-react';

export default function RecentWorks({ items = [] }) {
  return (
    <div className="rounded-lg p-3 border border-gray-800 bg-gradient-to-b from-[#041018] to-[#031017]">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-white font-semibold">Tác phẩm gần đây</h4>
        <button className="text-xs text-blue-400">Xem tất cả</button>
      </div>
      <ul className="space-y-3">
        {items.length === 0 && <li className="text-gray-400 text-sm">Chưa có tác phẩm nào</li>}
        {items.map((it, idx) => (
          <li key={idx} className="flex items-center gap-3 bg-[#07121a] border border-gray-800 rounded-md p-2">
            <div className="w-12 h-12 bg-gray-900 rounded-md overflow-hidden flex-shrink-0">
              {it.img ? <img src={it.img} alt="thumb" className="w-full h-full object-cover" /> : null}
            </div>
            <div className="flex-1 text-sm">
              <div className="text-white font-medium">{it.title}</div>
              <div className="text-xs text-gray-400">{it.subtitle}</div>
            </div>
            <div className="flex items-center gap-2">
              <div className={`text-xs ${it.status === 'Pending' ? 'text-yellow-400' : 'text-green-400'}`}>{it.status}</div>
              <MoreHorizontal className="w-4 h-4 text-gray-400" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
