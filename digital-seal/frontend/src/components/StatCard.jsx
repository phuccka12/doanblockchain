import React from 'react';
import { Sparkles } from 'lucide-react';

export default function StatCard({ title, value, subtitle, accent = 'blue' }) {
  const accentBg = {
    blue: 'from-blue-600 to-indigo-600',
    green: 'from-green-500 to-green-600',
    red: 'from-red-500 to-red-600'
  }[accent] || 'from-blue-600 to-indigo-600';

  return (
    <div className="p-3 rounded-lg bg-gradient-to-r border border-gray-800 shadow-md">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-400">{title}</div>
          <div className="text-2xl font-bold text-white mt-1">{value}</div>
          {subtitle && <div className="text-xs text-gray-400 mt-1">{subtitle}</div>}
        </div>
        <div className={`w-10 h-10 rounded-md flex items-center justify-center bg-gradient-to-br ${accentBg}`}>
          <Sparkles className="w-5 h-5 text-white opacity-90" />
        </div>
      </div>
    </div>
  );
}
