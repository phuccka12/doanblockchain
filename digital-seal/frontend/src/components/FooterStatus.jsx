import React from "react";
import { Activity } from 'lucide-react';

export default function FooterStatus() {
  return (
    <div className="mt-8 flex items-center justify-between text-xs text-gray-400 tracking-wide">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <div>
          <div className="font-semibold text-gray-300">BLOCKCHAIN STATUS</div>
          <div className="text-xs text-gray-500">ONLINE</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Activity className="w-4 h-4 text-blue-400" />
        <div>
          <div className="font-semibold text-gray-300">AI NODE</div>
          <div className="text-xs text-gray-500">ACTIVE</div>
        </div>
      </div>
    </div>
  );
}
